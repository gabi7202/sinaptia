/**
 * nucleo.js — Base compartida del backend de voz (el cerebro de B, fusionado en A).
 *
 * Decisión de fusión: CERO dependencias nuevas. La implementación B usaba
 * @supabase/supabase-js y el SDK del proveedor de IA; aquí se sustituyen por
 * fetch plano contra la API REST de Supabase (PostgREST) y la API de xAI/Grok
 * (llm.js → gemini.js/grok.js).
 * Ventajas: mismas claves y mismas tablas que B, pero el repo sigue instalándose
 * con dos dependencias, funciona igual en Vercel, y los tests corren sin red.
 *
 * Las claves viven SOLO en el entorno del servidor (Vercel → Environment
 * Variables): SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY (o XAI_API_KEY), CRON_SECRET,
 * PANEL_SECRET. Ver .env.ejemplo y DEPLOY.md §6.
 */

// ── validaciones y normalizadores (idénticos a B) ────────────────

export const isUUID = (s) =>
  typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/** Normaliza texto para comparar sin acentos, mayúsculas ni ruido. */
export const norm = (s) =>
  String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[%_,]/g, '').trim();

/** Últimos 10 dígitos de un teléfono: compara sin importar el formato del país. */
export const digits = (s) => String(s ?? '').replace(/\D/g, '').slice(-10);

/**
 * Mismo origen: el backend solo acepta llamadas del propio sitio.
 * sendBeacon a veces no manda Origin, por eso se permite vacío (se sigue
 * exigiendo cookie httpOnly + UUID válidos en cada ruta). Heredado de B.
 */
export function mismoOrigen(req) {
  const h = (req && req.headers) || {};
  const o = h.origin || h.Origin;
  if (!o) return true;
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim();
  try { return new URL(o).host === host; } catch (e) { return false; }
}

/** Parsea las cookies del request (Vercel no las trae servidas). */
export function leerCookies(req) {
  const raw = String((req && req.headers && (req.headers.cookie || req.headers.Cookie)) || '');
  const out = {};
  for (const par of raw.split(';')) {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return out;
}

/** Set-Cookie para el visitante: httpOnly, 1 año, Secure solo bajo https. */
export function cookieVisitante(res, req, id) {
  const h = (req && req.headers) || {};
  const proto = String(h['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const seguro = proto === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `vid=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; HttpOnly; SameSite=Lax${seguro}`);
}

/** Cuerpo JSON tolerante: Vercel ya lo parsea; en tests puede venir crudo. */
export async function leerCuerpo(req) {
  const b = req && req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (e) { return null; } }
  return null;
}

export function json(res, status, cuerpo) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).send(JSON.stringify(cuerpo));
}

/* ══════════ Vercel KV: la persistencia del backend (Sinaptia · 2026-10) ══════════
   Antes esto era Supabase (PostgREST). Se ELIMINÓ: la memoria de clientes,
   sesiones y transcripciones vive ahora en Vercel KV (Upstash Redis), que
   Vercel trae en su plan — ver server/kv.js. Los helpers eq/ilikeContiene
   desaparecieron con PostgREST: el matching de buscar_cliente usa índices de
   clave exacta (ln:/le:/lt:) escritos por db.saveLead(). */

export const eq = (col, val) => `${col}=eq.${encodeURIComponent(val)}`;
export const ilikeContiene = (col, val) => `${col}=ilike.*${encodeURIComponent(val)}*`;
