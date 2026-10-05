/**
 * api/voz/end.js — Cierre de sesión con resumen a lead.
 *
 * Al colgar, el cliente la llama (fetch keepalive): resume la conversación AHÍ
 * MISMO con el LLM y actualiza/crea el lead. Si el cliente desaparece sin llamar
 * (batería, crash, pestaña cerrada), el cron de rescate la recoge igual.
 *
 * POST { sessionId } · cookie vid → { ok: true, lead: bool }
 * Persistencia: Vercel KV (server/kv.js). Supabase quedó eliminado del proyecto.
 */
import { crearKV } from '../../server/kv.js';
import { isUUID, mismoOrigen, leerCookies, leerCuerpo, json } from '../../server/nucleo.js';
import { resumirSesion } from '../../server/resumen.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearKV(env);
  if (!db.disponible()) return json(res, 503, { error: 'backend sin configurar' });

  const vid = leerCookies(req).vid;
  const b = await leerCuerpo(req);
  if (!isUUID(vid) || !isUUID(b && b.sessionId)) return json(res, 400, { error: 'bad' });

  // la sesión tiene que ser del visitante de la cookie: nadie cierra lo ajeno
  const s = await db.getSession(b.sessionId);
  if (!s || s.visitor_id !== vid) return json(res, 403, { error: 'session' });

  try {
    const r = await resumirSesion(db, env, s.id);
    return json(res, 200, { ok: true, resumen: !!r.hecho });
  } catch (e) {
    console.error('end error', e);
    // no se pierde nada: la marca de pendiente sigue y el cron reintenta
    return json(res, 200, { ok: true, resumen: false });
  }
}
