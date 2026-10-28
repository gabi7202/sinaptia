/**
 * ia.test.js — Contrato del LLM: validación estricta y degradación al motor.
 *   node test/ia.test.js
 */
import { razonar, validar, extraerJSON, normalizarDatos, riesgoComercial } from '../src/lib/ia.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Test del cerebro LLM\x1b[0m\n');

t('sin endpoint no llama a nadie y devuelve null', await razonar({ mensaje: 'hola', endpoint: null }) === null);

t('validar acepta un contrato completo', (() => {
  const v = validar({ respuesta: 'Te escucho.', intencion: 'saludo', confianza: 0.9, datos: { sector: 'clínica' }, paso: 'seguir' });
  return v && v.respuesta === 'Te escucho.' && v.datos.sector === 'clínica';
})());
t('validar recorta confianza fuera de rango', validar({ respuesta: 'x', confianza: 7 }).confianza === 1);
t('validar rechaza respuesta vacía', validar({ respuesta: '  ', confianza: 1 }) === null);
t('validar rechaza lo que no es objeto', validar('hola') === null && validar(null) === null);
t('validar completa campos ausentes sin inventar', (() => {
  const v = validar({ respuesta: 'ok' });
  return v.intencion === 'sin patrón claro' && v.confianza === 0.5 && v.paso === 'seguir' && Object.keys(v.datos).length === 0;
})());

await (async () => {
  global.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    return { ok: true, json: async () => ({ respuesta: 'Entiendo: quieres automatizar cotizaciones.', intencion: 'necesidad: cotizaciones', confianza: 0.8, datos: { dolor: 'cotizaciones a mano' }, paso: 'seguir' }) };
  };
  const j = await razonar({ mensaje: 'cotizamos a mano', endpoint: 'https://proxy/habla', guion: { siguiente: '¿cuántas al mes?' } });
  t('con proxy devuelve el contrato parseado', j && j.intencion === 'necesidad: cotizaciones' && j.datos.dolor === 'cotizaciones a mano');
})();
await (async () => {
  global.fetch = async () => { throw new Error('red caída'); };
  t('si el proxy se cae, devuelve null (manda el motor)', await razonar({ mensaje: 'hola', endpoint: 'https://proxy/habla' }) === null);
})();
await (async () => {
  global.fetch = async () => ({ ok: false, status: 500 });
  t('un 500 del proxy también degrada a null', await razonar({ mensaje: 'hola', endpoint: 'https://proxy/habla' }) === null);
})();
await (async () => {
  global.fetch = async () => ({ ok: true, json: async () => { throw new Error('no-json'); } });
  t('JSON roto del proveedor se descarta', await razonar({ mensaje: 'hola', endpoint: 'https://proxy/habla' }) === null);
})();

/* ── conversión tolerante y segura ── */
t('extrae JSON aunque venga con prosa o backticks', (() => {
  const j = extraerJSON('Claro, aquí va:\n```json\n{"respuesta":"ok","datos":{"sector":"clínica"}}\n```\nEspero que sirva.');
  return j && j.respuesta === 'ok' && j.datos.sector === 'clínica';
})());
t('extrae JSON con llaves dentro de strings sin romperse',
  extraerJSON('{"respuesta":"usa {esto}","datos":{}}').respuesta === 'usa {esto}');
t('JSON inválido no lanza', extraerJSON('{{{') === null && extraerJSON(null) === null);

t('normaliza datos: solo campos conocidos, email limpio, texto recortado', (() => {
  const d = normalizarDatos({ sector: '  clínica  ', email: ' <LAURA@X.COM> ', dolor: 'x'.repeat(400), malicioso: 'hack', nombre: { a: 1 } });
  return d.sector === 'clínica' && d.email === 'laura@x.com' && d.dolor.length <= 240 &&
    d.malicioso === undefined && d.nombre === undefined;
})());

t('rechaza un plazo inventado que el guion no autoriza', (() => {
  const guion = { propuesta: { inversion: '3.500 USD' } };
  return riesgoComercial('Te lo entrego en 3 semanas.', guion) && !riesgoComercial('Lo vemos en la primera fase.', guion);
})());
t('acepta la cifra si está en el guion (no bloquea el rango legítimo)',
  riesgoComercial('La inversión va de 3.500 a 12.000 USD.', { propuesta: { inversion: '3.500 – 12.000 USD' } }) === null);
t('rechaza una garantía no autorizada', /garantía/.test(riesgoComercial('Te lo garantizo al 100%.', {})));
t('validar rechaza la respuesta insegura y deja mandar al motor',
  validar({ respuesta: 'Te lo entrego en 2 semanas.' }, { guion: {} }) === null);

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · cerebro LLM verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
