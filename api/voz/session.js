/**
 * api/voz/session.js — Abre una sesión de voz con el backend real (Groq/Gemini + Vercel KV).
 *
 * POST { consent: true, lang: 'es'|'en'|'pt' }
 *   · cookie httpOnly `vid` (UUID, 1 año): memoria multidispositivo del navegador
 *   · si el visitante ya está vinculado a un lead, el saludo lo reconoce por su
 *     nombre ("¡Hola de nuevo, José!") — el recall vive en el servidor
 *   · guarda consentimiento versionado, idioma y user-agent (auditoría GDPR)
 *   → 200 { sessionId, saludo, conocido }
 *
 * Persistencia: Vercel KV (server/kv.js). Supabase quedó eliminado del proyecto.
 */
import { crearKV } from '../../server/kv.js';
import { isUUID, mismoOrigen, leerCookies, leerCuerpo, cookieVisitante, json } from '../../server/nucleo.js';
import { LANGS, CONSENT_VERSION } from '../../server/langs.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const db = crearKV(env);
  if (!db.disponible()) return json(res, 503, { error: 'backend sin configurar' });

  const b = await leerCuerpo(req);
  if (!b || b.consent !== true || !Object.prototype.hasOwnProperty.call(LANGS, b.lang)) {
    return json(res, 400, { error: 'bad' });
  }
  const lang = b.lang;

  // visitante: reutiliza la cookie si sigue viva; si no, crea uno nuevo
  const now = new Date().toISOString();
  const vidCookie = leerCookies(req).vid;
  let vid = null, visitor = null;
  if (isUUID(vidCookie)) {
    visitor = await db.getVisitor(vidCookie);
    if (visitor) vid = vidCookie;
  }
  if (!vid) {
    vid = crypto.randomUUID();
    visitor = { lead_id: null };
  }
  await db.setVisitor(vid, { ...visitor, last_seen: now });
  cookieVisitante(res, req, vid);

  const lead = visitor && visitor.lead_id ? await db.getLead(visitor.lead_id) : null;

  const sid = crypto.randomUUID();
  await db.setSession(sid, {
    visitor_id: vid,
    lang,
    consent_at: now,
    consent_version: CONSENT_VERSION,
    user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
    needs_summary: false,
    last_msg_at: now,
    created_at: now,
  });

  const L = LANGS[lang];
  const saludo = lead && lead.nombre ? L.back(lead.nombre, lead.negocio) : L.hello;
  await db.pushMessage(sid, { role: 'assistant', content: saludo, ts: now });
  await db.indexSesionVisitante(vid, sid);

  return json(res, 200, { sessionId: sid, saludo, conocido: !!(lead && lead.nombre) });
}
