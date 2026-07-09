import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import textToSpeech from "@google-cloud/text-to-speech";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import OpenAI from "openai";
import pdfParse from "pdf-parse";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const storageDir = path.join(serverRoot, "storage");
const audioDir = path.join(storageDir, "audio");
const uploadDir = path.join(storageDir, "uploads");
const dbPath = path.join(storageDir, "db.json");
const clientDistDir = path.resolve(serverRoot, "..", "client", "dist");

const app = express();
const upload = multer({ dest: uploadDir, limits: { fileSize: 30 * 1024 * 1024 } });

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const APP_SECRET = process.env.APP_SECRET;

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseGoogleCredentials(value) {
  if (!value) return null;

  const raw = String(value).trim();
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return JSON.parse(raw);
  }
}

const TTS_PROVIDER_ORDER = parseList(process.env.TTS_PROVIDER_ORDER || process.env.TTS_PROVIDER || "elevenlabs,google,openai")
  .map((provider) => provider.toLowerCase());

const OPENAI_API_KEYS = parseList(process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY);
const TTS_MODEL = process.env.TTS_MODEL || "gpt-4o-mini-tts";
const TTS_VOICE = process.env.TTS_VOICE || "marin";

const ELEVENLABS_API_KEYS = parseList(process.env.ELEVENLABS_API_KEYS || process.env.ELEVENLABS_API_KEY);
const ELEVENLABS_VOICE_IDS = parseList(process.env.ELEVENLABS_VOICE_IDS || process.env.ELEVENLABS_VOICE_ID);
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const ELEVENLABS_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || "mp3_44100_128";

const GOOGLE_TTS_CREDENTIALS = parseGoogleCredentials(process.env.GOOGLE_TTS_CREDENTIALS_B64 || process.env.GOOGLE_TTS_CREDENTIALS_JSON || "");
const GOOGLE_TTS_VOICES = parseList(process.env.GOOGLE_TTS_VOICES || process.env.GOOGLE_TTS_VOICE || "pt-BR-Wavenet-A");
const GOOGLE_TTS_LANGUAGE_CODE = process.env.GOOGLE_TTS_LANGUAGE_CODE || "pt-BR";
const GOOGLE_TTS_AUDIO_ENCODING = process.env.GOOGLE_TTS_AUDIO_ENCODING || "MP3";
const GOOGLE_TTS_SPEAKING_RATE = Number(process.env.GOOGLE_TTS_SPEAKING_RATE || 1);
const GOOGLE_TTS_PITCH = Number(process.env.GOOGLE_TTS_PITCH || 0);

function buildTtsCandidates() {
  const candidates = [];

  for (const provider of TTS_PROVIDER_ORDER) {
    if (provider === "elevenlabs") {
      ELEVENLABS_API_KEYS.forEach((apiKey, index) => {
        const voiceId = ELEVENLABS_VOICE_IDS[index] || ELEVENLABS_VOICE_IDS[0];
        if (!voiceId) return;
        candidates.push({
          provider: "elevenlabs",
          label: `elevenlabs#${index + 1}`,
          apiKey,
          voiceId,
          model: ELEVENLABS_MODEL_ID,
          outputFormat: ELEVENLABS_OUTPUT_FORMAT
        });
      });
    }

    if (provider === "google") {
      if (GOOGLE_TTS_CREDENTIALS) {
        GOOGLE_TTS_VOICES.forEach((voice, index) => {
          candidates.push({
            provider: "google",
            label: `google#${index + 1}`,
            credentials: GOOGLE_TTS_CREDENTIALS,
            voice,
            languageCode: GOOGLE_TTS_LANGUAGE_CODE,
            audioEncoding: GOOGLE_TTS_AUDIO_ENCODING,
            speakingRate: GOOGLE_TTS_SPEAKING_RATE,
            pitch: GOOGLE_TTS_PITCH
          });
        });
      }
    }

    if (provider === "openai") {
      OPENAI_API_KEYS.forEach((apiKey, index) => {
        candidates.push({
          provider: "openai",
          label: `openai#${index + 1}`,
          apiKey,
          model: TTS_MODEL,
          voice: TTS_VOICE
        });
      });
    }
  }

  return candidates;
}

const TTS_CANDIDATES = buildTtsCandidates();

