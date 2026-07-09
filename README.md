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
- Suporte a ElevenLabs, Google Cloud TTS e OpenAI TTS.
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

TTS_PROVIDER_ORDER=elevenlabs,google,openai

ELEVENLABS_API_KEYS=key_1,key_2
ELEVENLABS_VOICE_IDS=voice_id_1,voice_id_2
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

GOOGLE_TTS_CREDENTIALS_B64=base64_do_json_da_service_account
GOOGLE_TTS_VOICES=pt-BR-Wavenet-A,pt-BR-Wavenet-B
GOOGLE_TTS_LANGUAGE_CODE=pt-BR
GOOGLE_TTS_AUDIO_ENCODING=MP3
GOOGLE_TTS_SPEAKING_RATE=1
GOOGLE_TTS_PITCH=0

OPENAI_API_KEYS=sk-proj-key_1,sk-proj-key_2
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Abra `http://localhost:5173` e entre com o valor de `APP_SECRET`.

## Como funciona o fallback de voz

O backend monta uma fila de candidatos a partir das variáveis de ambiente.

Exemplo:

```env
TTS_PROVIDER_ORDER=elevenlabs,google,openai
ELEVENLABS_API_KEYS=el_key_1,el_key_2
ELEVENLABS_VOICE_IDS=voice_a,voice_b
GOOGLE_TTS_CREDENTIALS_B64=base64_do_json_da_service_account
GOOGLE_TTS_VOICES=pt-BR-Wavenet-A,pt-BR-Wavenet-B
OPENAI_API_KEYS=oa_key_1
```

Ordem real de tentativa:

```txt
elevenlabs#1
elevenlabs#2
google#1
google#2
openai#1
```

Se `elevenlabs#1` falhar por crédito, limite, erro da API ou chave inválida, o backend tenta `elevenlabs#2`. Se falhar também, tenta as vozes do Google. Se o Google falhar, tenta OpenAI. O primeiro que gerar áudio com sucesso salva o MP3 e marca o trecho como pronto.

Para usar Google como motor principal de volume:

```env
TTS_PROVIDER_ORDER=google,elevenlabs,openai
```

Se quiser só Google:

```env
TTS_PROVIDER_ORDER=google
```

## Google Cloud TTS

O app aceita credenciais Google de duas formas:

```env
GOOGLE_TTS_CREDENTIALS_B64=base64_do_json_da_service_account
```

ou:

```env
GOOGLE_TTS_CREDENTIALS_JSON={"type":"service_account",...}
```

Recomendado no Render: `GOOGLE_TTS_CREDENTIALS_B64`, porque evita problema com quebra de linha da private key.

Para gerar o base64 no Windows PowerShell:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\service-account.json -Raw)))
```

Linux/macOS:

```bash
base64 -w 0 service-account.json
```

Vozes úteis para testar:

```env
GOOGLE_TTS_VOICES=pt-BR-Wavenet-A,pt-BR-Wavenet-B,pt-BR-Wavenet-C
```

## Deploy

Em produção, use um serviço com Docker e disco persistente em:

```txt
/app/server/storage
```

O Express serve API e também a PWA buildada em `client/dist`, então dá para hospedar tudo em um domínio só.

Variáveis mínimas para Google primeiro, ElevenLabs premium e OpenAI como reserva:

```env
APP_SECRET=uma-frase-grande-sua
CORS_ORIGIN=https://sua-url-publica.com
PORT=3001

TTS_PROVIDER_ORDER=google,elevenlabs,openai

GOOGLE_TTS_CREDENTIALS_B64=base64_do_json_da_service_account
GOOGLE_TTS_VOICES=pt-BR-Wavenet-A,pt-BR-Wavenet-B
GOOGLE_TTS_LANGUAGE_CODE=pt-BR
GOOGLE_TTS_AUDIO_ENCODING=MP3
GOOGLE_TTS_SPEAKING_RATE=1
GOOGLE_TTS_PITCH=0

ELEVENLABS_API_KEYS=key_1,key_2
ELEVENLABS_VOICE_IDS=voice_id_1,voice_id_2
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128

OPENAI_API_KEYS=sk-proj-key_1
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
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
