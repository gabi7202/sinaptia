/**
 * ia-core.test.js — El proxy real (/api/ia) con un Groq falso, sin red.
 *   node test/ia-core.test.js
 */
import { manejarCuerpo, salud, origenValido, diagnosticoEnv } from '../infra/ia-core.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }
const j = (r) => JSON.parse(r.cuerpo);

function fake(texto, extra = {}) {
  const llamadas = [];
  return {
    llamadas,
    fetch: async (url, opts) => {
      llamadas.push({ url, opts, body: JSON.parse(opts.body) });
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: texto }, finish_reason: 'stop' }], usage: { total_tokens: 10 }, ...extra }) };
    },
  };
}

console.log('\n\x1b[1m  SINAPTIA · Proxy /api/ia (Groq)\x1b[0m\n');

t('salud no revela claves y declara proveedor/modelo/prompt',
  (() => {
    const s = salud({ GROQ_API_KEY: 'gsk-secreto' });
    return s.ok && s.proveedor === 'groq' && s.promptVersion && !JSON.stringify(s).includes('gsk-secreto');
  })());

t('origen permitido compara host exacto (evil-dominio.com no pasa)',
  origenValido('https://tu-dominio.com', 'https://tu-dominio.com') &&
  !origenValido('https://tu-dominio.com', 'https://tu-dominio.com.evil.com') &&
  !origenValido('https://tu-dominio.com', 'https://evil.com/tu-dominio.com'));

t('diagnóstico de entorno lista obsoletas por nombre, nunca por valor',
  (() => {
    const d = diagnosticoEnv({ GROQ_API_KEY: 'gsk-secreto', XAI_API_KEY: 'xai-secreto', CHAT_MODEL: 'grok-4.7', LEAD_EMAIL: 'privado@test.com' });
    const txt = JSON.stringify(d);
    return d.configurado.groq === true && d.configurado.email_privado === true &&
      d.obsoletas.includes('XAI_API_KEY') && d.obsoletas.includes('CHAT_MODEL') &&
      !txt.includes('gsk-secreto') && !txt.includes('xai-secreto') && !txt.includes('privado@test.com');
  })());

await (async () => {
  const f = fake(JSON.stringify({
    respuesta: 'Understood. What process costs you the most time?',
    intencion: 'diagnóstico: proceso',
    confianza: 0.82,
    datos: { sector: 'auto parts', dolor: 'quotes by hand' },
    paso: 'seguir',
    siguiente_accion: 'preguntar volumen',
    objecion: null,
    idioma_detectado: 'en',
  }));
  const r = await manejarCuerpo({
    mensaje: "We sell auto parts and quote by hand",
    historial: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
    idioma: 'en', canal: 'chat',
    guion: { siguiente: 'How many per month?' },
    memoria: { resumen: 'auto parts', lead: { empresa: 'Andes' }, turnos: [{ rol: 'user', texto: 'We sell auto parts' }] },
  }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  const c = j(r);
  t('respuesta 200 con contrato, proveedor y promptVersion',
    r.status === 200 && c.respuesta.includes('What process') && c.proveedor === 'groq' && c.promptVersion);
  t('el system prompt es el maestro, con idioma inglés y memoria',
    /Eres Nexa/.test(f.llamadas[0].body.messages[0].content) &&
    /responde siempre en English/.test(f.llamadas[0].body.messages[0].content) &&
    /<memoria_sesion>/.test(f.llamadas[0].body.messages[0].content));
  t('manda el historial y el mensaje actual',
    f.llamadas[0].body.messages.some((m) => m.content === 'hi') &&
    f.llamadas[0].body.messages.some((m) => m.content === 'We sell auto parts and quote by hand'));
  t('no duplica el mensaje actual en la memoria',
    (f.llamadas[0].body.messages[0].content.match(/We sell auto parts and quote by hand/g) || []).length <= 1);
})();

await (async () => {
  const f = fake(JSON.stringify({ respuesta: 'Te lo entrego en 3 semanas.', datos: {}, paso: 'seguir' }));
  const r = await manejarCuerpo({
    mensaje: 'hola', idioma: 'es', canal: 'chat', guion: { propuesta: {} },
  }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  t('una promesa de plazo se rechaza con 422 (responde el motor)',
    r.status === 422 && /plazo/.test(j(r).motivo));
})();

await (async () => {
  const f = fake(JSON.stringify({ respuesta: 'La inversión va de 3.500 a 12.000 USD.', datos: {}, paso: 'seguir' }));
  const r = await manejarCuerpo({
    mensaje: '¿cuánto?', idioma: 'es', canal: 'chat', guion: { propuesta: { inversion: '3.500 – 12.000 USD' } },
  }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  t('una cifra que sí está en el guion se acepta', r.status === 200 && /3.500/.test(j(r).respuesta));
})();

await (async () => {
  const f = fake('Traducción limpia.');
  const r = await manejarCuerpo({ traducir: { texto: 'Hola', de: 'es', a: 'en' } }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  t('traducción devuelve texto y usa prompt de traducción',
    r.status === 200 && j(r).traducido === 'Traducción limpia.' && /Traduce de español a inglés/.test(f.llamadas[0].body.messages[0].content));
})();

await (async () => {
  const f = fake('Resumen en español.');
  const r = await manejarCuerpo({ resumir: { conversacion: 'USUARIO: hola', idioma: 'es' } }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  t('resumen devuelve texto', r.status === 200 && j(r).resumen === 'Resumen en español.');
})();

await (async () => {
  const f = fake(JSON.stringify({ respuesta_fusionada: 'Sigo con lo del volumen.' }));
  const r = await manejarCuerpo({ respuesta_ya_dicha: 'Te explicaba', interrupcion_cliente: '¿y el precio?' }, { GROQ_API_KEY: 'gsk-test' }, f.fetch);
  t('fusión devuelve UNA respuesta', r.status === 200 && j(r).respuesta_fusionada === 'Sigo con lo del volumen.');
})();

await (async () => {
  const r = await manejarCuerpo({ mensaje: 'hola' }, {}, fake('x').fetch);
  t('sin proveedor devuelve 503 limpio (el motor sigue)', r.status === 503 && /sin proveedor/.test(j(r).error));
})();

await (async () => {
  const r = await manejarCuerpo({ mensaje: '   ' }, { GROQ_API_KEY: 'g' }, fake('x').fetch);
  t('mensaje vacío → 400', r.status === 400);
})();

await (async () => {
  const f = fake('no-json');
  const r = await manejarCuerpo({ mensaje: 'hola' }, { GROQ_API_KEY: 'g' }, f.fetch);
  t('respuesta que no es JSON → 502, nunca una respuesta rota', r.status === 502);
})();

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · proxy /api/ia verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
