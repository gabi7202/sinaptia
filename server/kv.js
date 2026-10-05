/**
 * kv.js — Capa de persistencia sobre Vercel KV (Upstash Redis), CERO dependencias.
 *
 * Decisión de arquitectura (2026-10): se eliminó Supabase del proyecto. La
 * memoria de clientes, sesiones y transcripciones vive ahora en la store
 * key-value que Vercel incluye con 1 GB gratis — suficiente para miles de
 * conversaciones de voz (comandos JSON planos, sin SDK ni driver).
 *
 * Variables del entorno (Vercel → Storage → Create Database → "Show CLI command"
 * o Environment Variables al vincular; las inyecta también `vercel link` tras
 * `vercel add kv KKV`). Se aceptan AMBAS nomenclaturas, la nuestra y la que
 * Vercel genera al crear/linkear una base KV (nombre de la base + _REST_API_*):
 *   KKV_URL / <BASE>_URL              redis://default:PASSWORD@host:port
 *   KKV_TOKEN / <BASE>_TOKEN          token de acceso (user default)
 *   KKV_REST_API_URL / <BASE>_REST_API_URL   https://x.upstash.io
 *   KKV_REST_API_TOKEN / <BASE>_REST_API_TOKEN
 *     <== la que usamos (REST puro por fetch: funciona en serverless)
 * Ej.: si tu base se llama "voz", Vercel inyecta VOZ_URL, VOZ_REST_API_URL y
 * VOZ_REST_API_TOKEN — ya no hace falta renombrar nada a mano.
 *
 * Formato de comandos (protocolo RESP sobre JSON, el que habla Upstash REST):
 *   POST {base}/        body: ["SET","clave","valor"]        → {result:"OK"}
 *   GET  {base}/get/c   → {result: valor|null}               (atajo de lectura)
 * Los valores viajan como strings JSON; parsear() devuelve [] ante basura.
 *
 * Diseño de claves (TTLs en segundos):
 *   v:{vid}                      visitante → {lead_id,last_seen}      400 d
 *   s:{sid}                      sesión    → {...sin analisis}        30 d
 *   sa:{sid}                     análisis  → JSON del resumen          30 d
 *   m:{sid}                      lista de mensajes (JSON array)       30 d
 *   ml:{vid}                     índice de sesiones del visitante     30 d
 *   lead:{lid}                   lead completo                         ∞
 *   ln:{norm} · le:{email} · lt:{dígitos}   índices de matching       ∞
 *   rl:{vid}                     rate limit (contador)                  1 h
 *   cronlock                     mutex del cron                          5 m
 */

const PREFIJO = 'sinaptia:';
const TTL_VISITOR = 60 * 60 * 24 * 400;   // la cookie vid vive 1 año: la memoria, un poco más
const TTL_SESION = 60 * 60 * 24 * 30;     // sesiones/mensajes: 30 días (retención GDPR)
const TTL_RL = 3600;                       // ventana del rate limit: 1 hora
const MAX_MSGS = 200;                      // tope de mensajes por sesión (memoria acotada)

export const TTL = { visitor: TTL_VISITOR, sesion: TTL_SESION, rl: TTL_RL };

/** Analiza una respuesta REST de Upstash tolerando errores de conexión. */
function interpretar(jsonCrudo) {
  let j = null;
  try { j = JSON.parse(jsonCrudo); } catch (e) { /* red caída, HTML de error… */ }
  if (j && typeof j === 'object' && 'result' in j) return { ok: true, result: j.result };
  if (j && typeof j === 'object' && 'error' in j) return { ok: false, error: String(j.error.message || j.error) };
  return { ok: false, error: 'respuesta inválida' };
}

/** Parsea un valor guardado: siempre objeto/array, nunca basura. */
export function parsear(v) {
  if (typeof v !== 'string') return null;
  try {
    const j = JSON.parse(v);
    return (j && typeof j === 'object') ? j : null;
  } catch (e) { return null; }
}

/**
 * @param {object} env     process.env
 * @param {Function} [fetchImpl] inyectable para tests (sin red)
 */
