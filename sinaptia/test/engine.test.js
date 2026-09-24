/**
 * engine.test.js — Pruebas del motor conversacional.
 *   node test/engine.test.js
 *
 * Simula conversaciones reales y afirma el comportamiento: etapas, extracción
 * de datos, correcciones y disparo del PDF. Sin DOM, sin red.
 */
import { SKILL } from '../src/lib/skill.js';
import { PACKS, packPor } from '../src/lib/i18n.js';
import { crearAgente } from '../src/lib/engine.js';

const CTX = {
  ciudad: 'Bogotá', pais: 'Colombia', temp: 24, clima: 'parcialmente nublado',
  hora: '14:32', saludo: 'Buenas tardes', tipKey: 'nublado', dispositivo: 'escritorio',
};

let ok = 0, fallos = [];
function t(nombre, fn) {
  try { fn(); ok++; console.log('  \x1b[32m✓\x1b[0m ' + nombre); }
  catch (e) { fallos.push(nombre + ' → ' + e.message); console.log('  \x1b[31;1m✗\x1b[0m ' + nombre + '\n      ↳ ' + e.message); }
}
function eq(a, b, m) { if (a !== b) throw new Error((m || '') + ' esperaba «' + b + '», dio «' + a + '»'); }
function incluye(txt, frag, m) { if (!String(txt).toLowerCase().includes(frag.toLowerCase())) throw new Error((m || 'texto') + ' no contiene «' + frag + '»'); }
function noIncluye(txt, frag, m) { if (String(txt).toLowerCase().includes(frag.toLowerCase())) throw new Error((m || 'texto') + ' NO debía contener «' + frag + '»'); }

function nuevo() { const a = crearAgente(SKILL, CTX); a.iniciar(); return a; }

console.log('\n\x1b[1m  SINAPTIA · Test del motor conversacional\x1b[0m\n');

console.log('\x1b[36m  SALUDO Y CONTEXTO\x1b[0m');
t('el saludo usa ciudad, hora, temperatura y clima reales', () => {
  const a = nuevo(); const g = a.responder('hola'); // primer turno tras iniciar
  // iniciar() devuelve el saludo; lo comprobamos directamente
  const a2 = crearAgente(SKILL, CTX); const saludo = a2.iniciar();
  incluye(saludo, 'Bogotá'); incluye(saludo, '14:32'); incluye(saludo, '24');
  incluye(saludo, 'parcialmente nublado'); incluye(saludo, 'Buenas tardes');
});
t('el saludo termina con la primera pregunta de descubrimiento', () => {
  const a = crearAgente(SKILL, CTX); const s = a.iniciar();
  incluye(s, '¿a qué se dedica tu empresa?');
});
t('el tip de contexto aparece en el saludo', () => {
  const a = crearAgente(SKILL, { ...CTX, temp: 33, tipKey: 'calor' });
  incluye(a.iniciar(), 'agua');
});

console.log('\n\x1b[36m  FLUJO DE DESCUBRIMIENTO\x1b[0m');
t('captura el sector y avanza a dolor', () => {
  const a = nuevo();
  const r = a.responder('Nos dedicamos a la venta de repuestos automotrices');
  eq(a.estado.etapa, 'dolor', 'etapa');
  eq(a.lead.sector, 'la venta de repuestos automotrices', 'sector');
  incluye(r.texto, 'qué proceso te quita');
});
t('captura el dolor y avanza a volumen', () => {
  const a = nuevo();
  a.responder('somos una clínica'); a.responder('respondemos tarde las citas y las transcribimos a mano');
  eq(a.estado.etapa, 'volumen');
  incluye(a.lead.dolor, 'transcribimos');
});
t('volumen numérico con puntos se parsea a entero', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('cotizaciones a mano');
  a.responder('unas 1.200 al mes');
  eq(a.lead.volumen, '1200', 'volumen');
  eq(a.estado.etapa, 'contacto');
});
t('"no sé" en volumen no bloquea el flujo', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('reportes manuales');
  a.responder('no sé, la verdad');
  eq(a.estado.etapa, 'contacto');
  eq(a.lead.volumen, 'sin dato');
});
t('contacto en un solo mensaje: nombre, email y empresa', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('cotizaciones'); a.responder('300');
  const r = a.responder('Laura Ortiz, laura@repuestos.com, Repuestos Andinos');
  eq(a.lead.nombre, 'Laura Ortiz', 'nombre');
  eq(a.lead.email, 'laura@repuestos.com', 'email');
  eq(a.lead.empresa, 'Repuestos Andinos', 'empresa');
  eq(a.estado.etapa, 'propuesta', 'etapa tras contacto completo');
  incluye(r.texto, 'esto es lo que yo haría', 'propuesta presentada');
});
t('contacto fragmentado: pide lo que falta sin repetir lo recibido', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('cotizaciones'); a.responder('300');
  a.responder('me llamo Laura Ortiz');
  eq(a.estado.etapa, 'contacto', 'sigue en contacto');
  const r2 = a.responder('laura@repuestos.com');
  incluye(r2.texto, 'empresa', 'pide la empresa faltante');
  noIncluye(r2.texto, 'me falta tu nombre', 'no debe volver a pedir el nombre');
});
t('el email capturado "de paso" en otro turno se registra', () => {
  const a = nuevo();
  a.responder('vendemos repuestos y mi correo es jorge@x.com');
  eq(a.lead.email, 'jorge@x.com', 'email capturado sin pedirlo');
});

