/**
 * api/voz/panel.js — Analítica real para /panel (paso 5 de la fusión).
 *
 * B guardaba el oro en Supabase pero no tenía dónde verlo; A tenía el panel
 * pero solo con datos del navegador local. Esta ruta une las dos puntas:
 * agrega sesiones, mensajes y los análisis de Claude (intenciones, urgencias,
 * frases textuales, objeciones) y los sirve al panel.
 *
 * Protegida con PANEL_SECRET (header x-panel-clave). El panel la pide al vuelo
 * y la guarda en sessionStorage: la clave NUNCA se hornea en el sitio estático.
 *
 * GET → { sesiones, mensajes, leads, pendientes, intenciones, urgencias,
 *         frases, objeciones, herramientas, idiomas, recientes }
 */
import { crearSupabase } from '../../server/nucleo.js';

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

  const db = crearSupabase(env);
  if (!db.disponible()) return enviar(503, { error: 'backend sin configurar' });

  const [totSesiones, totMensajes, pendientes] = await Promise.all([
    db.contar('sessions'),
    db.contar('messages'),
    db.contar('sessions', 'needs_summary=eq.true'),
  ]);
  const { data: sesiones } = await db.select('sessions',
    'select=id,lang,analisis,created_at&order=created_at.desc&limit=500');
  const { data: leads } = await db.select('leads',
    'select=nombre,negocio,giro,necesidad,resumen,updated_at&order=updated_at.desc&limit=200');

  const suma = (mapa, clave2) => { if (clave2) mapa[clave2] = (mapa[clave2] || 0) + 1; };
  const intenciones = {}, urgencias = {}, objeciones = {}, herramientas = {}, idiomas = {};
  const frases = [];
  for (const s of sesiones || []) {
    if (s.lang) suma(idiomas, s.lang);
    const a = s.analisis;
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
    sesiones: totSesiones,
    mensajes: totMensajes,
    leads: (leads || []).length,
    pendientes,
    idiomas,
    intenciones,
    urgencias,
    objeciones,
    herramientas,
    frases,
    recientes: (leads || []).slice(0, 10),
    generado: new Date().toISOString(),
  });
}
