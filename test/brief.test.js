/**
 * brief.test.js — El brief es bilingüe, descargable y con datos de proyecto.
 *   node test/brief.test.js
 */
import { crearBrief, construirProyecto, bytesBrief } from '../src/lib/brief.js';
import { enviarCopia, bytesABase64, whatsappCopia } from '../src/lib/proyecto.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

const lead = {
  nombre: 'Laura Ortiz', email: 'laura@andes.com', empresa: 'Andes Parts', sector: 'auto parts',
  dolor: 'quotes by hand take hours', volumen: '300', urgencia: 'alta', herramientas: 'Excel + WhatsApp',
};
const estado = { propuesta: { titulo: 'Immediate-response agent', que: 'Answers in seconds', fases: 'Phase 1: one channel. Phase 2: CRM.', inversion: '3,500 – 12,000 USD', no: 'No autonomous pricing.' }, correcciones: [{ id: 'todo_automatico', porque: 'map first' }] };
const ctx = { ciudad: 'Austin', pais: 'US', clima: 'clear', temp: 24, hora: '14:00', dispositivo: 'mobile' };
const config = {
  marca: {
    nombre: 'SINAPTIA', persona: 'Rafael Ortiz', whatsapp: '+52 983 406 6176',
    whatsappUrl: 'https://wa.me/529834066176', web: 'sinaptialabs.com', agenda: 'https://cal.com/tu-usuario/descubrimiento',
  },
  pdf: { nombreArchivo: 'Cliente-Sinaptia' },
};

console.log('\n\x1b[1m  SINAPTIA · Brief de proyecto\x1b[0m\n');

t('el proyecto incluye contacto, dolor, propuesta y calificación', (() => {
  const p = construirProyecto({ lead, estado, ctx, pack: { codigo: 'en' }, config });
  return p.contacto.empresa === 'Andes Parts' && p.diagnostico.dolor.includes('quotes') &&
    p.propuesta.inversion.includes('3,500') && p.calificacion.puntos > 0 && p.id !== 'SIN-REF';
})());

t('el PDF en inglés usa etiquetas inglesas y no español', (() => {
  const { doc } = crearBrief({ lead, estado, ctx, pack: { codigo: 'en' }, config });
  const txt = Buffer.from(doc.bytes()).toString('latin1');
  return txt.startsWith('%PDF-') && txt.includes('Confidential opportunity brief') && txt.includes('Prepared for') &&
    txt.includes('Current tools') && !txt.includes('Brief confidencial de oportunidad') &&
    !txt.includes('Herramientas actuales') && !txt.includes('Semana');
})());

t('el PDF en español sigue en español', (() => {
  const { doc } = crearBrief({ lead, estado, ctx, pack: { codigo: 'es' }, config });
  const txt = Buffer.from(doc.bytes()).toString('latin1');
  return txt.includes('Brief confidencial de oportunidad') && txt.includes('Preparado para');
})());

t('encabezado con marca, logo vectorial y referencia', (() => {
  const { doc, proyecto } = crearBrief({ lead, estado, ctx, pack: { codigo: 'es' }, config });
  const txt = Buffer.from(doc.bytes()).toString('latin1');
  return txt.includes('SINAPTIA') && txt.includes('IA QUE ENTRA EN OPERACIÓN') &&
    txt.includes('Rafael Ortiz') && txt.includes(proyecto.id);
})());

t('pie con WhatsApp visible y sin correo público del dueño', (() => {
  const txt = Buffer.from(bytesBrief({ lead, estado, ctx, pack: { codigo: 'es' }, config })).toString('latin1');
  return txt.includes('WhatsApp') && txt.includes('+52 983 406 6176') &&
    txt.includes('HABLEMOS DE TU CASO') && !txt.includes('hola@') && !/mailto/i.test(txt);
})());

t('el PDF no promete plazos por número de días/semanas', (() => {
  const txt = Buffer.from(bytesBrief({ lead, estado, ctx, pack: { codigo: 'es' }, config })).toString('latin1');
  return !/\b\d+\s*(d[ií]as|semanas|meses)\b/i.test(txt);
})());

t('incluye la referencia única en el pie', (() => {
  const { doc, proyecto } = crearBrief({ lead, estado, ctx, pack: { codigo: 'en' }, config });
  return Buffer.from(doc.bytes()).toString('latin1').includes(proyecto.id);
})());

t('el nombre del archivo es Cliente-Sinaptia + slug', (() => {
  const { nombre } = crearBrief({ lead, estado, ctx, pack: { codigo: 'en' }, config });
  return /^Cliente-Sinaptia-andes-parts\.pdf$/.test(nombre);
})());

await (async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0xff, 0x00]);
  const b64 = bytesABase64(bytes);
  t('base64 sobrevive bytes > 127', Buffer.from(b64, 'base64').equals(Buffer.from(bytes)));
})();

await (async () => {
  const llamadas = [];
  const f = async (url, opts) => { llamadas.push({ url, opts, body: JSON.parse(opts.body) }); return { ok: true, json: async () => ({ ok: true, enviado: true, via: 'resend' }) }; };
  const r = await enviarCopia({ endpoint: '/api/proyecto', proyecto: construirProyecto({ lead, estado, ctx, pack: { codigo: 'en' }, config }), bytes: new Uint8Array([1, 2, 3]), fetchImpl: f });
  t('enviarCopia manda proyecto + PDF y respeta el consentimiento',
    r.enviado === true && llamadas[0].body.consentimiento === true && llamadas[0].body.pdfBase64 === 'AQID');
})();

t('WhatsApp de respaldo lleva empresa, dolor y referencia', (() => {
  const url = whatsappCopia(construirProyecto({ lead, estado, ctx, pack: { codigo: 'en' }, config }), '529834066176', 'en');
  return url.startsWith('https://wa.me/529834066176') && /Andes%20Parts/.test(url) && /Ref%3A/.test(url);
})());

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · brief verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
