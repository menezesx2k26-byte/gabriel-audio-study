# Gabriel Audio Study MVP

PWA privada para transformar PDF ou texto em áudio com OpenAI Text-to-Speech, sem você ficar caçando MP3.

## O que tem

- Login simples com `APP_SECRET`.
- Upload de PDF.
- Texto colado.
- Quebra automática em partes.
- Geração de áudio sob demanda.
- MP3 salvo de forma invisível em `server/storage/audio`.
- Biblioteca + player: abrir material, dar play e continuar parte por parte.
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
OPENAI_API_KEY=sk-proj-...
APP_SECRET=uma-senha-grande-sua
CORS_ORIGIN=http://localhost:5173
PORT=3001
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Abra `http://localhost:5173` e entre com o valor de `APP_SECRET`.

## Deploy

Em produção, use um serviço com Docker e disco persistente em:

```txt
/app/server/storage
```

O Express serve API e também a PWA buildada em `client/dist`, então dá para hospedar tudo em um domínio só.

Variáveis necessárias:

```env
OPENAI_API_KEY=sk-proj-...
APP_SECRET=uma-frase-grande-sua
CORS_ORIGIN=https://sua-url-publica.com
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
PORT=3001
```

## Próximos upgrades

- Gerar próximas partes em background.
- Estimar custo antes de gerar livro inteiro.
- Modo aula/resumo/revisão.
- EPUB.
- Cache por hash.
- Banco Postgres/SQLite.
- Cloudflare R2/S3 quando o acervo crescer.
