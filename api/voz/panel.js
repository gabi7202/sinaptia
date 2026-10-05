/**
 * api/voz/panel.js — Analítica real para /panel.
 *
 * Guarda el oro en Vercel KV y lo agrega aquí: sesiones, mensajes, leads y los
 * análisis del LLM (intenciones, urgencias, frases textuales, objeciones).
 *
 * Protegida con PANEL_SECRET (header x-panel-clave). El panel la pide al vuelo
 * y la guarda en sessionStorage: la clave NUNCA se hornea en el sitio estático.
 *
 * GET → { sesiones, mensajes, leads, pendientes, intenciones, urgencias,
 *         frases, objeciones, herramientas, idiomas, recientes }
 *
 * Persistencia: Vercel KV (server/kv.js). Supabase quedó eliminado del proyecto.
 */
import { crearKV } from '../../server/kv.js';

export default async function handler(req, res) {
  const env = process.env;
  res.setHeader('Cache-Control', 'no-store');
  const enviar = (status, cuerpo) => {
    res.setHeader('Content-Type', 'application/json');
    res.status(status).send(JSON.stringify(cuerpo));
  };

  if (req.method !== 'GET') return enviar(405, { error: 'método no permitido' });
  if (!env.PANEL_SECRET) return enviar(503, { error: 'panel no configurado: falta PANEL_SECRET' });
  const clave = String(req.headers['x-panel-clave'] || '');
  if (!clave || clave !== String(env.PANEL_SECRET)) return enviar(401, { error: 'clave inválida' });

  const db = crearKV(env);
  if (!db.disponible()) return enviar(503, { error: 'backend sin configurar' });

  // totales aproximados por patrón de clave + sesiones recientes para el agregado
  const [sesiones, mensajes, leads, pendientes] = await Promise.all([
    db.totalSesiones(), db.totalMensajes(), db.totalLeads(), db.totalPendientes(),
  ]);
  const kr = await db.cmd(['KEYS', db.PREFIJO + 's:*']);
  const claves = Array.isArray(kr.result) ? kr.result.slice(-200) : [];   // últimas 200 (por orden de creación)
  let sesionesData = [];
  if (claves.length) {
    const mg = await db.cmd(['MGET', ...claves]);
    const vals = Array.isArray(mg.result) ? mg.result : [mg.result];
    sesionesData = vals.map((v) => { try { return JSON.parse(v); } catch (e) { return null; } })
      .filter(Boolean);
  }
  const analisisPorSesion = new Map();
  if (claves.length) {
    const saClaves = claves.map((k) => String(k).replace(/^sinaptia:s:/, 'sinaptia:sa:'));
    const ma = await db.cmd(['MGET', ...saClaves]);
    const va = Array.isArray(ma.result) ? ma.result : [ma.result];
    for (let i = 0; i < saClaves.length; i++) {
      const sid = String(saClaves[i]).replace('sinaptia:sa:', '');
      try { const a = JSON.parse(va[i]); if (a && typeof a === 'object') analisisPorSesion.set(sid, a); } catch (e) { /* sin análisis */ }
    }
  }
  // leads recientes (los últimos 200 guardados)
  const kl = await db.cmd(['KEYS', db.PREFIJO + 'lead:*']);
  const lclaves = Array.isArray(kl.result) ? kl.result.slice(-200) : [];
  let leadsData = [];
  if (lclaves.length) {
    const ml = await db.cmd(['MGET', ...lclaves]);
    const vl = Array.isArray(ml.result) ? ml.result : [ml.result];
    leadsData = vl.map((v) => { try { return JSON.parse(v); } catch (e) { return null; } }).filter(Boolean);
  }
  leadsData.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));

  const suma = (mapa, clave2) => { if (clave2) mapa[clave2] = (mapa[clave2] || 0) + 1; };
  const intenciones = {}, urgencias = {}, objeciones = {}, herramientas = {}, idiomas = {};
  const frases = [];
  for (const s of sesionesData) {
    if (s.lang) suma(idiomas, s.lang);
    const a = analisisPorSesion.get(s.id);
    if (!a || typeof a !== 'object') continue;
    suma(intenciones, a.intencion);
    suma(urgencias, a.urgencia);
    for (const o of a.objeciones || []) suma(objeciones, String(o).slice(0, 120));
    for (const h of a.herramientas_actuales || []) suma(herramientas, String(h).slice(0, 80));
    for (const f of a.frases_textuales || []) {
      const t = String(f).slice(0, 240);
      if (t && frases.length < 40) frases.push({ frase: t, intencion: a.intencion || null, urgencia: a.urgencia || null });
    }
  }

  return enviar(200, {
    sesiones,
    mensajes,
    leads: leadsData.length,
    pendientes,
    idiomas,
    intenciones,
    urgencias,
    objeciones,
    herramientas,
    frases,
    recientes: leadsData.slice(0, 10).map((l) => ({
      nombre: l.nombre, negocio: l.negocio, giro: l.giro,
      necesidad: l.necesidad, resumen: l.resumen, updated_at: l.updated_at,
    })),
    generado: new Date().toISOString(),
  });
}
