/**
 * api/voz/session.js — Abre una sesión de voz.
 *
 * POST { consent: true, lang: 'es'|'en'|'pt' }
 *   · Con Supabase: cookie httpOnly `vid` (UUID, 1 año), memoria multidispositivo
 *     y saludo con recall ("¡Hola de nuevo, José!").
 *   · Sin Supabase (o si falla): sesión efímera `efimero-…` y el hilo se guarda
 *     en el navegador del visitante. Groq responde igual; nada se persiste.
 *   → 200 { sessionId, saludo, conocido, efimero }
 */
import { crearSupabase, isUUID, mismoOrigen, leerCookies, leerCuerpo, cookieVisitante, json, eq } from '../../server/nucleo.js';
import { LANGS, CONSENT_VERSION } from '../../server/langs.js';
import { PROMPT_VERSION } from '../../server/prompt-maestro.js';

function efimera(lang, motivo) {
  const id = 'efimero-' + (globalThis.crypto && globalThis.crypto.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`);
  return {
    sessionId: id,
    saludo: LANGS[lang].hello,
    conocido: false,
    efimero: true,
    motivo,
    promptVersion: PROMPT_VERSION,
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return json(res, 405, { error: 'método no permitido' });
  if (!mismoOrigen(req)) return json(res, 403, { error: 'origin' });

  const env = process.env;
  const b = await leerCuerpo(req);
  if (!b || b.consent !== true || !Object.prototype.hasOwnProperty.call(LANGS, b.lang)) {
    return json(res, 400, { error: 'bad' });
  }
  const lang = b.lang;

  const db = crearSupabase(env);
  if (!db.disponible()) return json(res, 200, efimera(lang, 'sin_db'));

  try {
    // visitante: reutiliza la cookie si sigue viva; si no, crea uno nuevo
    const vid = leerCookies(req).vid;
    let visitor = null;
    if (isUUID(vid)) {
      ({ data: visitor } = await db.select('visitors', `select=id,lead_id&${eq('id', vid)}`, { single: true }));
    }
    if (!visitor) {
      ({ data: visitor } = await db.insertar('visitors', {}));
    }
    if (!visitor || !visitor.id) return json(res, 200, efimera(lang, 'db_visitante'));

    cookieVisitante(res, req, visitor.id);
    const now = new Date().toISOString();
    await db.actualizar('visitors', eq('id', visitor.id), { last_seen: now });

    const lead = visitor.lead_id
      ? (await db.select('leads', `select=nombre,negocio&${eq('id', visitor.lead_id)}`, { single: true })).data
      : null;

    const { data: session } = await db.insertar('sessions', {
      visitor_id: visitor.id,
      lang,
      consent_at: now,
      consent_version: CONSENT_VERSION,
      user_agent: String(req.headers['user-agent'] || '').slice(0, 300),
    });
    if (!session || !session.id) return json(res, 200, efimera(lang, 'db_sesion'));

    const L = LANGS[lang];
    const saludo = lead && lead.nombre ? L.back(lead.nombre, lead.negocio) : L.hello;
    await db.insertar('messages', {
      session_id: session.id, visitor_id: visitor.id,
      role: 'assistant', content: saludo, lang,
    });

    return json(res, 200, {
      sessionId: session.id, saludo, conocido: !!(lead && lead.nombre),
      efimero: false, promptVersion: PROMPT_VERSION,
    });
  } catch (e) {
    // Un fallo de Supabase no puede tumbar la conversación: se sigue en efímero.
    return json(res, 200, efimera(lang, 'db_error'));
  }
}
