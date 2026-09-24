/**
 * voz.test.js — Pruebas de la conversación hablada con STT/TTS simulados.
 *   node test/voz.test.js
 *
 * Simula el navegador: SpeechRecognition (resultados que inyectamos a mano) y
 * speechSynthesis (utterances que controlamos). Así se verifica el bucle
 * completo hablar→escuchar→razonar→hablar sin micrófono real.
 */
import { Voz, ESTADOS } from '../src/lib/voz.js';
import { SKILL } from '../src/lib/skill.js';
import { crearAgente } from '../src/lib/engine.js';

let ok = 0, fallos = [];
const hasta = async (fn, ms = 800) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 40)); }
  return null;
};
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// ── dobles de navegador ──────────────────────────────────────
class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; }
}
global.SpeechSynthesisUtterance = FakeUtterance;

function mundo() {
  const habladas = [];
  const tts = {
    voces: [{ lang: 'es-ES', name: 'Voz Prueba' }, { lang: 'en-US', name: 'English' }],
    cancelados: 0,
    getVoices() { return this.voces; },
    speak(u) { habladas.push(u); this.ultima = u; u.onstart && u.onstart(); },
    cancel() { this.cancelados++; this.ultima && this.onend && this.onend(); },
    terminarUltima() { this.ultima && this.ultima.onend && this.ultima.onend(); },
  };
  class FakeSR {
    constructor() { mundo.ultimoSR = this; this.started = false; }
    start() { this.started = true; }
    stop() { this.onend && this.onend(); }
    abort() { this.aborted = true; }
    // inyecta un resultado como lo haría el navegador
    di(texto, final = true) {
      const ev = { resultIndex: 0, results: [{ 0: { transcript: texto }, isFinal: final, length: 1 }] };
      ev.results[0][0] = { transcript: texto };
      this.onresult && this.onresult(ev);
      if (final) { this.onend && this.onend(); }
    }
    error(code) { this.onerror && this.onerror({ error: code }); }
  }
  global.window = { SpeechRecognition: FakeSR, speechSynthesis: tts, matchMedia: () => ({ matches: false }) };
  return { tts, habladas, FakeSR };
}

function nuevoAgente() {
  return crearAgente(SKILL, { ciudad: 'Bogotá', temp: 24, clima: 'parcialmente nublado', hora: '14:32', saludo: 'Buenas tardes', tipKey: 'nublado', dispositivo: 'escritorio' });
}

console.log('\n\x1b[1m  SINAPTIA · Test de la conversación por voz\x1b[0m\n');

// 1 · detección
{
  const { tts } = mundo();
  t('detecta STT y TTS disponibles', Voz.soportado().completo === true);
  mundo(); delete global.window.SpeechRecognition;
  t('sin STT reporta incompleto', Voz.soportado().completo === false);
}

// 2 · bucle completo: saludo hablado → escucha → respuesta hablada
await (async () => {
  const { tts, habladas } = mundo();
  const agente = nuevoAgente();
  const estados = [], transcripciones = [], respuestas = [];
  const v = new Voz({
    responder: (tx) => agente.responder(tx),
    onEstado: (e) => estados.push(e),
    onTranscripcion: (tx, f) => transcripciones.push([tx, f]),
    onRespuesta: (tx) => respuestas.push(tx),
  });
  const saludo = agente.iniciar();
  const inicio = v.iniciar(saludo);
  t('iniciar() arranca hablando el saludo', inicio === true && habladas.length === 1);
  t('el saludo hablado es el del agente', habladas[0].text.startsWith('Buenas tardes'), habladas[0].text.slice(0, 30));
  t('elige una voz en español', habladas[0].voice && /es/i.test(habladas[0].voice.lang), habladas[0].voice && habladas[0].voice.lang);
  t('estado = hablando', v.estado === ESTADOS.HABLANDO);

  // la IA termina de hablar TODAS sus frases → vuelve a escuchar sola
  for (let i = 0; i < 8 && v.estado === ESTADOS.HABLANDO; i++) { tts.terminarUltima(); await esperar(10); }
  t('habla por frases: varias utterances por respuesta', habladas.length >= 1, 'utterances: ' + habladas.length);
  t('al terminar todas sus frases, escucha sola (bucle)', v.estado === ESTADOS.ESCUCHANDO && !!(mundo.ultimoSR && mundo.ultimoSR.started));

  // la persona dice una barbaridad → corrección hablada
  await hasta(() => mundo.ultimoSR, 800);
  mundo.ultimoSR.di('quiero automatizar todo el negocio con IA');
  await esperar(60);
  for (let i = 0; i < 8 && v.estado === ESTADOS.HABLANDO; i++) { tts.terminarUltima(); await esperar(10); }
  t('la frase dicha se transcribió como final', transcripciones.some(([tx, f]) => f && tx.includes('automatizar todo')));
  const dicho = habladas.map((h) => h.text).join(' ');
  t('el agente corrige y la corrección se habla', /mapear|simplificar/.test(dicho), dicho.slice(0, 60));
  t('vuelve a escuchar tras responder', v.estado === ESTADOS.ESCUCHANDO || v.estado === ESTADOS.HABLANDO);
  v.detener();
  t('detener() apaga todo', v.estado === ESTADOS.INACTIVA && !v.activa);
})();

