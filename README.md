# Gabriel Audio Study MVP

PWA privada para transformar PDF ou texto em áudio com voz premium, sem você ficar caçando MP3.

## O que tem

- Login simples com `APP_SECRET`.
- Upload de PDF.
- Texto colado.
- Quebra automática em partes.
- Geração de áudio sob demanda.
- MP3 salvo de forma invisível em `server/storage/audio`.
- Biblioteca + player: abrir material, dar play e continuar parte por parte.
- Fallback automático de TTS: tenta provedores em ordem.
- Suporte atual: Amazon Polly, ElevenLabs, Google Cloud TTS e OpenAI TTS.
- Dockerfile e `render.yaml` para deploy.

## Estado atual recomendado

O app está pensado para rodar assim:

```txt
Amazon Polly Camila Generative -> ElevenLabs -> OpenAI opcional
```

No Render, o principal é preencher as variáveis abaixo. Não existe senha pronta no GitHub. O `APP_SECRET` é uma senha que você inventa no Render e depois usa para entrar no app.

## Variáveis do Render

Obrigatórias para login e app:

```env
APP_SECRET=crie_uma_senha_sua_aqui
CORS_ORIGIN=https://gabriel-audio-study.onrender.com
PORT=3001
TTS_PROVIDER_ORDER=polly,elevenlabs,openai
```

Amazon Polly, voz principal:

```env
AWS_POLLY_ACCESS_KEY_IDS=cole_o_access_key_id_do_iam
AWS_POLLY_SECRET_ACCESS_KEYS=cole_o_secret_access_key_do_iam
AWS_POLLY_REGIONS=us-east-1
AWS_POLLY_VOICES=Camila
AWS_POLLY_ENGINE=generative
AWS_POLLY_OUTPUT_FORMAT=mp3
AWS_POLLY_SAMPLE_RATE=24000
```

ElevenLabs, fallback premium:

```env
ELEVENLABS_API_KEYS=cole_a_key_da_elevenlabs
ELEVENLABS_VOICE_IDS=cole_o_voice_id_da_voz
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_OUTPUT_FORMAT=mp3_44100_128
```

OpenAI é opcional. Se não colocar chave, o app ignora:

```env
OPENAI_API_KEYS=
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Google Cloud TTS também é opcional e pode ficar fora enquanto exigir pré-autorização:

```env
GOOGLE_TTS_CREDENTIALS_B64=
GOOGLE_TTS_VOICES=pt-BR-Wavenet-A,pt-BR-Wavenet-B
GOOGLE_TTS_LANGUAGE_CODE=pt-BR
GOOGLE_TTS_AUDIO_ENCODING=MP3
GOOGLE_TTS_SPEAKING_RATE=1
GOOGLE_TTS_PITCH=0
```

## Como funciona o login

Ao abrir o app, ele pede `APP_SECRET`.

Se no Render você colocou:

```env
APP_SECRET=minha_senha_privada
```

então a senha para entrar no app é:

```txt
minha_senha_privada
```

Se `APP_SECRET` não existir no Render, nenhuma senha funciona.

## Como funciona o fallback de voz

Com:

```env
TTS_PROVIDER_ORDER=polly,elevenlabs,openai
AWS_POLLY_VOICES=Camila
ELEVENLABS_API_KEYS=preenchido
ELEVENLABS_VOICE_IDS=preenchido
```

A fila real fica:

```txt
polly#1.Camila
elevenlabs#1
```

Se Polly falhar por crédito, permissão, limite ou erro de API, ele tenta ElevenLabs. Se OpenAI estiver configurado, ela vira o próximo fallback.

## Health check

Depois do deploy, acesse:

```txt
https://gabriel-audio-study.onrender.com/health
```

O esperado é algo parecido com:

```json
{
  "ok": true,
  "service": "gabriel-audio-study",
  "ttsProviderOrder": ["polly", "elevenlabs", "openai"],
  "ttsCandidates": ["polly#1.Camila", "elevenlabs#1"]
}
```

## Rodar local

```bash
npm run install:all
cp server/.env.example server/.env
npm run dev:server
npm run dev:client
```

Abra `http://localhost:5173` e entre com o valor de `APP_SECRET`.

## Deploy

Em produção, use Docker e disco persistente em:

```txt
/app/server/storage
```

O Express serve API e também a PWA buildada em `client/dist`, então dá para hospedar tudo em um domínio só.

## Próximos upgrades

- Gerar próximas partes em background.
- Estimar custo antes de gerar livro inteiro.
- Modo aula/resumo/revisão.
- EPUB.
- Cache por hash.
- Banco Postgres/SQLite.
- Cloudflare R2/S3 quando o acervo crescer.
