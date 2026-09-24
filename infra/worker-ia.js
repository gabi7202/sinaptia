/**
 * worker-ia.js — Cloudflare Worker: wrapper fino sobre infra/ia-core.js.
 *
 * Despliegue: wrangler deploy infra/worker-ia.js --name sinaptia-ia
 * Secretos: XAI_API_KEY (Grok) u OPENAI_KEY (+ opcionales GROK_MODEL, GROK_EFFORT,
 * OPENAI_MODEL, XAI_BASE_URL, ORIGEN_PERMITIDO).
 */
import { manejarCuerpo, cors } from './ia-core.js';

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(env.ORIGEN_PERMITIDO) });
    if (req.method !== 'POST') return new Response('método no permitido', { status: 405, headers: cors(env.ORIGEN_PERMITIDO) });

    const origen = req.headers.get('Origin') || '';
    if (env.ORIGEN_PERMITIDO && !origen.startsWith(env.ORIGEN_PERMITIDO)) {
      return new Response(JSON.stringify({ error: 'origen no permitido' }), { status: 403, headers: cors(env.ORIGEN_PERMITIDO) });
    }

    let body;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({ error: 'json inválido' }), { status: 400, headers: cors(env.ORIGEN_PERMITIDO) }); }

    const { status, cuerpo } = await manejarCuerpo(body, env);
    return new Response(cuerpo, { status, headers: { ...cors(env.ORIGEN_PERMITIDO), 'Content-Type': 'application/json' } });
  },
};
