/**
 * proyecto.test.js — La copia del brief al dueño.
 *   node test/proyecto.test.js
 *
 * Se prueba el contrato de la ruta: validación, email con adjunto, webhook de
 * respaldo y el caso "sin destino" (que no es un error del visitante).
 */
import handler from '../api/proyecto.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

function req(body, headers = {}) {
  return { method: 'POST', body, headers: { origin: 'http://localhost', host: 'localhost', ...headers } };
}
function res() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(j) { this.body = j; return this; },
    send(s) { this.body = s; return this; },
    end() { return this; },
  };
}

const PROYECTO = {
  id: 'ABC123',
  fecha: '2026-10-25T20:00:00.000Z',
  idioma: 'en',
  canal: 'en-web',
  contacto: { nombre: 'Mark', email: 'mark@acme.com', empresa: 'Acme Parts', sector: 'auto parts', volumen: '300', urgencia: 'alta' },
  contexto: { ciudad: 'Austin', clima: 'clear', temp: 24 },
  diagnostico: { dolor: 'quotes by hand', correcciones: [{ id: 'todo_automatico', porque: 'map first' }] },
  calificacion: { puntos: 80, nivel: 'caliente' },
  propuesta: { titulo: 'Response agent', que: 'Answers in seconds', fases: 'Phase 1', inversion: '3,500 USD', no: 'No autonomous pricing' },
  siguiente_paso: 'Review the brief and book a call.',
};

const ENV = { ...process.env };
function limpiar() {
  for (const k of ['RESEND_API_KEY', 'RESEND_FROM', 'LEAD_EMAIL', 'PROYECTO_WEBHOOK', 'GOOGLE_SCRIPT_URL', 'GOOGLE_SCRIPT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_KEY']) {
    delete process.env[k];
  }
}

console.log('\n\x1b[1m  SINAPTIA · Copia del brief al dueño\x1b[0m\n');

await (async () => {
  limpiar();
  const r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true, pdfBase64: 'JVBERi0=' }), r);
  t('sin canal configurado devuelve 200 enviado:false (el PDF ya está descargado)',
    r.statusCode === 200 && r.body.enviado === false && r.body.motivo === 'sin_destino');
})();

await (async () => {
  limpiar();
  let r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: false }), r);
  t('sin consentimiento → 400 (no se envía nada)', r.statusCode === 400 && r.body.error === 'consentimiento requerido');

  r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true }, { origin: 'https://malo.com' }), r);
  t('origen ajeno → 403', r.statusCode === 403);

  r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true, pdfBase64: '***no-base64***' }), r);
  t('PDF con caracteres inválidos → rechazado', r.statusCode === 413);

  r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true, pdfBase64: 'A'.repeat(3_600_000) }), r);
  t('PDF demasiado grande → 413', r.statusCode === 413);
})();

await (async () => {
  limpiar();
  process.env.GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/test/exec';
  process.env.GOOGLE_SCRIPT_TOKEN = 'tok-test';
  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, id: 'gmail-123' }), text: async () => '' };
  };
  const r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true, pdfBase64: 'JVBERi0=' }), r);
  t('Google Apps Script: recibe token, asunto Cliente Sinaptia, PDF y nombre de archivo',
    r.statusCode === 200 && r.body.via === 'google-apps-script' && r.body.enviado === true &&
    llamadas[0].body.token === 'tok-test' &&
    /Cliente Sinaptia/.test(llamadas[0].body.asunto) &&
    llamadas[0].body.nombreArchivo === 'Cliente-Sinaptia-acme-parts.pdf' &&
    llamadas[0].body.pdfBase64 === 'JVBERi0=');
  t('Google Apps Script: el cuerpo lleva requerimientos y preguntas para debatir',
    /REQUERIMIENTOS PARA CONTACTAR/.test(llamadas[0].body.texto) &&
    /PREGUNTAS PARA DEBATIR/.test(llamadas[0].body.texto));
})();

await (async () => {
  limpiar();
  process.env.RESEND_API_KEY = 're-test';
  process.env.RESEND_FROM = 'Sinaptia <hola@sinaptia.test>';
  process.env.LEAD_EMAIL = 'owner@sinaptia.test, backup@sinaptia.test';
  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ id: 'email-123' }), text: async () => '' };
  };
  const r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true, pdfBase64: 'JVBERi0=' }), r);
  t('Resend: envía a todos los destinatarios y devuelve id',
    r.statusCode === 200 && r.body.enviado === true && r.body.via === 'resend' && r.body.id === 'email-123' &&
    llamadas[0].body.to.length === 2);
  t('Resend: asunto Cliente Sinaptia con empresa y referencia',
    /Cliente Sinaptia/.test(llamadas[0].body.subject) && /Acme Parts/.test(llamadas[0].body.subject) && /ABC123/.test(llamadas[0].body.subject));
  t('Resend: adjunta el PDF real',
    llamadas[0].body.attachments[0].content === 'JVBERi0=' && /\.pdf$/.test(llamadas[0].body.attachments[0].filename));
  t('Resend: el email incluye la calificación del lead',
    /Calificación/.test(llamadas[0].body.text) && /80\/100/.test(llamadas[0].body.text));
  t('Resend: el HTML escapa datos del visitante',
    !/<script>/i.test(llamadas[0].body.html));
})();

await (async () => {
  limpiar();
  process.env.PROYECTO_WEBHOOK = 'https://hooks.test/sinaptia';
  const llamadas = [];
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, opts, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  };
  const r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true }), r);
  t('Webhook de respaldo: recibe el proyecto completo',
    r.statusCode === 200 && r.body.via === 'webhook' &&
    llamadas[0].url === 'https://hooks.test/sinaptia' && llamadas[0].body.proyecto.id === 'ABC123');
})();

await (async () => {
  limpiar();
  process.env.RESEND_API_KEY = 're-test';
  process.env.RESEND_FROM = 'x';
  process.env.LEAD_EMAIL = 'owner@test.com';
  process.env.PROYECTO_WEBHOOK = 'https://hooks.test/fail';
  let n = 0;
  globalThis.fetch = async (url) => {
    n++;
    if (String(url).includes('resend')) return { ok: false, status: 500, text: async () => 'boom' };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const r = res();
  await handler(req({ proyecto: PROYECTO, consentimiento: true }), r);
  t('si Resend falla, cae al webhook sin perder la copia', n === 2 && r.body.via === 'webhook');
})();

limpiar();
Object.assign(process.env, ENV);

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · copia del brief verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
