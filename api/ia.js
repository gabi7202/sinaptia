/**
 * api/ia.js — Función serverless de Vercel: mismo cerebro, mismo origen que el sitio.
 *
 * Ventaja sobre el Worker externo: el endpoint es /api/ia del mismo dominio,
 * así que no hay CORS y los secretos viven en Vercel (Settings → Environment
 * Variables: GROQ_API_KEY, XAI_API_KEY u OPENAI_KEY).
 *
 * En el sitio: CONFIG.ia.endpoint = '/api/ia' (valor por defecto).
 * GET /api/ia → salud del cerebro (proveedor/modelo/prompt) sin revelar claves.
 */
import { manejarCuerpo, cors, salud, origenValido } from '../infra/ia-core.js';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

function leerBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') {
    try { return JSON.parse(b); } catch (e) { return null; }
  }
  return null;
}

export default async function handler(req, res) {
  const origen = process.env.ORIGEN_PERMITIDO;
  const c = cors(origen);
  for (const [k, v] of Object.entries(c)) res.setHeader(k, v);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(salud(process.env));
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const from = req.headers.origin || '';
  if (!origenValido(origen, from)) return res.status(403).json({ error: 'origen no permitido' });

  const body = leerBody(req);
  if (!body) return res.status(400).json({ error: 'json inválido' });

  const { status, cuerpo, headers } = await manejarCuerpo(body, process.env);
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).send(cuerpo);
}