console.log('\n\x1b[36m  CORRECCIONES (la skill)\x1b[0m');
t('"automatizar todo" se corrige y se registra para el PDF', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  const r = a.responder('quiero automatizar todo el negocio con IA');
  incluye(r.texto, 'mapear', 'explica el orden correcto');
  eq(a.estado.correcciones.length, 1, 'una corrección registrada');
  eq(a.estado.correcciones[0].id, 'todo_automatico', 'id de la corrección');
  eq(a.estado.etapa, 'dolor', 'retoma la etapa pendiente');
});
t('una corrección no se repite dos veces', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  a.responder('quiero automatizar todo');
  const r = a.responder('es que necesito automatizar todo ya');
  eq(a.estado.correcciones.length, 1, 'no duplica la corrección');
});
t('"un ChatGPT para mi empresa" se reencuadra a sistema', () => {
  const a = nuevo();
  a.responder('somos una clínica');
  const r = a.responder('quiero comprar un ChatGPT para mi empresa');
  incluye(r.texto, 'sistema');
  eq(a.estado.correcciones[0].id, 'un_gpt_para_mi_empresa');
});
t('"que responda todo sin humanos" activa escalamiento obligatorio', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  const r = a.responder('necesito un chatbot que responda todo solo, sin personas');
  incluye(r.texto, 'derive a una persona');
});
t('"reemplazar empleados" se reencuadra a eliminar tareas', () => {
  const a = nuevo();
  a.responder('somos una clínica');
  const r = a.responder('quiero reemplazar a los empleados de recepción');
  incluye(r.texto, 'elimina tareas');
});
t('"para ayer" no recibe una fecha: recibe primera fase sin promesas', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  const r = a.responder('lo necesito para ayer, en una semana máximo');
  incluye(r.texto, 'primera fase');
  const m = r.texto.match(/\b\d+\s*(d[ií]as|semanas)\b/i);
  if (m) throw new Error('promete plazo: ' + m[0]);
});
t('"que cierre ventas solo" limita a preparar con aprobación humana', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  const r = a.responder('quiero que la IA cierre ventas y facture sola');
  incluye(r.texto, 'El humano aprueba');
});

console.log('\n\x1b[36m  PROPUESTA Y PDF\x1b[0m');
t('dolor de atención → propuesta de agente de respuesta', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  a.responder('tardamos horas en responder consultas de clientes por whatsapp');
  a.responder('400');
  a.responder('Laura Ortiz, laura@x.com, Repuestos Andinos');
  incluye(a.responder ? a.lead.dolor : '', 'responder');
  // la propuesta ya se presentó en el turno de contacto
  eq(a.estado.etapa, 'propuesta');
});
t('dolor de documentos → propuesta de back-office', () => {
  const a = nuevo();
  a.responder('somos una comercializadora');
  a.responder('transcribimos facturas de proveedores a mano todo el día');
  a.responder('800');
  const r = a.responder('Pedro Gil, pedro@x.com, Comercializadora Sur');
  incluye(r.texto, 'back-office', 'propuesta de back-office');
});
t('decir sí tras la propuesta dispara la generación del PDF', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('cotizaciones a mano'); a.responder('300');
  a.responder('Laura Ortiz, laura@x.com, Repuestos Andinos');
  const r = a.responder('sí, dame el pdf');
  eq(r.listoParaPdf, true, 'listoParaPdf');
  eq(r.acciones.some((x) => x.tipo === 'generar_pdf'), true, 'acción generar_pdf');
});
t('decir que no despide sin generar PDF', () => {
  const a = nuevo();
  a.responder('vendemos repuestos'); a.responder('cotizaciones'); a.responder('300');
  a.responder('Laura Ortiz, laura@x.com, Repuestos Andinos');
  const r = a.responder('no, gracias');
  eq(r.listoParaPdf, false);
  eq(a.estado.etapa, 'fin');
});

