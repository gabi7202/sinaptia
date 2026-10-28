/**
 * api/proyecto.js — Copia del brief al dueño (con el nombre Cliente Sinaptia).
 *
 * El visitante descarga su PDF en el navegador; esta ruta recibe el mismo
 * proyecto (y opcionalmente el PDF en base64) y lo entrega por el primer canal:
 *
 *   1. GOOGLE_SCRIPT_URL → Google Apps Script + Gmail (recomendado: sin dominio
 *      verificado, sin proveedor nuevo y con el correo privado del dueño).
 *   2. RESEND_API_KEY + RESEND_FROM + LEAD_EMAIL → email con adjunto.
 *   3. PROYECTO_WEBHOOK → POST JSON (Formspree, Make, n8n, Zapier…).
 *   4. SUPABASE_URL + SUPABASE_SERVICE_KEY → tabla `proyectos`.
 *   5. Sin destino → 200 { enviado:false, motivo:'sin_destino' }. El cliente
 *      ofrece WhatsApp/Web Share: el lead nunca se pierde.
 *
 * Seguridad: mismo origen, cuerpo ≤4 MB, PDF base64 validado, HTML escapado y
 * ningún correo del dueño en el cliente ni en logs.
 */
import { crearSupabase, mismoOrigen, leerCuerpo } from '../server/nucleo.js';

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

const MAX_PDF = 3_500_000;
const CAMPOS = ['nombre', 'email', 'telefono', 'empresa', 'sector', 'volumen', 'rol', 'urgencia', 'pais', 'herramientas'];

function txt(v, max = 600) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ').trim().slice(0, max);
}

function slug(s) {
  return String(s || 'cliente').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'cliente';
}

function nombreAdjunto(p) {
  return `Cliente-Sinaptia-${slug(p.contacto.empresa || p.contacto.nombre)}.pdf`;
}

