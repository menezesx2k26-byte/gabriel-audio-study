# Coisas para fazer com a MH

Lista compartilhada, mobile-first, para Gabriel e Maria Helena guardarem filmes, lugares, comidas, rolês e outras ideias.

## O que tem

- Mesma lista nos dois celulares por um link secreto
- Identificação de quem adicionou: Gabriel ou Maria Helena
- Adicionar, editar, concluir e apagar ideias
- Categorias, busca e filtros
- Compartilhamento do acesso pelo WhatsApp/Android
- Exportação e importação JSON
- PWA instalável e cache local para leitura sem internet
- Persistência consistente com Cloudflare Durable Objects

## Desenvolvimento

```bash
npm install
npm run dev
```

## Publicação no Cloudflare Workers

```bash
npm run deploy
```

O Wrangler publica o Worker e os arquivos estáticos juntos. O Durable Object SQLite é criado pela migração `v1`.

## Privacidade

O identificador da lista fica no parâmetro `?s=`. Ele funciona como uma chave de acesso: qualquer pessoa com o link consegue ver e editar a lista. Não há login nem coleta de dados pessoais além do conteúdo que os usuários escreverem.