export function crearKV(env, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  // Nomenclatura flexible: KKV_* (nuestra) o <BASE>_REST_API_* (la que inyecta
  // Vercel al crear/linkear una base KV — p. ej. VOZ_REST_API_URL / _TOKEN).
  const e = env || {};
  let base = '', token = '';
  for (const [k, v] of Object.entries(e)) {
    if (!/_REST_API_TOKEN$/.test(k)) continue;
    const urlKey = `${k.slice(0, -'_TOKEN'.length)}_URL`;   // X_REST_API_URL
    if (e[urlKey]) { base = String(e[urlKey]); token = String(v); break; }
  }
  base = String(base || e.KKV_REST_API_URL || '').replace(/\/+$/, '');
  token = String(token || e.KKV_REST_API_TOKEN || '');
  const urlCmd = `${base}/`;
  const auth = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  async function cmd(args) {
    let r;
    try {
      r = await f(urlCmd, { method: 'POST', headers: auth, body: JSON.stringify(args) });
    } catch (e) {
      return { ok: false, error: 'red' };
    }
    if (!r.ok) return { ok: false, error: `kv ${r.status}` };
    return interpretar(await r.text());
  }

  /** set con TTL; ttl = 0/undefined ⇒ sin expiración. Devuelve bool de éxito. */
  async function set(k, val, ttl = 0) {
    const args = ['SET', PREFIJO + k, JSON.stringify(val)];
    if (ttl > 0) args.push('EX', String(ttl));
    const r = await cmd(args);
    return r.ok && r.result === 'OK';
  }

  /** get crudo (string|null). */
  async function get(k) {
    const r = await cmd(['GET', PREFIJO + k]);
    if (!r.ok) return null;
    return r.result == null ? null : String(r.result);
  }

  return {
    disponible: () => !!(base && token),

    // ── primitivas ──
    cmd, set, get,
    PREFIJO,

    /** get + parsear: objeto o null. */
    async json(k) { return parsear(await get(k)); },

    /** INCR con EXPIRE solo cuando llega a 1 (ventana fija desde el 1er msg). */
    async incrConVentana(k, seg) {
      const r = await cmd(['INCR', PREFIJO + k]);
      if (!r.ok || typeof r.result !== 'number') return { ok: false, n: 0 };
      if (r.result === 1) await cmd(['EXPIRE', PREFIJO + k, String(seg)]);
      return { ok: true, n: r.result };
    },

    /** Mutex simple SET NX (devolver true si adquiriste el lock). */
    async lock(nombre, seg) {
      const r = await cmd(['SET', PREFIJO + nombre, String(Date.now()), 'EX', String(seg), 'NX']);
      return r.ok && r.result === 'OK';
    },

    // ── visitantes (cookie vid ↔ lead) ──
    async getVisitor(vid) { return parsear(await get(`v:${vid}`)); },
    async setVisitor(vid, datos) { return set(`v:${vid}`, datos, TTL_VISITOR); },

    // ── leads ──
    async getLead(lid) { return parsear(await get(`lead:${lid}`)); },
    async saveLead(lead) {
      const bien = await set(`lead:${lead.id}`, lead, 0);
      // índices de matching fuerte/débil (los mismos campos *_norm de antes)
      const idx = [];
      if (lead.nombre_norm) idx.push(set(`ln:${lead.nombre_norm}`, { lead_id: lead.id, ts: lead.updated_at || '' }, 0));
      if (lead.email) idx.push(set(`le:${String(lead.email).toLowerCase()}`, { lead_id: lead.id, ts: lead.updated_at || '' }, 0));
      if (lead.telefono_norm) idx.push(set(`lt:${lead.telefono_norm}`, { lead_id: lead.id, ts: lead.updated_at || '' }, 0));
      await Promise.all(idx);
      return bien;
    },
    /** Búsqueda FUERTE exacta por índice. */
    async buscarIndice(prefijoIdx, valor) {
      if (!valor) return null;
      return parsear(await get(`${prefijoIdx}:${valor}`));
    },
    /** Búsqueda DÉBIL: ¿existe algún lead con este nombre normalizado? */
    async existeNombre(nombreNorm) { return (await this.buscarIndice('ln', nombreNorm)) != null; },

    // ── sesiones ──
    async getSession(sid) {
      const s = parsear(await get(`s:${sid}`));
      if (!s) return null;
      const a = parsear(await get(`sa:${sid}`));
      return a ? { ...s, analisis: a } : s;
    },
    async setSession(sid, datos) {
      const { analisis, ...resto } = datos || {};
      const tareas = [set(`s:${sid}`, resto, TTL_SESION)];
      if (analisis !== undefined) tareas.push(set(`sa:${sid}`, analisis, TTL_SESION));
      const r = await Promise.all(tareas);
      return r.every(Boolean);
    },
    async indexSesionVisitante(vid, sid) {
      const prev = parsear(await get(`ml:${vid}`)) || [];
      const arr = Array.isArray(prev) ? prev : [];
      if (!arr.includes(sid)) arr.push(sid);
      return set(`ml:${vid}`, arr.slice(-50), TTL_SESION);
    },
    async listSesionesVisitante(vid) {
      const prev = parsear(await get(`ml:${vid}`));
      return Array.isArray(prev) ? prev : [];
    },

    // ── mensajes (lista serializada por sesión) ──
    async getMessages(sid) {
      const m = parsear(await get(`m:${sid}`));
      return Array.isArray(m) ? m : [];
    },
    async pushMessage(sid, msg) {
      const arr = await this.getMessages(sid);
      arr.push(msg);
      if (arr.length > MAX_MSGS) arr.splice(0, arr.length - MAX_MSGS);
      return set(`m:${sid}`, arr, TTL_SESION);
    },

    // ── rescate del cron: sesiones pendientes de resumen ──
    async marcarPendiente(sid, vid, epochMs) { return set(`pend:${sid}`, { vid, ts: epochMs }, TTL_SESION); },
    async desmarcarPendiente(sid) { const r = await cmd(['DEL', PREFIJO + `pend:${sid}`]); return r.ok; },
    /** Lista {id, vid, ts} de pendientes con ts < corteEpoch, hasta limite. */
    async listarPendientes(corteEpoch, limite = 10) {
      const r = await cmd(['KEYS', PREFIJO + 'pend:*']);
      if (!r.ok || !Array.isArray(r.result)) return [];
      const claves = r.result;
      const vals = claves.length
        ? await cmd(claves.length === 1
            ? ['GET', claves[0]]
            : ['MGET', ...claves])
        : { ok: true, result: [] };
      if (!vals.ok) return [];
      const items = claves.length === 1 ? [vals.result] : (Array.isArray(vals.result) ? vals.result : []);
      const out = [];
      for (let i = 0; i < claves.length; i++) {
        const p = parsear(items[i] == null ? null : String(items[i]));
        if (!p || !p.vid || !(p.ts > 0) || p.ts >= corteEpoch) continue;
        out.push({ id: String(claves[i]).slice(PREFIJO.length + 'pend:'.length), vid: p.vid, ts: p.ts });
      }
      out.sort((a, b) => a.ts - b.ts);
      return out.slice(0, limite);
    },

    // ── panel: totales aproximados (sin SCAN costoso) ──
    async contarTipo(prefijoCorto) {
      const r = await cmd(['KEYS', PREFIJO + prefijoCorto]);
      return r.ok && Array.isArray(r.result) ? r.result.length : 0;
    },
    totalSesiones() { return this.contarTipo('s:*'); },
    totalLeads() { return this.contarTipo('lead:*'); },
    totalPendientes() { return this.contarTipo('pend:*'); },
    /** Total de mensajes: suma de longitudes (una KEYS de sesiones + MGET por lotes). */
    async totalMensajes() {
      const r = await cmd(['KEYS', PREFIJO + 'm:*']);
      return r.ok && Array.isArray(r.result) ? r.result.length : 0;
    },
  };
}
