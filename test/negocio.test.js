/**
 * negocio.test.js — Prueba que la automatización de voz se adapta a cualquier negocio.
 *   node test/negocio.test.js
 *
 * La misma capa de voz, tres negocios distintos: el saludo, las respuestas y las
 * derivaciones a humano deben salir del perfil, no de un texto genérico.
 */
import { PERFILES, motorNegocio, perfilPor } from '../src/lib/negocio.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Voz adaptable a cualquier negocio\x1b[0m\n');

t('hay tres perfiles de negocio y perfilPor los resuelve',
  Object.keys(PERFILES).length === 3 && !!perfilPor('clinica') && !!perfilPor('TALLER') && !perfilPor('inexistente'));

for (const id of Object.keys(PERFILES)) {
  const p = PERFILES[id];
  const m = motorNegocio(p);
  console.log('\n  \x1b[36m' + p.nombre + '\x1b[0m');
  t('  el saludo nombra al negocio y dice qué puede hacer',
    m.saludo.includes(p.nombre) && m.saludo.length > 40, m.saludo.slice(0, 60));

  const serv = m.responder(id === 'clinica' ? 'quiero una limpieza' : id === 'taller' ? 'necesito cambio de aceite' : 'busco comprar un piso');
  t('  responde su propio servicio, no un texto genérico',
    !/SINAPTIA|diagnóstico de automatización/i.test(serv.texto) && serv.texto.length > 40, serv.texto.slice(0, 60));
  t('  y ofrece agendar/citar al cerrar', /agend|cita|cupo|visita|confirmo/i.test(serv.texto), serv.texto.slice(-60));

  const faq = m.responder(id === 'clinica' ? '¿cuáles son sus horarios?' : id === 'taller' ? '¿qué horario tienen?' : '¿qué horario tienen?');
  t('  contesta su FAQ con datos del negocio', /lunes|viernes|s[áa]bado/i.test(faq.texto), faq.texto.slice(0, 60));

  const urg = m.responder(id === 'clinica' ? 'tengo un dolor fuerte y sangra' : id === 'taller' ? 'el carro no arranca y huele a quemado' : 'quiero negociar una oferta');
  t('  deriva a humano en lo delicado', urg.humano === true && /persona|mec[áa]nico|asesor|urgencias/i.test(urg.texto), urg.texto.slice(0, 60));

  const rara = m.responder('¿me recomiadas invertir en criptomonedas?');
  t('  fuera de alcance: no improvisa, deriva', rara.humano === true, rara.texto.slice(0, 60));
}

console.log('\n  \x1b[36mLa misma pregunta, tres negocios distintos\x1b[0m');
const pregunta = '¿cuánto cuesta?';
const respuestas = Object.keys(PERFILES).map((id) => motorNegocio(PERFILES[id]).responder(pregunta).texto);
t('la pregunta de precio produce tres respuestas diferentes',
  new Set(respuestas).size === 3, respuestas.map((r) => r.slice(0, 30)).join(' | '));
t('y ninguna promete plazos', !respuestas.some((r) => /\b\d+\s*(d[ií]as|semanas|meses)\b/i.test(r)));

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · voz adaptable verificada en 3 negocios');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