app.use(cors({ origin: CORS_ORIGIN === "*" ? true : CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));

async function ensureStorage() {
  await fs.mkdir(audioDir, { recursive: true });
  await fs.mkdir(uploadDir, { recursive: true });
  try {
    await fs.access(dbPath);
  } catch {
    await fs.writeFile(dbPath, JSON.stringify({ books: [], chunks: [] }, null, 2));
  }
}

async function readDb() {
  await ensureStorage();
  return JSON.parse(await fs.readFile(dbPath, "utf-8"));
}

async function writeDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

function getToken(req) {
  return req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.query.token;
}

function requireAuth(req, res, next) {
  if (!APP_SECRET) return res.status(500).json({ error: "APP_SECRET não configurado." });
  if (getToken(req) !== APP_SECRET) return res.status(401).json({ error: "Não autorizado." });
  next();
}

function normalizeText(text) {
  return String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function splitText(text, maxChars = 3200) {
  const paragraphs = normalizeText(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const p of paragraphs) {
    if (p.length > maxChars) {
      if (current) chunks.push(current);
      current = "";
      for (let i = 0; i < p.length; i += maxChars) chunks.push(p.slice(i, i + maxChars).trim());
      continue;
    }
    if ((current + "\n\n" + p).length > maxChars) {
      if (current) chunks.push(current);
      current = p;
    } else {
      current = current ? `${current}\n\n${p}` : p;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function makeBook({ title, sourceType, text }) {
  const parts = splitText(text);
  if (!parts.length) throw new Error("Não consegui extrair texto suficiente.");
  const now = new Date().toISOString();
  const bookId = nanoid(12);
  return {
    book: { id: bookId, title: title?.trim() || "Material sem título", sourceType, createdAt: now, updatedAt: now, totalChunks: parts.length },
    chunks: parts.map((chunkText, index) => ({
      id: nanoid(14),
      bookId,
      orderIndex: index,
      title: `Parte ${index + 1}`,
      text: chunkText,
      audioFile: null,
      status: "pending",
      ttsProvider: null,
      ttsLabel: null,
      createdAt: now,
      updatedAt: now
    }))
  };
}

function audioPath(chunkId) {
  return path.join(audioDir, `${chunkId}.mp3`);
}

async function generateWithOpenAI(candidate, chunk, query = {}) {
  const openai = new OpenAI({ apiKey: candidate.apiKey });
  const mp3 = await openai.audio.speech.create({
    model: candidate.model,
    voice: query.voice || candidate.voice,
    input: chunk.text,
    instructions: "Leia em português brasileiro, com ritmo natural de professor de cursinho, pausas claras e dicção limpa.",
    response_format: "mp3",
    speed: Number(query.speed || 1)
  });
  return Buffer.from(await mp3.arrayBuffer());
}

async function generateWithElevenLabs(candidate, chunk) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${candidate.voiceId}?output_format=${candidate.outputFormat}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": candidate.apiKey,
      "Content-Type": "application/json",
      "Accept": "audio/mpeg"
    },
    body: JSON.stringify({
      text: chunk.text,
      model_id: candidate.model,
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.75,
        style: 0.15,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    const error = new Error(`Erro ElevenLabs ${response.status}: ${details.slice(0, 300)}`);
    error.status = response.status;
    throw error;
  }

  return Buffer.from(await response.arrayBuffer());
}

async function generateWithGoogle(candidate, chunk) {
  const client = new textToSpeech.TextToSpeechClient({ credentials: candidate.credentials });
  const [response] = await client.synthesizeSpeech({
    input: { text: chunk.text },
    voice: {
      languageCode: candidate.languageCode,
      name: candidate.voice
    },
    audioConfig: {
      audioEncoding: candidate.audioEncoding,
      speakingRate: candidate.speakingRate,
      pitch: candidate.pitch
    }
  });

  if (!response.audioContent) throw new Error("Google TTS não retornou audioContent.");
  return Buffer.from(response.audioContent);
}

async function generateFromCandidate(candidate, chunk, query = {}) {
  if (candidate.provider === "elevenlabs") return generateWithElevenLabs(candidate, chunk);
  if (candidate.provider === "google") return generateWithGoogle(candidate, chunk);
  if (candidate.provider === "openai") return generateWithOpenAI(candidate, chunk, query);
  throw new Error(`Provider não suportado: ${candidate.provider}`);
}

async function generateAudio(chunk, query = {}) {
  if (!TTS_CANDIDATES.length) {
    throw new Error("Nenhum provedor TTS configurado. Configure ELEVENLABS_API_KEYS/ELEVENLABS_VOICE_IDS, GOOGLE_TTS_CREDENTIALS_B64/JSON ou OPENAI_API_KEYS.");
  }

  const failures = [];

  for (const candidate of TTS_CANDIDATES) {
    try {
      console.log(`Tentando TTS: ${candidate.label}`);
      const buffer = await generateFromCandidate(candidate, chunk, query);
      await fs.writeFile(audioPath(chunk.id), buffer);
      return { provider: candidate.provider, label: candidate.label };
    } catch (error) {
      const reason = error?.message || String(error);
      failures.push(`${candidate.label}: ${reason}`);
      console.warn(`Falha em ${candidate.label}; tentando próximo fallback.`, reason);
    }
  }

  throw new Error(`Todos os provedores TTS falharam. ${failures.join(" | ")}`);
}

app.get("/health", (_req, res) => res.json({
  ok: true,
  service: "gabriel-audio-study",
  ttsProviderOrder: TTS_PROVIDER_ORDER,
  ttsCandidates: TTS_CANDIDATES.map((candidate) => candidate.label)
}));
app.post("/api/auth/check", requireAuth, (_req, res) => res.json({ ok: true }));

app.get("/api/books", requireAuth, async (_req, res) => {
  const db = await readDb();
  const books = db.books.map((book) => {
    const chunks = db.chunks.filter((c) => c.bookId === book.id);
    return { ...book, readyChunks: chunks.filter((c) => c.status === "ready").length };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ books });
});

app.get("/api/books/:bookId", requireAuth, async (req, res) => {
  const db = await readDb();
  const book = db.books.find((b) => b.id === req.params.bookId);
  if (!book) return res.status(404).json({ error: "Material não encontrado." });
  const chunks = db.chunks.filter((c) => c.bookId === book.id).sort((a, b) => a.orderIndex - b.orderIndex).map((c) => ({
    id: c.id,
    orderIndex: c.orderIndex,
    title: c.title,
    status: c.status,
    ttsProvider: c.ttsProvider,
    ttsLabel: c.ttsLabel,
    textPreview: c.text.slice(0, 180)
  }));
  res.json({ book, chunks });
});

app.post("/api/books/text", requireAuth, async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!text) return res.status(400).json({ error: "Texto obrigatório." });
    const db = await readDb();
    const { book, chunks } = makeBook({ title, sourceType: "text", text });
    db.books.push(book);
    db.chunks.push(...chunks);
    await writeDb(db);
    res.status(201).json({ book });
  } catch (error) {
    res.status(400).json({ error: error.message || "Erro ao criar material." });
  }
});

app.post("/api/books/pdf", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "PDF obrigatório." });
    const parsed = await pdfParse(await fs.readFile(req.file.path));
    await fs.unlink(req.file.path).catch(() => {});
    const title = req.body.title || req.file.originalname.replace(/\.pdf$/i, "");
    const db = await readDb();
    const { book, chunks } = makeBook({ title, sourceType: "pdf", text: parsed.text });
    db.books.push(book);
    db.chunks.push(...chunks);
    await writeDb(db);
    res.status(201).json({ book });
  } catch (error) {
    if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
    res.status(400).json({ error: error.message || "Erro ao processar PDF." });
  }
});

