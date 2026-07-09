# Gabriel Audio Study MVP

PWA privada para transformar PDF ou texto em áudio com vozes premium, sem você ficar caçando MP3.

## O que tem

- Login simples com `APP_SECRET`.
- Upload de PDF.
- Texto colado.
- Quebra automática em partes.
- Geração de áudio sob demanda.
- MP3 salvo de forma invisível em `server/storage/audio`.
- Biblioteca + player: abrir material, dar play e continuar parte por parte.
- Fallback automático de TTS: tenta várias chaves/provedores em ordem.
- Suporte a ElevenLabs e OpenAI TTS.
- Dockerfile e `render.yaml` para deploy.

## Rodar local

```bash
npm run install:all
cp server/.env.example server/.env
npm run dev:server
npm run dev:client
```

Edite `server/.env` antes de rodar:

```env
APP_SECRET=uma-senha-grande-sua
CORS_ORIGIN=http://localhost:5173
PORT=3001

TTS_PROVIDER_ORDER=elevenlabs,openai

ELEVENLABS_API_KEYS=key_1,key_2
ELEVENLABS_VOICE_IDS=voice_id_1,voice_id_2
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

OPENAI_API_KEYS=sk-proj-key_1,sk-proj-key_2
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Abra `http://localhost:5173` e entre com o valor de `APP_SECRET`.

## Como funciona o fallback de voz

O backend monta uma fila de candidatos a partir das variáveis de ambiente.

Exemplo:

```env
TTS_PROVIDER_ORDER=elevenlabs,openai
ELEVENLABS_API_KEYS=el_key_1,el_key_2
ELEVENLABS_VOICE_IDS=voice_a,voice_b
OPENAI_API_KEYS=oa_key_1
```

Ordem real de tentativa:

```txt
elevenlabs#1
elevenlabs#2
openai#1
```

Se `elevenlabs#1` falhar por crédito, limite, erro da API ou chave inválida, o backend tenta `elevenlabs#2`. Se falhar também, tenta `openai#1`. O primeiro que gerar áudio com sucesso salva o MP3 e marca o trecho como pronto.

Para inverter prioridade:

```env
TTS_PROVIDER_ORDER=openai,elevenlabs
```

Se você usar várias chaves ElevenLabs e só um `ELEVENLABS_VOICE_ID`, essa mesma voz é usada em todas as chaves.

## Deploy

Em produção, use um serviço com Docker e disco persistente em:

```txt
/app/server/storage
```

O Express serve API e também a PWA buildada em `client/dist`, então dá para hospedar tudo em um domínio só.

Variáveis mínimas para ElevenLabs primeiro e OpenAI como reserva:

```env
APP_SECRET=uma-frase-grande-sua
CORS_ORIGIN=https://sua-url-publica.com
PORT=3001

TTS_PROVIDER_ORDER=elevenlabs,openai
ELEVENLABS_API_KEYS=key_1,key_2
ELEVENLABS_VOICE_IDS=voice_id_1,voice_id_2
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

OPENAI_API_KEYS=sk-proj-key_1
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Se quiser só ElevenLabs, remova `openai` da ordem:

```env
TTS_PROVIDER_ORDER=elevenlabs
```

## Health check

Acesse:

```txt
/health
```

Ele mostra a ordem e os candidatos de TTS configurados, sem expor as chaves.

## Próximos upgrades

- Gerar próximas partes em background.
- Estimar custo antes de gerar livro inteiro.
- Modo aula/resumo/revisão.
- EPUB.
- Cache por hash.
- Banco Postgres/SQLite.
- Cloudflare R2/S3 quando o acervo crescer.
