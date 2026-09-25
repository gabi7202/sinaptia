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

// ── cliente Supabase mínimo sobre PostgREST ──────────────────────
//
// Cubre exactamente lo que usaba B con supabase-js:
//   select eq/ilike/order/limit · count exact · insert · update
// Todo con fetch y las query strings de PostgREST, sin magia.

export function crearSupabase(env, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const url = String((env && env.SUPABASE_URL) || '').replace(/\/+$/, '');
  const key = String((env && env.SUPABASE_SERVICE_KEY) || '');
  const base = `${url}/rest/v1`;
  const auth = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  async function llamar(path, opts = {}) {
    return f(base + path, { ...opts, headers: { ...auth, ...(opts.headers || {}) } });
  }

  return {
    disponible: () => !!(url && key),

    /** query = query string completa, ej: 'select=*&id=eq.X&order=created_at.desc&limit=1' */
    async select(tabla, query = '', { single = false } = {}) {
      const r = await llamar(`/${tabla}?${query}`);
      if (!r.ok) return { data: null, error: `supabase ${r.status}`, status: r.status };
      const data = await r.json();
      const filas = Array.isArray(data) ? data : [data];
      return { data: single ? (filas[0] ?? null) : filas, error: null };
    },

    /** COUNT exacto vía Prefer + Range (se lee del Content-Range). */
    async contar(tabla, query = '') {
      const sep = query ? '&' : '';
      const r = await llamar(`/${tabla}?${query}${sep}select=id`, {
        method: 'GET',
        headers: { Prefer: 'count=exact', Range: '0-0' },
      });
      const cr = String(r.headers.get('content-range') || r.headers.get('Content-Range') || '');
      const total = cr.split('/')[1];
      return total != null && total !== '*' ? Number(total) : 0;
    },

    async insertar(tabla, fila) {
      const r = await llamar(`/${tabla}`, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return { data: null, error: `supabase ${r.status}` };
      const j = await r.json();
      return { data: Array.isArray(j) ? (j[0] ?? null) : j, error: null };
    },

    async actualizar(tabla, query, fila) {
      const r = await llamar(`/${tabla}?${query}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(fila),
      });
      if (!r.ok) return { data: null, error: `supabase ${r.status}` };
      const j = await r.json();
      return { data: Array.isArray(j) ? (j[0] ?? null) : j, error: null };
    },
  };
}

/** Helpers de query strings PostgREST (valores siempre codificados). */
export const eq = (col, val) => `${col}=eq.${encodeURIComponent(val)}`;
export const ilikeContiene = (col, val) => `${col}=ilike.*${encodeURIComponent(val)}*`;