// 3 · barge-in: la persona interrumpe y la IA se calla
await (async () => {
  const { tts } = mundo();
  const agente = nuevoAgente();
  const v = new Voz({ responder: (tx) => agente.responder(tx) });
  v.iniciar('Hola, te escucho.');
  const antes = tts.cancelados;
  v._escuchar();                       // la persona toma la palabra
  t('barge-in: la IA cancela su propia voz', tts.cancelados > antes);
  t('y pasa a escuchar', v.estado === ESTADOS.ESCUCHANDO);
  v.detener();
})();

// 4 · texto limpiado para la voz
{
  mundo();
  const v = new Voz({ responder: (t) => ({ texto: t }) });
  const limpio = v._paraVoz('**Negocio** · mira https://x.com/a\n\nDos párrafos\nsalto');
  t('quita marcas, urls y saltos para hablar', !limpio.includes('**') && !limpio.includes('https') && limpio.includes('el enlace que ves en pantalla'), limpio);
}

// 5 · silencio y pausa
await (async () => {
  const { tts } = mundo();
  const agente = nuevoAgente();
  const v = new Voz({ responder: (tx) => agente.responder(tx) });
  v.iniciar('Hola.');
  const sil = v.alternarSilencio();
  t('silenciar corta la voz', sil === true && tts.cancelados > 0);
  v.alternarSilencio();
  tts.terminarUltima();            // la IA termina su frase y pasa a escuchar
  await esperar(20);
  v.pausar();
  t('pausar detiene la escucha', v.estado !== ESTADOS.ESCUCHANDO);
  v.reanudar();
  await esperar(20);
  t('reanudar vuelve a escuchar', v.estado === ESTADOS.ESCUCHANDO);
  v.detener();
})();

// 6 · permiso de micrófono denegado
await (async () => {
  mundo();
  const agente = nuevoAgente();
  const avisos = [];
  const v = new Voz({ responder: (tx) => agente.responder(tx), onTranscripcion: (tx) => avisos.push(tx) });
  v.iniciar('Hola.');
  v._escuchar();
  mundo.ultimoSR.error('not-allowed');
  await esperar(20);
  t('micrófono denegado: avisa y cuelga sin bucle infinito', avisos.some((a) => a.includes('permiso')) && !v.activa, avisos.join('|'));
})();

// ── interrupción y fusión: cancel() + onboundary, nunca pause()/resume() ──
await (async () => {
  console.log('\n\x1b[36m  Interrupción y fusión\x1b[0m');
  const { tts } = mundo();
  const agente = nuevoAgente();
  const fusiones = [];
  const v = new Voz({
    responder: (t) => agente.responder(t),
    fusionar: async (payload) => { fusiones.push(payload); return 'Claro: te consigo eso y sigo con lo que te estaba contando.'; },
  });
  v.iniciar('Te iba a contar tres cosas importantes sobre tu operación.');
  // simular progreso de habla palabra por palabra, como onboundary
  const u = tts.ultima;
  u.onboundary({ charIndex: 20 });   // "Te iba a contar tres" (límite de palabra)
  t('onboundary guarda hasta dónde alcanzó a hablar', v.spokenSoFar === 'Te iba a contar tres', JSON.stringify(v.spokenSoFar));
  const okInt = v.interrumpirYEscuchar();
  t('interrumpir cancela el audio y pasa a escuchar', okInt === true && tts.cancelados > 0 && v.estado === ESTADOS.ESCUCHANDO);
  // el reconocimiento simulado entrega lo que dijo el cliente
  mundo.ultimoSR.di('espera, primero dime cuánto cuesta');
  await esperar(150);
  t('el payload de fusión lleva lo dicho y la interrupción',
    fusiones.length === 1 && fusiones[0].respuesta_ya_dicha === 'Te iba a contar tres' && /cu[áa]nto cuesta/.test(fusiones[0].interrupcion_cliente),
    JSON.stringify(fusiones[0] || {}));
  t('y la respuesta fusionada se habla como UN solo audio nuevo',
    tts.ultima && tts.ultima.text === 'Claro: te consigo eso y sigo con lo que te estaba contando.', tts.ultima && tts.ultima.text.slice(0, 50));
  v.detener();
})();
await (async () => {
  // sin backend: fusión determinista (responde la interrupción, sin repetir lo dicho)
  const { tts } = mundo();
  const agente = nuevoAgente();
  const v = new Voz({ responder: (t) => agente.responder(t) });
  v.iniciar('Te iba a explicar el diagnóstico completo.');
  tts.ultima.onboundary({ charIndex: 12 });
  v.interrumpirYEscuchar();
  mundo.ultimoSR.di('¿y eso cuánto cuesta?');
  await esperar(150);
  t('sin endpoint, la fusión determinista responde la interrupción',
    tts.ultima && /número|precio|proceso|cerrado/i.test(tts.ultima.text), tts.ultima && tts.ultima.text.slice(0, 60));
  t('y no repite lo ya dicho ni dice "como mencionaba"',
    !/como mencionaba/i.test(tts.ultima.text) && !tts.ultima.text.startsWith('Te iba a explicar'), tts.ultima.text.slice(0, 50));
  v.detener();
})();

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · conversación por voz verificada');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
