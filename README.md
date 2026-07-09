# Gabriel Audio Study MVP

PWA privada para transformar PDF ou texto em áudio com OpenAI Text-to-Speech, sem você ficar caçando MP3. O app mostra biblioteca, material, parte atual e player; por baixo ele salva os áudios em `server/storage/audio` e guarda metadados em `server/storage/db.json`.

## O que tem nesta versão

- Login simples por token pessoal (`APP_SECRET`).
- Upload de PDF.
- Entrada de texto colado.
- Quebra automática em partes.
- Geração de áudio sob demanda: a parte só vira MP3 quando você aperta play nela.
- Storage invisível em pasta local do servidor.
- Player com voltar 15s, avançar 30s, velocidade e progresso salvo no navegador.
- PWA instalável no Android via Chrome: "Adicionar à tela inicial".

## Requisitos

- Node.js 20+ recomendado.
- Conta/API key da OpenAI.

A API oficial de speech da OpenAI usa o endpoint `/v1/audio/speech`; o guia atual recomenda `gpt-4o-mini-tts`, e a documentação lista vozes como `marin` e `cedar`, recomendadas para melhor qualidade.

## Instalação local para testar

```bash
npm run install:all
cp server/.env.example server/.env
```

Edite `server/.env`:

```env
OPENAI_API_KEY=sk-proj-...
APP_SECRET=uma-senha-grande-sua
CORS_ORIGIN=http://localhost:5173
PORT=3001
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
```

Rode em dois terminais:

```bash
npm run dev:server
```

```bash
npm run dev:client
```

Abra:

```txt
http://localhost:5173
```

Entre usando o valor de `APP_SECRET`.

## Como usar no celular sem rodar local

Para uso real no celular, hospede server + client em uma VPS ou serviço Node com disco persistente. O storage desta versão é o filesystem do servidor; em plataformas com disco efêmero, os MP3s podem sumir em redeploy/restart.

Caminho recomendado:

1. Subir o projeto em uma VPS simples.
2. Rodar `npm --prefix client run build`.
3. Servir o `client/dist` com Nginx ou adaptar o Express para servir os arquivos estáticos.
4. Configurar HTTPS.
5. Abrir o site no Chrome Android.
6. Tocar em "Adicionar à tela inicial".

## Deploy de produção: ajuste obrigatório

Em produção, defina `CORS_ORIGIN` como o domínio real da PWA:

```env
CORS_ORIGIN=https://seu-dominio.com
```

E use um `APP_SECRET` grande, tipo frase aleatória.


## Onde fica o servidor?

Este pacote não vem hospedado. Ele é o código do app. Localmente, o client chama `localhost:3001`. Para usar no celular como app real, você precisa hospedar o backend em uma VPS/Render/Railway/Fly/Hostinger VPS etc.

Nesta versão atualizada, o Express também serve o `client/dist` em produção. Então dá para hospedar **um serviço só**:

```txt
https://seu-app.com        -> PWA / interface
https://seu-app.com/api    -> backend
https://seu-app.com/health -> health check
```

Ou seja: quando estiver hospedado, `VITE_API_BASE` pode ficar vazio, porque o frontend chama a API no mesmo domínio.

## Deploy simples com Docker

1. Suba esta pasta para um repositório privado no GitHub.
2. Crie um Web Service com Docker no provedor escolhido.
3. Configure as variáveis de ambiente:

```env
OPENAI_API_KEY=sk-proj-...
APP_SECRET=uma-frase-grande-sua
CORS_ORIGIN=https://sua-url-publica.com
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=marin
PORT=3001
```

4. Garanta disco persistente montado em:

```txt
/app/server/storage
```

Sem disco persistente, o app roda, mas os PDFs/MP3s podem sumir quando o servidor reiniciar/redeployar.

## Deploy no Render com render.yaml

Incluí `render.yaml` como exemplo. Antes de usar, troque:

```env
CORS_ORIGIN=https://troque-pelo-seu-dominio-ou-url-do-render
```

pela URL real do teu app depois do primeiro deploy. Também configure `OPENAI_API_KEY` e `APP_SECRET` como secrets, nunca dentro do Git.


## Próximas melhorias boas

- Servir `client/dist` pelo Express em produção.
- Botão "gerar próximas 3 partes" para evitar delay no meio da caminhada/esteira.
- Estimar custo antes de gerar tudo.
- Modo "leitura fiel" vs "professor de cursinho".
- EPUB.
- Cache por hash para não regenerar o mesmo trecho em materiais repetidos.
- Banco SQLite/Postgres no lugar de JSON.
- Cloudflare R2/S3 quando o acervo crescer.
- Media Session API para controles na tela bloqueada.