app.get("/api/books/:bookId/chunks/:chunkId/audio", requireAuth, async (req, res) => {
  try {
    const db = await readDb();
    const chunk = db.chunks.find((c) => c.bookId === req.params.bookId && c.id === req.params.chunkId);
    if (!chunk) return res.status(404).json({ error: "Trecho não encontrado." });
    try {
      await fs.access(audioPath(chunk.id));
    } catch {
      chunk.status = "generating";
      await writeDb(db);
      const result = await generateAudio(chunk, req.query);
      chunk.status = "ready";
      chunk.audioFile = `${chunk.id}.mp3`;
      chunk.ttsProvider = result.provider;
      chunk.ttsLabel = result.label;
      chunk.updatedAt = new Date().toISOString();
      await writeDb(db);
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    createReadStream(audioPath(chunk.id)).pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || "Erro ao gerar áudio." });
  }
});

app.delete("/api/books/:bookId", requireAuth, async (req, res) => {
  const db = await readDb();
  const chunks = db.chunks.filter((c) => c.bookId === req.params.bookId);
  db.books = db.books.filter((b) => b.id !== req.params.bookId);
  db.chunks = db.chunks.filter((c) => c.bookId !== req.params.bookId);
  await writeDb(db);
  await Promise.all(chunks.map((c) => fs.unlink(audioPath(c.id)).catch(() => {})));
  res.json({ ok: true });
});

async function serveClient() {
  try {
    await fs.access(path.join(clientDistDir, "index.html"));
  } catch {
    return false;
  }
  app.use(express.static(clientDistDir, { maxAge: "7d", etag: true }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(clientDistDir, "index.html"));
  });
  return true;
}

ensureStorage().then(async () => {
  const servingClient = await serveClient();
  app.listen(PORT, () => {
    console.log(`Gabriel Audio Study rodando em http://localhost:${PORT}`);
    console.log(`TTS candidates: ${TTS_CANDIDATES.map((candidate) => candidate.label).join(", ") || "nenhum"}`);
    console.log(servingClient ? "PWA servida pelo Express." : "client/dist não encontrado; rode o client em dev ou build.");
  });
});