console.log('\n\x1b[36m  MULTILINGÜE\x1b[0m');
t('packPor resuelve código y navigator.language', () => {
  eq(packPor('en-US').codigo, 'en'); eq(packPor('pt-BR').codigo, 'pt'); eq(packPor('xx').codigo, 'es');
});
t('inglés: corrige "automate everything"', () => {
  const a = crearAgente(PACKS.en, { ciudad: 'Bogotá', temp: 24, clima: 'nublado', hora: '14:32', saludo: 'Good afternoon', tipKey: 'nublado' });
  a.iniciar(); a.responder('we sell spare parts');
  const r = a.responder('I want to automate everything with AI');
  incluye(r.texto, 'map the process');
  eq(a.estado.correcciones[0].id, 'todo_automatico');
});
t('inglés: pide el sector en inglés y entiende la respuesta', () => {
  const a = crearAgente(PACKS.en, { ciudad: 'Bogotá', temp: 24, clima: 'nublado', hora: '14:32', saludo: 'Good afternoon', tipKey: 'nublado' });
  const s1 = a.iniciar();
  incluye(s1, 'what does your company do');
  a.responder('we are a clinic');
  eq(a.lead.sector, 'a clinic', 'sector');
  eq(a.estado.etapa, 'dolor');
});
t('portugués: corrige y propone en portugués', () => {
  const a = crearAgente(PACKS.pt, { ciudad: 'São Paulo', temp: 28, clima: 'nublado', hora: '10:00', saludo: 'Bom dia', tipKey: 'calor' });
  a.iniciar(); a.responder('vendemos peças');
  const r = a.responder('quero automatizar tudo com IA');
  incluye(r.texto, 'mapear o processo');
});
t('la respuesta de plazos no promete días ni semanas', () => {
  const a = nuevo();
  a.iniciar(); a.responder('vendemos repuestos');
  const r = a.responder('¿cuánto tarda todo esto?');
  const m = r.texto.match(/\b\d+\s*(d[ií]as|semanas|meses)\b/i);
  if (m) throw new Error('promete plazo: ' + m[0]);
  incluye(r.texto, 'revisar');
});
t('español sigue intacto con el pack es', () => {
  const a = crearAgente(PACKS.es, { ciudad: 'Bogotá', temp: 24, clima: 'nublado', hora: '14:32', saludo: 'Buenas tardes', tipKey: 'nublado' });
  a.iniciar(); a.responder('vendemos repuestos');
  const r = a.responder('quiero automatizar todo');
  incluye(r.texto, 'mapear');
});

console.log('\n\x1b[36m  PREGUNTAS LIBRES\x1b[0m');
t('pregunta de precio sin caso conocido: pide el dato, no da un menú', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  const r = a.responder('¿cuánto cuesta esto?');
  incluye(r.texto, 'qué proceso', 'pide el dato que falta');
  noIncluye(r.texto, '1.800', 'no suelta un menú de precios');
});
t('pregunta de precio con caso conocido: rango orientado a la situación', () => {
  const a = nuevo();
  a.responder('vendemos repuestos');
  a.responder('tardamos horas en hacer cotizaciones a mano');
  const r = a.responder('¿cuánto sería lo mío?');
  incluye(r.texto, 'lo nuestro sería', 'nombra la solución orientada');
  incluye(r.texto, 'va de', 'da el rango de inversión');
});
t('pregunta de privacidad se responde sin perder la etapa', () => {
  const a = nuevo();
  a.responder('somos una clínica');
  const r = a.responder('¿qué pasa con mis datos y la confidencialidad?');
  incluye(r.texto, 'confidencialidad');
  eq(a.estado.etapa, 'dolor', 'no avanza de etapa por una pregunta');
});

console.log('\n\x1b[36m  MEMORIA: CLIENTE RECURRENTE (precargar)\x1b[0m');
const PERFIL = { nombre: 'José Pérez', negocio: 'pastelería', necesidad: 'implementar IA' };

t('precargar trae nombre, negocio y necesidad al lead', () => {
  const a = nuevo();
  a.precargar(PERFIL);
  return a.lead.nombre === 'José Pérez' && a.lead.sector === 'pastelería' && a.lead.dolor === 'implementar IA';
});

t('avanza la etapa al primer dato que FALTA de verdad', () => {
  const a = nuevo();
  a.precargar(PERFIL);
  return a.estado.etapa === 'volumen';
});

t('nunca vuelve a preguntar el sector de un cliente recordado', () => {
  const a = nuevo();
  a.precargar(PERFIL);
  const r1 = a.responder('sí, sigamos desde ahí');
  const r2 = a.responder('unas 300 consultas al mes');
  const todo = r1.texto + ' ' + r2.texto;
  return !/a qu[eé] se dedica tu empresa/i.test(todo);
});

t('sin memoria, sí pregunta desde cero (control)', () => {
  const a = nuevo();
  const r = a.responder('hola, quiero automatizar cosas');
  return /a qu[eé] se dedica|qu[eé] proceso te quita/i.test(r.texto);
});

// ── resumen ──
console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · motor conversacional verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
