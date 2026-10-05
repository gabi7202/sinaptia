/**
 * ambiente.test.js — Música ambiental de la sala (src/lib/ambiente.js).
 *   node test/ambiente.test.js
 *
 * Reglas de producto verificadas:
 *   · suena MUY bajita (≈10%) y en bucle tras un gesto del visitante;
 *   · entra el modo voz → se pausa; sale → retoma donde quedó;
 *   · en /voz no hay música (puedeSonar() ⇒ false ⇒ silencio total);
 *   · el botón "música" silencia para siempre (decisión explícita);
 *   · fade-in suave, fade-out rápido; nada de red hasta el primer gesto.
 */
import { JSDOM } from 'jsdom';
import { Ambiente } from '../src/lib/ambiente.js';

let ok = 0, fallos = [];
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + nombre); }
  else { fallos.push(nombre + (detalle ? ' → ' + detalle : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + nombre + (detalle ? '\n      ↳ ' + detalle : '')); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n\x1b[1m  SINAPTIA · Música ambiental (Ambiente)\x1b[0m\n');

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  const w = dom.window;

  // ── stubs deterministas: ni red real ni Audio real en Node ──────────────
  let creados = 0;
  class FakeAudio {
    constructor(src) { this.src = src; this.volume = 1; this.paused = true; this.loop = false; this.preload = ''; this.playLlamadas = 0; this.pauseLlamadas = 0; creados++; }
    async play() { this.playLlamadas++; if (this._falla) throw new Error('autoplay bloqueado'); this.paused = false; }
    pause() { this.pauseLlamadas++; this.paused = true; }
  }
  w.Audio = FakeAudio;
  globalThis.Audio = FakeAudio;
  globalThis.window = w;   // ambiente.js usa window.addEventListener (conectarGestos)

  let rafId = 0;
  const rafs = [];
  globalThis.requestAnimationFrame = (fn) => { const id = ++rafId; rafs.push({ id, fn }); return id; };
  globalThis.cancelAnimationFrame = (id) => { const i = rafs.findIndex((r) => r.id === id); if (i >= 0) rafs.splice(i, 1); };
  const NOW = () => Date.now();
  const step = () => { const lote = rafs.splice(0); for (const r of lote) r.fn(NOW()); };

  // 1 · audio perezoso: construir NO toca la red
  let sonar = true;
  const amb = new Ambiente({ puedeSonar: () => sonar });
  t('construir Ambiente no crea <audio> (lazy)', amb.el === null && creados === 0);

  // 2 · gesto → suena bajita y en bucle
  amb.iniciar();
  await esperar(10);
  t('iniciar() crea el audio recién al sonar', amb.el instanceof FakeAudio && creados === 1);
  t('el loop es infinito (banda sonora continua)', amb.el.loop === true);
  t('preload none: sin ancho de banda prematuro', amb.el.preload === 'none');
  t('arranca en volumen 0 (fade-in, nadie se asusta)', amb.el.volume === 0);
  for (let i = 0; i < 40; i++) { await esperar(70); step(); }
  t('sube suave hasta ≈10% del volumen', Math.abs(amb.el.volume - 0.1) < 0.02, 'v=' + amb.el.volume);

  // 3 · modo voz → pausa suave; sale → retoma
  amb.pausar();
  for (let i = 0; i < 15; i++) { await esperar(60); step(); }
  t('entrar en modo voz pausa la música', amb.el.paused === true);
  t('la pausa baja el volumen a 0 antes de pausar (fade-out)', amb.el.volume < 0.01, 'v=' + amb.el.volume);
  const playAntes = amb.el.playLlamadas;
  amb.reanudar();
  await esperar(10);
  t('salir del modo voz retoma la música', !amb.el.paused && amb.el.playLlamadas === playAntes + 1);

  // 4 · regla /voz: puedeSonar=false ⇒ silencio total, ni play ni reanudar
  sonar = false;
  amb.pausar();
  for (let i = 0; i < 15; i++) { await esperar(60); step(); }
  const playsVoz = amb.el.playLlamadas;
  amb.reanudar();
  amb.iniciar();
  await esperar(10);
  t('en /voz la música no retoma aunque lo intenten', amb.el.paused === true && amb.el.playLlamadas === playsVoz);

  // 5 · decisión explícita del visitante (botón) gana sobre todo
  sonar = true;
  amb.alternarSilencio();          // silenciado = true
  for (let i = 0; i < 15; i++) { await esperar(60); step(); }
  const playsSil = amb.el.playLlamadas;
  amb.iniciar(); amb.reanudar();
  await esperar(10);
  t('el botón "música off" silencia de forma persistente', amb.silenciado && amb.el.paused && amb.el.playLlamadas === playsSil);
  amb.alternarSilencio();          // vuelve
  await esperar(10);
  t('otro clic reactiva la música', !amb.silenciado && !amb.el.paused);

  // 6 · autoplay bloqueado (sin gesto válido): no revienta, reintenta
  const amb2 = new Ambiente({});
  amb2.iniciar();                  // primer audio: play OK
  await esperar(10);
  const elPrimero = amb2.el;
  amb2.el = null;                  // fuerza recrear un audio "rechazado" por el navegador
  amb2.silenciado = false;
  const guardado = FakeAudio.prototype.play;
  FakeAudio.prototype.play = async function () { this.playLlamadas++; throw new Error('autoplay bloqueado'); };
  let revento = false;
  try { await amb2.iniciar(); } catch (_) { revento = true; }
  FakeAudio.prototype.play = guardado;
  t('play() rechazado ⇒ falla silencioso (no rompe) y queda en pausa',
    !revento && amb2.el !== elPrimero && amb2.el.paused === true);

  // 7 · conectarGestos arma los gatillos de una sola vez
  const amb3 = new Ambiente({});
  let disparos = 0;
  amb3.iniciar = () => { disparos++; };
  amb3.conectarGestos();
  w.dispatchEvent(new w.Event('pointerdown'));
  w.dispatchEvent(new w.Event('keydown'));
  w.dispatchEvent(new w.Event('scroll'));
  t('click/tecla/scroll encienden la sala (once por evento)', disparos === 3, 'disparos=' + disparos);

  // 8 · volumen configurado desde fuera respeta límites
  const amb4 = new Ambiente({ volumen: 5 });
  t('volumen fuera de rango se recorta a 1', amb4.volumen === 1);

  console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
  const total = ok + fallos.length;
  if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · reglas de la música ambiental verificadas');
  else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
  console.log('');
  w.close();
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n  \x1b[31mError fatal:\x1b[0m', e); process.exit(2); });
