import { DurableObject } from 'cloudflare:workers';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function cleanText(value, max = 180) {
  return String(value ?? '').trim().slice(0, max);
}

function normalizeItem(raw) {
  const text = cleanText(raw?.text);
  if (!text) return null;
  const categories = new Set(['Filme', 'Lugar', 'Comida', 'Rolê', 'Ideia', 'Outro']);
  const timings = new Set(['Algum dia', 'Em breve', 'Próxima vez']);
  return {
    id: typeof raw?.id === 'string' && raw.id.length <= 80 ? raw.id : crypto.randomUUID(),
    text,
    author: raw?.author === 'MH' ? 'MH' : 'G',
    category: categories.has(raw?.category) ? raw.category : 'Outro',
    timing: timings.has(raw?.timing) ? raw.timing : 'Algum dia',
    done: Boolean(raw?.done),
    createdAt: raw?.createdAt && !Number.isNaN(Date.parse(raw.createdAt)) ? raw.createdAt : new Date().toISOString()
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{24,64})$/);
    if (match) {
      const id = env.ROOMS.idFromName(match[1]);
      return env.ROOMS.get(id).fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    return env.ASSETS.fetch(request);
  }
};

export class SharedList extends DurableObject {
  async state() {
    let state = await this.ctx.storage.get('state');
    if (!state) {
      state = {
        version: 1,
        items: [{
          id: crypto.randomUUID(),
          text: 'Assistir Affection juntos e ver quem descobre o plot primeiro',
          author: 'G',
          category: 'Filme',
          timing: 'Algum dia',
          done: false,
          createdAt: new Date().toISOString()
        }]
      };
      await this.ctx.storage.put('state', state);
    }
    return state;
  }

  async fetch(request) {
    if (request.method === 'GET') return json(await this.state());
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'invalid_json' }, 400);
    }

    const state = await this.state();
    if (Number(body.expectedVersion) !== state.version) return json({ error: 'conflict', ...state }, 409);

    const payload = body.payload ?? {};
    switch (body.action) {
      case 'add': {
        if (state.items.length >= 300) return json({ error: 'limit_reached' }, 400);
        const item = normalizeItem(payload);
        if (!item) return json({ error: 'empty_text' }, 400);
        item.id = crypto.randomUUID();
        item.done = false;
        item.createdAt = new Date().toISOString();
        state.items.unshift(item);
        break;
      }
      case 'toggle': {
        const item = state.items.find(current => current.id === payload.id);
        if (!item) return json({ error: 'not_found' }, 404);
        item.done = !item.done;
        break;
      }
      case 'edit': {
        const item = state.items.find(current => current.id === payload.id);
        const text = cleanText(payload.text);
        if (!item) return json({ error: 'not_found' }, 404);
        if (!text) return json({ error: 'empty_text' }, 400);
        item.text = text;
        break;
      }
      case 'delete':
        state.items = state.items.filter(current => current.id !== payload.id);
        break;
      case 'clearDone':
        state.items = state.items.filter(current => !current.done);
        break;
      case 'replace': {
        if (!Array.isArray(payload.items)) return json({ error: 'invalid_items' }, 400);
        state.items = payload.items.slice(0, 300).map(normalizeItem).filter(Boolean);
        break;
      }
      default:
        return json({ error: 'invalid_action' }, 400);
    }

    state.version += 1;
    await this.ctx.storage.put('state', state);
    return json(state);
  }
}
