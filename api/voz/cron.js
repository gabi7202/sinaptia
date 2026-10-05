/**
 * api/voz/cron.js — Red de seguridad (Vercel Cron, diario 09:00 UTC).
 *
 * Resume sesiones que nunca mandaron el "end" (batería, crash, cierre brusco)
 * con más de 20 minutos sin actividad. Autenticado con
 * Authorization: Bearer ${CRON_SECRET} — Vercel Cron lo manda solo cuando
 * defines el secreto como env var (ver DEPLOY.md §6).
 *
 * Persistencia: Vercel KV (server/kv.js). Supabase quedó eliminado del proyecto.
 */
import { crearKV } from '../../server/kv.js';
import { resumirSesion } from '../../server/resumen.js';

export default async function handler(req, res) {
  const env = process.env;
  const secreto = String(env.CRON_SECRET || '');
  const auth = String(req.headers.authorization || req.headers.Authorization || '');
  if (!secreto || auth !== `Bearer ${secreto}`) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(401).send('no');
  }

  const db = crearKV(env);
  if (!db.disponible()) return res.status(503).send('backend sin configurar');

  // mutex SET NX: dos crones solapados no re-resumen la misma sesión
  if (!(await db.lock('cronlock', 300))) {
    res.setHeader('Content-Type', 'text/plain');
    return res.status(200).send('ok otra pasada en curso');
  }

  const corte = Date.now() - 20 * 60e3;
  const pendientes = await db.listarPendientes(corte, 10);

  let hechas = 0;
  for (const p of pendientes) {
    try {
      const r = await resumirSesion(db, env, p.id);
      if (r.hecho) hechas++;
      // si quedó pendiente (json_invalido), desmarcamos igualmente para no
      // bloquear el tope de 10: reaparece al hablar de nuevo o caduca por TTL
      await db.desmarcarPendiente(p.id);
    } catch (e) {
      console.error('cron: sesión', p.id, e); // sigue con la siguiente: el próximo cron reintenta
    }
  }
  res.setHeader('Content-Type', 'text/plain');
  return res.status(200).send(`ok ${hechas}/${pendientes.length}`);
}
