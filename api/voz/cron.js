/**
 * api/voz/cron.js — Red de seguridad (Vercel Cron, diario 09:00 UTC).
 *
 * Heredado de B tal cual en su lógica: resume sesiones que nunca mandaron el
 * "end" (batería, crash, cierre brusco) con más de 20 minutos sin actividad.
 * Autenticado con Authorization: Bearer ${CRON_SECRET} — Vercel Cron lo manda
 * solo cuando defines el secreto como env var (ver DEPLOY.md §6).
 */
import { crearSupabase } from '../../server/nucleo.js';
import { resumirSesion } from '../../server/resumen.js';

export default async function handler(req, res) {
  const env = process.env;
  const secreto = String(env.CRON_SECRET || '');
  const auth = String(req.headers.authorization || req.headers.Authorization || '');
  if (!secreto || auth !== `Bearer ${secreto}`) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(401).send('no');
  }

  const db = crearSupabase(env);
  if (!db.disponible()) return res.status(503).send('backend sin configurar');

  const corte = new Date(Date.now() - 20 * 60e3).toISOString();
  const { data } = await db.select('sessions',
    `select=id&needs_summary=eq.true&last_msg_at=lt.${encodeURIComponent(corte)}&limit=10`);

  let hechas = 0;
  for (const s of data || []) {
    try {
      const r = await resumirSesion(db, env, s.id);
      if (r.hecho) hechas++;
    } catch (e) {
      console.error('cron: sesión', s.id, e); // sigue con la siguiente: el próximo cron reintenta
    }
  }
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send(`ok ${hechas}/${(data || []).length}`);
}
