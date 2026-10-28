/**
 * worker-ia.js — Cloudflare Worker: wrapper fino sobre infra/ia-core.js.
 *
 * Despliegue: wrangler deploy infra/worker-ia.js --name sinaptia-ia
 * Secretos: GROQ_API_KEY (recomendado), XAI_API_KEY (Grok) u OPENAI_KEY
 * (+ opcionales GROQ_MODEL, GROQ_EXTRACT_MODEL, XAI_MODEL, XAI_BASE_URL,
 * OPENAI_MODEL, FUNDADOR, ORIGEN_PERMITIDO).
 */
import { manejarCuerpo, cors, salud, origenValido } from './ia-core.js';

export default {
  async fetch(req, env) {
    const c = cors(env.ORIGEN_PERMITIDO);
    if (req.method === 'OPTIONS') return new Response(null, { headers: c });
    if (req.method === 'GET') {
      return new Response(JSON.stringify(salud(env)), {
        status: 200, headers: { ...c, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    if (req.method !== 'POST') return new Response('método no permitido', { status: 405, headers: c });

    const origen = req.headers.get('Origin') || '';
    if (!origenValido(env.ORIGEN_PERMITIDO, origen)) {
      return new Response(JSON.stringify({ error: 'origen no permitido' }), { status: 403, headers: c });
    }

    let body;
    try { body = await req.json(); }
    catch { return new Response(JSON.stringify({ error: 'json inválido' }), { status: 400, headers: c }); }

    const { status, cuerpo, headers } = await manejarCuerpo(body, env);
    return new Response(cuerpo, { status, headers: { ...c, ...(headers || {}), 'Content-Type': 'application/json' } });
  },
};
