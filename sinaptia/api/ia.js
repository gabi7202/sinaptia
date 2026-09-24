/**
 * api/ia.js — Función serverless de Vercel: mismo cerebro, mismo origen que el sitio.
 *
 * Ventaja sobre el Worker externo: el endpoint es /api/ia del mismo dominio,
 * así que no hay CORS y los secretos viven en Vercel (Settings → Environment
 * Variables: OPENAI_KEY o ANTHROPIC_KEY).
 *
 * En el sitio: CONFIG.ia.endpoint = '/api/ia'
 */
import { manejarCuerpo, cors } from '../infra/ia-core.js';

export default async function handler(req, res) {
  const origen = process.env.ORIGEN_PERMITIDO;
  res.setHeader('Access-Control-Allow-Origin', origen || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });

  const from = req.headers.origin || '';
  if (origen && !from.startsWith(origen)) return res.status(403).json({ error: 'origen no permitido' });

  const { status, cuerpo } = await manejarCuerpo(req.body || {}, process.env);
  res.setHeader('Content-Type', 'application/json');
  return res.status(status).send(cuerpo);
}
