import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const TOKEN_KEY = "gas_token";
const TTS_LABEL_KEY = "gas_tts_label";

function authHeaders(token, extra = {}) {
  return { ...extra, Authorization: `Bearer ${token}` };
}

async function apiJson(path, token, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders(token, { "Content-Type": "application/json", ...(options.headers || {}) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Erro inesperado");
  return data;
}

function progressKey(bookId) {
  return `gas_progress_${bookId}`;
}

function loadProgress(bookId) {
  try {
    return JSON.parse(localStorage.getItem(progressKey(bookId))) || { chunkIndex: 0, time: 0 };
  } catch {
    return { chunkIndex: 0, time: 0 };
  }
}

function saveProgress(bookId, chunkIndex, time) {
  localStorage.setItem(progressKey(bookId), JSON.stringify({ chunkIndex, time, updatedAt: Date.now() }));
}

function Login({ onLogin }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      await apiJson("/api/auth/check", token, { method: "POST" });
      localStorage.setItem(TOKEN_KEY, token);
      onLogin(token);
    } catch (err) {
      setError(err.message);
    }
  }

  return <main className="screen center"><section className="card login"><h1>Audio Study</h1><p>Teu leitor privado de PDF/texto com voz de estudo.</p><form onSubmit={submit} className="stack"><input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="APP_SECRET" autoFocus />{error && <p className="error">{error}</p>}<button disabled={!token}>Entrar</button></form></section></main>;
}

function Library({ token, openBook }) {
  const [books, setBooks] = useState([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    const data = await apiJson("/api/books", token);
    setBooks(data.books || []);
  }

  useEffect(() => { refresh().catch((err) => setError(err.message)); }, []);

  async function addText(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true); setError("");
    try {
      await apiJson("/api/books/text", token, { method: "POST", body: JSON.stringify({ title: title || "Texto colado", text }) });
      setTitle(""); setText(""); await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function addPdf(e) {
    e.preventDefault();
    if (!file) return;
    setBusy(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("title", title || file.name.replace(/\.pdf$/i, ""));
      const response = await fetch(`${API_BASE}/api/books/pdf`, { method: "POST", headers: authHeaders(token), body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Erro ao subir PDF");
      setTitle(""); setFile(null); e.target.reset(); await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function deleteBook(id) {
    if (!confirm("Apagar material e áudios?")) return;
    await apiJson(`/api/books/${id}`, token, { method: "DELETE" });
    await refresh();
  }

  return <main className="screen"><header className="top"><div><h1>Biblioteca</h1><p>Livro → play → continua de onde parou.</p></div><button className="ghost" onClick={refresh}>Atualizar</button></header>{error && <p className="error">{error}</p>}<section className="grid"><form className="card stack" onSubmit={addPdf}><h2>Subir PDF</h2><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título opcional" /><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /><button disabled={busy || !file}>{busy ? "Criando..." : "Adicionar PDF"}</button></form><form className="card stack" onSubmit={addText}><h2>Colar texto</h2><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Cole lei seca, capítulo, resumo..." /><button disabled={busy || !text.trim()}>{busy ? "Criando..." : "Adicionar texto"}</button></form></section><section className="list">{books.map((book) => <article className="book" key={book.id}><button className="book-main" onClick={() => openBook(book.id)}><strong>{book.title}</strong><span>{book.readyChunks}/{book.totalChunks} partes prontas</span></button><button className="danger" onClick={() => deleteBook(book.id)}>Apagar</button></article>)}</section></main>;
}

function Player({ token, bookId, back }) {
  const audioRef = useRef(null);
  const [book, setBook] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [ttsOptions, setTtsOptions] = useState([]);
  const [ttsLabel, setTtsLabel] = useState(localStorage.getItem(TTS_LABEL_KEY) || "auto");

  useEffect(() => {
    Promise.all([
      apiJson(`/api/books/${bookId}`, token),
      apiJson("/api/tts/candidates", token).catch(() => ({ candidates: [] }))
    ]).then(([bookData, ttsData]) => {
      const progress = loadProgress(bookId);
      setBook(bookData.book);
      setChunks(bookData.chunks || []);
      setTtsOptions(ttsData.candidates || []);
      setIdx(progress.chunkIndex || 0);
      setLoading(false);
      setTimeout(() => { if (audioRef.current) audioRef.current.currentTime = progress.time || 0; }, 250);
    }).catch((err) => { setMessage(err.message); setLoading(false); });
  }, [bookId]);

  const chunk = chunks[idx];
  const src = chunk ? `${API_BASE}/api/books/${bookId}/chunks/${chunk.id}/audio?token=${encodeURIComponent(token)}&speed=${speed}&ttsLabel=${encodeURIComponent(ttsLabel)}` : "";

  function persist() {
    if (audioRef.current) saveProgress(bookId, idx, audioRef.current.currentTime || 0);
  }

  function changeVoice(value) {
    setTtsLabel(value);
    localStorage.setItem(TTS_LABEL_KEY, value);
    setMessage(value === "auto" ? "Modo automático: usa a ordem de fallback." : `Voz selecionada: ${value}`);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute("src");
      audioRef.current.load();
    }
  }

  async function play() {
    setMessage("Gerando/tocando áudio...");
    audioRef.current.src = src;
    await audioRef.current.play();
    setMessage("");
  }

  function next() { if (idx < chunks.length - 1) { persist(); setIdx(idx + 1); } }
  function prev() { if (idx > 0) { persist(); setIdx(idx - 1); } }

  return <main className="screen"><button className="ghost" onClick={back}>← Biblioteca</button>{loading ? <p>Carregando...</p> : <section className="card player"><h1>{book?.title}</h1><p>Parte {idx + 1} de {chunks.length}: {chunk?.title}</p><p className="preview">{chunk?.textPreview}</p><div className="settings-row"><label>Voz<select value={ttsLabel} onChange={(e) => changeVoice(e.target.value)}><option value="auto">Automático / fallback</option>{ttsOptions.map((option) => <option key={option.label} value={option.label}>{option.displayName || option.label}</option>)}</select></label><label>Velocidade<select value={speed} onChange={(e) => { const value = Number(e.target.value); setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value; }}><option value="1">1x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option><option value="2">2x</option></select></label></div><audio ref={audioRef} controls onTimeUpdate={persist} onEnded={next} onLoadedMetadata={() => { audioRef.current.playbackRate = speed; }} /><div className="controls"><button onClick={prev} disabled={idx === 0}>Anterior</button><button onClick={() => { audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15); }}>-15s</button><button onClick={play}>Play</button><button onClick={() => { audioRef.current.currentTime += 30; }}>+30s</button><button onClick={next} disabled={idx >= chunks.length - 1}>Próxima</button></div>{message && <p>{message}</p>}</section>}</main>;
}

function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [bookId, setBookId] = useState(null);
  if (!token) return <Login onLogin={setToken} />;
  if (bookId) return <Player token={token} bookId={bookId} back={() => setBookId(null)} />;
  return <Library token={token} openBook={setBookId} />;
}

createRoot(document.getElementById("root")).render(<App />);
