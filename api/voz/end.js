/**
 * api/voz/end.js — LA RUTA QUE LE FALTABA A B.
 *
 * El cron de B habla de "sesiones que nunca mandaron el end": esta es esa ruta.
 * Al colgar, el cliente la llama (fetch keepalive): resume la conversación AHÍ
 * MISMO con Grok y actualiza/crea el lead. Si el cliente desaparece sin llamar
 * (batería, crash, pestaña cerrada), el cron de rescate la recoge igual.
 *
 * POST { sessionId } · cookie vid → { ok: true, lead: bool }
 */
import { crearSupabase, isUUID, mismoOrigen, leerCookies, leerCuerpo, json, eq } from '../../server/nucleo.js';
import { resumirSesion } from '../../server/resumen.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearSupabase(env);
  if (!db.disponible()) return json(res, 503, { error: 'backend sin configurar' });

  const vid = leerCookies(req).vid;
  const b = await leerCuerpo(req);
  if (!isUUID(vid) || !isUUID(b && b.sessionId)) return json(res, 400, { error: 'bad' });

  // la sesión tiene que ser del visitante de la cookie: nadie cierra lo ajeno
  const { data: s } = await db.select('sessions',
    `select=id,needs_summary&${eq('id', b.sessionId)}&${eq('visitor_id', vid)}`, { single: true });
  if (!s) return json(res, 403, { error: 'session' });

  // si el cierre llega sin mensajes de usuario marcados (p. ej. update perdido),
  // se fuerza el flag: el resumen decide solo si había algo que resumir
  if (!s.needs_summary) {
    await db.actualizar('sessions', eq('id', s.id), { needs_summary: true });
  }

  try {
    const r = await resumirSesion(db, env, s.id);
    return json(res, 200, { ok: true, resumen: !!r.hecho });
  } catch (e) {
    console.error('end error', e);
    // no se pierde nada: needs_summary sigue en true y el cron reintenta
    return json(res, 200, { ok: true, resumen: false });
  }
}