function esc(s) {
  return txt(s, 2000).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizarProyecto(p) {
  if (!p || typeof p !== 'object') return null;
  const c = p.contacto && typeof p.contacto === 'object' ? p.contacto : {};
  const contacto = {};
  for (const k of CAMPOS) {
    const v = txt(c[k], k === 'email' ? 120 : 240);
    if (v) contacto[k] = k === 'email' ? v.toLowerCase() : v;
  }
  const diag = p.diagnostico && typeof p.diagnostico === 'object' ? p.diagnostico : {};
  const prop = p.propuesta && typeof p.propuesta === 'object' ? {
    titulo: txt(p.propuesta.titulo, 160), que: txt(p.propuesta.que, 900),
    fases: txt(p.propuesta.fases, 900), inversion: txt(p.propuesta.inversion, 120),
    no: txt(p.propuesta.no, 600),
  } : null;
  const correcciones = (Array.isArray(diag.correcciones) ? diag.correcciones : [])
    .slice(0, 12).map((x) => ({ id: txt(x && x.id, 80), porque: txt(x && x.porque, 400) }));
  const ctx = p.contexto && typeof p.contexto === 'object' ? p.contexto : {};
  const cal = p.calificacion && typeof p.calificacion === 'object' ? p.calificacion : {};
  return {
    id: txt(p.id, 24) || 'SIN-REF',
    fecha: txt(p.fecha, 40) || new Date().toISOString(),
    idioma: ['es', 'en', 'pt'].includes(p.idioma) ? p.idioma : 'es',
    canal: txt(p.canal, 30) || 'web',
    contacto,
    contexto: {
      ciudad: txt(ctx.ciudad, 120), pais: txt(ctx.pais, 80), clima: txt(ctx.clima, 80),
      temp: ctx.temp != null && Number.isFinite(Number(ctx.temp)) ? Number(ctx.temp) : null,
      hora: txt(ctx.hora, 20), dispositivo: txt(ctx.dispositivo, 80),
    },
    diagnostico: { dolor: txt(diag.dolor, 900), correcciones, resumen: txt(diag.resumen, 600), faltan: [] },
    calificacion: {
      puntos: Number.isFinite(Number(cal.puntos)) ? Math.max(0, Math.min(100, Number(cal.puntos))) : null,
      nivel: ['caliente', 'tibio', 'frío'].includes(cal.nivel) ? cal.nivel : null,
    },
    propuesta: prop,
    siguiente_paso: txt(p.siguiente_paso, 400),
    enlaces: p.enlaces && typeof p.enlaces === 'object'
      ? { web: txt(p.enlaces.web, 120), whatsapp: txt(p.enlaces.whatsapp, 40), whatsappUrl: txt(p.enlaces.whatsappUrl, 160) }
      : { web: '', whatsapp: '', whatsappUrl: '' },
  };
}

function asunto(p) {
  return `Cliente Sinaptia — ${p.contacto.empresa || p.contacto.nombre || 'prospecto'} — ${p.id}`;
}

function cuerpoTexto(p) {
  const c = p.contacto;
  return [
    `CLIENTE SINAPTIA · ${p.id}`,
    `Fecha: ${p.fecha} · Idioma: ${p.idioma} · Canal: ${p.canal}`,
    '',
    `Contacto: ${c.nombre || '—'} | ${c.email || '—'} | ${c.telefono || '—'}`,
    `Empresa: ${c.empresa || '—'} | Sector: ${c.sector || '—'} | Volumen: ${c.volumen || '—'}`,
    `Urgencia: ${c.urgencia || '—'} | Rol: ${c.rol || '—'} | País: ${c.pais || '—'}`,
    p.calificacion && p.calificacion.puntos != null ? `Calificación: ${p.calificacion.puntos}/100 (${p.calificacion.nivel || '—'})` : '',
    '',
    'IDEA DEL CLIENTE',
    p.diagnostico.dolor || '—',
    c.herramientas ? `Herramientas actuales: ${c.herramientas}` : '',
    '',
    'REQUERIMIENTOS PARA CONTACTAR AL CLIENTE',
    '1. Quién decide, quién usa el proceso y quién puede decir no.',
    '2. Volumen real, picos y qué pasa cuando el proceso falla.',
    '3. Herramientas actuales y dónde vive la información.',
    '4. Qué no se puede tocar: legal, marca, relación o contabilidad.',
    '5. Urgencia real y rango de inversión.',
    '6. Qué tendría que ser verdad para que valga la pena.',
    '',
    'PREGUNTAS PARA DEBATIR',
    '· ¿Qué pasa si no hacemos nada en los próximos meses?',
    '· ¿Cuánto cuesta hoy una respuesta tarde o una cotización olvidada?',
    '· ¿Quién aprueba y qué no delegaría?',
    '· ¿Qué tendría que mostrar el piloto para autorizar la siguiente fase?',
    '',
    p.propuesta ? `PROYECTO PROPUESTO\n${p.propuesta.titulo}\n${p.propuesta.que}\nFases: ${p.propuesta.fases}\nInversión: ${p.propuesta.inversion}\nNo automatizar: ${p.propuesta.no}` : 'PROYECTO: pendiente de completar',
    '',
    `Correcciones: ${p.diagnostico.correcciones.map((x) => x.id).join(', ') || 'ninguna'}`,
    `Siguiente paso: ${p.siguiente_paso || '—'}`,
    p.enlaces && p.enlaces.whatsapp ? `WhatsApp del dueño: ${p.enlaces.whatsapp}` : '',
    '',
    'Enviado desde el agente del sitio. El visitante descargó su copia en PDF.',
  ].filter((x) => x !== '').join('\n').slice(0, 12000);
}

function cuerpoHTML(p) {
  const c = p.contacto;
  const filas = [
    ['Contacto', c.nombre], ['Email del prospecto', c.email], ['Teléfono', c.telefono],
    ['Empresa', c.empresa], ['Sector', c.sector], ['Volumen', c.volumen],
    ['Urgencia', c.urgencia], ['Rol', c.rol], ['País', c.pais],
    ['Calificación', p.calificacion && p.calificacion.puntos != null ? `${p.calificacion.puntos}/100 (${p.calificacion.nivel || '—'})` : ''],
  ].filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#566778;vertical-align:top">${esc(k)}</td><td style="padding:4px 0;font-weight:600">${esc(v)}</td></tr>`
  ).join('');
  const reqs = [
    'Quién decide, quién usa el proceso y quién puede decir no.',
    'Volumen real, picos y qué pasa cuando el proceso falla.',
    'Herramientas actuales y dónde vive la información.',
    'Qué no se puede tocar: legal, marca, relación o contabilidad.',
    'Urgencia real y rango de inversión.',
    'Qué tendría que ser verdad para que valga la pena.',
  ].map((x) => `<li>${esc(x)}</li>`).join('');
  const preguntas = [
    '¿Qué pasa si no hacemos nada en los próximos meses?',
    '¿Cuánto cuesta hoy una respuesta tarde o una cotización olvidada?',
    '¿Quién aprueba y qué no delegaría?',
    '¿Qué tendría que mostrar el piloto para autorizar la siguiente fase?',
  ].map((x) => `<li>${esc(x)}</li>`).join('');
  return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;color:#0E1B2A;line-height:1.6;max-width:760px;margin:0 auto">
  <div style="background:#0E1B2A;color:#fff;padding:22px 24px;border-radius:10px 10px 0 0">
    <div style="font-size:12px;letter-spacing:.14em;color:#9FB4C8">SINAPTIA · CLIENTE SINAPTIA</div>
    <h1 style="margin:8px 0 4px;font-size:22px">${esc(c.empresa || c.nombre || 'Prospecto')}</h1>
    <div style="font-size:13px;color:#B9CCE0">Ref ${esc(p.id)} · ${esc(p.fecha)} · ${esc(p.idioma.toUpperCase())}</div>
  </div>
  <div style="border:1px solid #DCE6F0;border-top:none;padding:22px 24px;border-radius:0 0 10px 10px">
  <table style="border-collapse:collapse;font-size:14px">${filas}</table>
  <h3 style="margin:22px 0 6px">Idea del cliente</h3><p>${esc(p.diagnostico.dolor || '—')}</p>
  ${c.herramientas ? `<p><b>Herramientas actuales:</b> ${esc(c.herramientas)}</p>` : ''}
  <h3 style="margin:22px 0 6px">Requerimientos para contactar al cliente</h3><ol>${reqs}</ol>
  <h3 style="margin:22px 0 6px">Preguntas para debatir</h3><ul>${preguntas}</ul>
  <h3 style="margin:22px 0 6px">Proyecto propuesto</h3>
  ${p.propuesta ? `<p><b>${esc(p.propuesta.titulo)}</b><br>${esc(p.propuesta.que)}</p>
    <p><b>Fases:</b> ${esc(p.propuesta.fases)}<br><b>Inversión:</b> ${esc(p.propuesta.inversion)}<br>
    <b>No automatizar:</b> ${esc(p.propuesta.no)}</p>` : '<p>Pendiente</p>'}
  <h3 style="margin:22px 0 6px">Correcciones</h3>
  <p>${esc(p.diagnostico.correcciones.map((x) => x.id).join(', ') || 'ninguna')}</p>
  <h3 style="margin:22px 0 6px">Siguiente paso</h3><p>${esc(p.siguiente_paso || '—')}</p>
  <p style="color:#566778;font-size:12px;margin-top:24px">Enviado por el agente del sitio. El PDF va adjunto como <b>Cliente Sinaptia</b>.</p>
  </div></body></html>`;
}

/**
 * Google Apps Script + Gmail. Sin proveedor nuevo, sin dominio verificado:
 * el script vive en la cuenta de Google del dueño y envía el PDF a su Gmail.
 * Código listo en `google-apps-script/Code.gs`.
 */
async function enviarGoogle(env, p, pdfBase64, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const url = String(env.GOOGLE_SCRIPT_URL || '');
  if (!url) return { ok: false, motivo: 'google_sin_configurar' };
  const cuerpo = {
    token: String(env.GOOGLE_SCRIPT_TOKEN || ''),
    asunto: asunto(p),
    nombreArchivo: nombreAdjunto(p),
    pdfBase64: pdfBase64 || null,
    texto: cuerpoTexto(p),
    html: cuerpoHTML(p),
    proyecto: p,
  };
  const r = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    redirect: 'follow',
  });
  let j = null;
  try { j = await r.json(); } catch (e) { j = null; }
  if (!r.ok || !j || j.ok !== true) {
    return { ok: false, motivo: `google ${r.status} ${(j && j.error) || ''}`.trim() };
  }
  return { ok: true, enviado: true, via: 'google-apps-script', id: j.id || p.id };
}

async function enviarResend(env, p, pdfBase64, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const clave = String(env.RESEND_API_KEY || '');
  const from = String(env.RESEND_FROM || '');
  const to = String(env.LEAD_EMAIL || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!clave || !from || !to.length) return { ok: false, motivo: 'resend_sin_configurar' };
  const cuerpo = {
    from,
    to,
    subject: asunto(p),
    html: cuerpoHTML(p),
    text: cuerpoTexto(p),
    ...(pdfBase64 ? { attachments: [{ filename: nombreAdjunto(p), content: pdfBase64, content_type: 'application/pdf' }] } : {}),
  };
  const r = await f('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  if (!r.ok) {
    let detalle = '';
    try { detalle = await r.text(); } catch (e) { /* nada */ }
    return { ok: false, motivo: `resend ${r.status} ${detalle.slice(0, 120)}` };
  }
  const j = await r.json().catch(() => ({}));
  return { ok: true, enviado: true, via: 'resend', id: j.id || p.id };
}

async function enviarWebhook(env, p, pdfBase64, fetchImpl) {
  const f = fetchImpl || ((...a) => globalThis.fetch(...a));
  const url = String(env.PROYECTO_WEBHOOK || '');
  if (!url) return { ok: false, motivo: 'webhook_sin_configurar' };
  const r = await f(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origen: 'sinaptia-proyecto', proyecto: p, pdfBase64: pdfBase64 || null }),
  });
  if (!r.ok) return { ok: false, motivo: `webhook ${r.status}` };
  return { ok: true, enviado: true, via: 'webhook', id: p.id };
}

async function guardarSupabase(env, p, fetchImpl) {
  const db = crearSupabase(env, fetchImpl);
  if (!db.disponible()) return { ok: false, motivo: 'supabase_sin_configurar' };
  const r = await db.insertar('proyectos', {
    ref: p.id, idioma: p.idioma, contacto: p.contacto, proyecto: p,
    creado: p.fecha,
  });
  if (r.error) return { ok: false, motivo: r.error };
  return { ok: true, enviado: true, via: 'supabase', id: (r.data && r.data.id) || p.id };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'método no permitido' });
  if (!mismoOrigen(req)) return res.status(403).json({ error: 'origen' });

  const body = await leerCuerpo(req);
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'cuerpo inválido' });
  if (body.consentimiento !== true) return res.status(400).json({ error: 'consentimiento requerido' });

  const proyecto = normalizarProyecto(body.proyecto);
  if (!proyecto) return res.status(400).json({ error: 'proyecto inválido' });

  let pdfBase64 = null;
  if (typeof body.pdfBase64 === 'string' && body.pdfBase64) {
    if (!/^[A-Za-z0-9+/=\s]+$/.test(body.pdfBase64) || body.pdfBase64.length > MAX_PDF) {
      return res.status(413).json({ error: 'pdf demasiado grande o inválido' });
    }
    pdfBase64 = body.pdfBase64.replace(/\s/g, '');
  }

  const env = process.env;
  const intentos = [];
  try {
    // Preferencia del dueño: Google Apps Script + Gmail (privado y sin dominio).
    const google = await enviarGoogle(env, proyecto, pdfBase64);
    intentos.push(google);
    if (google.ok) return res.status(200).json(google);

    const resend = await enviarResend(env, proyecto, pdfBase64);
    intentos.push(resend);
    if (resend.ok) return res.status(200).json(resend);

    const webhook = await enviarWebhook(env, proyecto, pdfBase64);
    intentos.push(webhook);
    if (webhook.ok) return res.status(200).json(webhook);

    const supabase = await guardarSupabase(env, proyecto);
    intentos.push(supabase);
    if (supabase.ok) return res.status(200).json(supabase);
  } catch (e) {
    return res.status(502).json({ error: 'no se pudo enviar la copia', detalle: String(e && e.message ? e.message : e).slice(0, 160) });
  }

  // Ningún canal configurado: no es un error del visitante. El cliente ofrece
  // WhatsApp + Web Share y el PDF ya está descargado en su dispositivo.
  return res.status(200).json({
    ok: true,
    enviado: false,
    motivo: 'sin_destino',
    id: proyecto.id,
    intentos: intentos.map((x) => x.motivo).filter(Boolean),
  });
}
