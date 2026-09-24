/**
 * remoto.test.js — Cliente del backend de voz (streaming + memoria en servidor).
 *   node test/remoto.test.js
 *
 * fetch simulado: verifica el protocolo completo (session → chat en stream →
 * end) y el fraccionador que permite hablar la primera frase mientras Claude
 * sigue escribiendo.
 */
import { crearRemoto, fraccionar } from '../src/lib/remoto.js';

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Test del cliente remoto (fusión A+B)\x1b[0m\n');

const SID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function streamDe(texto, trozos = 3) {
  const enc = new TextEncoder();
  const partes = [];
  if (Array.isArray(trozos)) {
    for (const s of trozos) partes.push(enc.encode(s));
  } else {
    const bytes = enc.encode(texto);
    const paso = Math.max(1, Math.ceil(bytes.length / trozos));
    for (let i = 0; i < bytes.length; i += paso) partes.push(bytes.slice(i, i + paso));
  }
  let k = 0;
  return { getReader: () => ({ read: async () => (k < partes.length ? { done: false, value: partes[k++] } : { done: true, value: undefined }) }) };
}

function fetchFake(rutas) {
  const llamadas = [];
  const claveDe = (url) => (String(url).endsWith('/session') ? 'session' : String(url).endsWith('/chat') ? 'chat' : String(url).endsWith('/end') ? 'end' : 'otra');
  return {
    llamadas,
    impl: async (url, opts = {}) => {
      llamadas.push({ url: String(url), opts });
      const r = rutas[claveDe(url)];
      if (typeof r === 'function') return r(opts);
      return r || { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    },
  };
}

console.log('\x1b[36m  1 · Sesión\x1b[0m');
{
  const f = fetchFake({ session: { ok: true, json: async () => ({ sessionId: SID, saludo: 'Hola, soy Nexa.', conocido: false }) } });
  const r = crearRemoto({ base: '/api/voz', idioma: 'es', fetchImpl: f.impl });
  const s = await r.iniciar();
  t('iniciar hace POST /session con consentimiento y el idioma', (() => {
    const c = f.llamadas[0];
    return c.url === '/api/voz/session' && c.opts.method === 'POST' &&
      JSON.parse(c.opts.body).consent === true && JSON.parse(c.opts.body).lang === 'es';
  })());
  t('devuelve el saludo del servidor y guarda sessionId', s.saludo === 'Hola, soy Nexa.' && r.sessionId === SID);
  t('base con barra final no duplica la ruta', await (async () => {
    const f2 = fetchFake({ session: { ok: true, json: async () => ({ sessionId: SID, saludo: 'x' }) } });
    await crearRemoto({ base: 'https://sitio.com/api/voz/', fetchImpl: f2.impl }).iniciar();
    return f2.llamadas[0].url === 'https://sitio.com/api/voz/session';
  })());
  t('si /session falla, iniciar lanza (la página degrada a local)', await (async () => {
    const f3 = fetchFake({ session: { ok: false, status: 503, json: async () => ({}) } });
    try { await crearRemoto({ base: '/api/voz', fetchImpl: f3.impl }).iniciar(); return false; }
    catch (e) { return /503/.test(e.message); }
  })());
}

console.log('\n\x1b[36m  2 · Turno en streaming\x1b[0m');
{
  const f = fetchFake({
    session: { ok: true, json: async () => ({ sessionId: SID, saludo: 'hola' }) },
    chat: { ok: true, status: 200, body: streamDe('¡Claro! Te explico. Segundo trozo.', ['¡Claro! ', 'Te explico. ', 'Segundo trozo.']) },
  });
  const r = crearRemoto({ base: '/api/voz', fetchImpl: f.impl });
  await r.iniciar();
  const deltas = [];
  const res = await r.enviar('cuéntame', (trozo, lleno) => deltas.push({ trozo, lleno }));
  t('enviar hace POST /chat con sessionId y texto', (() => {
    const c = f.llamadas[1];
    return c.opts.method === 'POST' && JSON.parse(c.opts.body).sessionId === SID && JSON.parse(c.opts.body).text === 'cuéntame';
  })());
  t('onDelta recibe los trozos y el acumulado en vivo', deltas.length === 3 && deltas[0].trozo === '¡Claro! ' && deltas[2].lleno === '¡Claro! Te explico. Segundo trozo.');
  t('devuelve el texto completo sin error', res.texto === '¡Claro! Te explico. Segundo trozo.' && res.error === null);
  t('textos larguísimos se recortan a 1000 (techo de B)', await (async () => {
    const f2 = fetchFake({ session: { ok: true, json: async () => ({ sessionId: SID }) }, chat: { ok: true, status: 200, body: streamDe('ok') } });
    const r2 = crearRemoto({ base: '/api/voz', fetchImpl: f2.impl });
    await r2.iniciar();
    await r2.enviar('x'.repeat(3000));
    return JSON.parse(f2.llamadas[1].opts.body).text.length === 1000;
  })());

  const f429 = fetchFake({
    session: { ok: true, json: async () => ({ sessionId: SID }) },
    chat: { ok: false, status: 429, json: async () => ({ error: 'limit' }) },
  });
  const r429 = crearRemoto({ base: '/api/voz', fetchImpl: f429.impl });
  await r429.iniciar();
  const lim = await r429.enviar('hola');
  t('429 del servidor → error "limit" (la UI avisa, no rompe)', lim.error === 'limit' && lim.texto === '');

  const fRed = fetchFake({ session: { ok: true, json: async () => ({ sessionId: SID }) }, chat: () => { throw new Error('red caída'); } });
  const rRed = crearRemoto({ base: '/api/voz', fetchImpl: fRed.impl });
  await rRed.iniciar();
  t('red caída en el turno → error "red", sin excepción', (await rRed.enviar('hola')).error === 'red');

  const rSin = crearRemoto({ base: '/api/voz', fetchImpl: async () => ({ ok: true }) });
  t('enviar sin sesión → error controlado', (await rSin.enviar('hola')).error === 'sin_sesion');
}

console.log('\n\x1b[36m  3 · Cierre (dispara el resumen)\x1b[0m');
{
  const f = fetchFake({
    session: { ok: true, json: async () => ({ sessionId: SID }) },
    end: { ok: true, json: async () => ({ ok: true, resumen: true }) },
  });
  const r = crearRemoto({ base: '/api/voz', fetchImpl: f.impl });
  await r.iniciar();
  const cerrado = await r.cerrar();
  t('cerrar hace POST /end con keepalive (sobrevive al cierre de pestaña)', cerrado === true && f.llamadas[1].url === '/api/voz/end' && f.llamadas[1].opts.keepalive === true && JSON.parse(f.llamadas[1].opts.body).sessionId === SID);
  t('tras cerrar, la sesión local se limpia', r.sessionId === null && (await r.cerrar()) === false);
  const fMal = fetchFake({ session: { ok: true, json: async () => ({ sessionId: SID }) }, end: () => { throw new Error('no red'); } });
  const rMal = crearRemoto({ base: '/api/voz', fetchImpl: fMal.impl });
  await rMal.iniciar();
  t('si /end no llega, no explota: el cron de rescate resume igual', (await rMal.cerrar()) === false);
}

console.log('\n\x1b[36m  4 · Fraccionador (hablar antes de que termine)\x1b[0m');
{
  const fr = fraccionar();
  t('suelta la frase en cuanto se cierra el punto', JSON.stringify(fr.push('Hola. ¿Qué ')) === '["Hola."]');
  t('lo incompleto espera en el búfer', JSON.stringify(fr.push('tal? Bien')) === '["¿Qué tal?"]');
  t('flush entrega lo que quedó al final del stream', JSON.stringify(fr.flush()) === '["Bien"]' && JSON.stringify(fr.flush()) === '[]');
  const fr2 = fraccionar();
  fr2.push('Sin cierre todavía');
  t('sin signo de cierre no emite nada prematuro', JSON.stringify(fr2.push(' y sigue')) === '[]');
  const fr3 = fraccionar();
  t('un espacio tras el punto cierra la frase aunque el trozo termine ahí', JSON.stringify(fr3.push('Listo. ')) === '["Listo."]' && fr3.flush().length === 0);
  const fr4 = fraccionar();
  fr4.push('Qué ¡bue');
  t('el búfer junta trozos y separa por signo + espacio', JSON.stringify(fr4.push('no! Sí.')) === '["Qué ¡bueno!"]');
  t('la última frase (sin espacio final) sale en el flush', JSON.stringify(fr4.flush()) === '["Sí."]');
}

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · cliente remoto verificado');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
