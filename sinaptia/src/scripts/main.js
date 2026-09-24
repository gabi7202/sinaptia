/**
 * main.js — Arranque del sitio en el cliente.
 * Resuelve el contexto, viste el panel como consola viva, escribe el saludo,
 * y cablea el agente + PDF + webhook.
 */
import { CONFIG } from '../config.js';
import { SKILL } from '../lib/skill.js';
import { crearAgente } from '../lib/engine.js';
import { obtenerContexto, geocodar } from '../lib/weather.js';
import { PDFDoc } from '../lib/pdf.js';
import { Voz, ESTADOS } from '../lib/voz.js';
import { packPor, IDIOMAS } from '../lib/i18n.js';
import { BD } from '../lib/bd.js';
import { razonar } from '../lib/ia.js';
import { perfilPor, motorNegocio } from '../lib/negocio.js';
import { Funnel } from '../lib/funnel.js';
import { Memoria, textoRecuerdo } from '../lib/memoria.js';

const $ = (id) => document.getElementById(id);

/* ══════════ 1 · Panel de contexto vivo ══════════ */

function cieloPara(code, esDeNoche) {
  if (esDeNoche) return 'noche';
  if (code >= 95) return 'lluvia';
  if (code >= 51 && code <= 82) return 'lluvia';
  if (code === 3 || code === 45 || code === 48) return 'nublado';
  if (code === 2) return 'nublado';
  return 'despejado';
}

function vestirCielo(cielo) {
  const sky = $('ctx-sky');
  sky.dataset.cielo = cielo;
  $('ctx-sol').hidden = !(cielo === 'despejado');
  // lluvia
  const ll = $('ctx-lluvia'); ll.innerHTML = '';
  if (cielo === 'lluvia') {
    for (let i = 0; i < 26; i++) {
      const g = document.createElement('div');
      g.className = 'gota';
      g.style.left = Math.random() * 100 + '%';
      g.style.animationDuration = (0.7 + Math.random() * 0.8) + 's';
      g.style.animationDelay = (Math.random() * 1.6) + 's';
      ll.appendChild(g);
    }
  }
  // estrellas
  const es = $('ctx-estrellas'); es.innerHTML = '';
  if (cielo === 'noche') {
    for (let i = 0; i < 34; i++) {
      const e = document.createElement('div');
      e.className = 'estrella';
      e.style.left = Math.random() * 100 + '%';
      e.style.top = Math.random() * 78 + '%';
      e.style.animationDelay = (Math.random() * 3) + 's';
      es.appendChild(e);
    }
  }
}

async function resolverContexto() {
  const t0 = performance.now();
  const params = new URLSearchParams(location.search);
  const ciudadForzada = params.get('ciudad') || params.get('city');
  let ctx;
  if (ciudadForzada) {
    try {
      const g = await geocodar(ciudadForzada);
      ctx = await obtenerContexto({ ciudad: g.ciudad, pais: g.pais, lat: g.lat, lon: g.lon });
    } catch (e) { ctx = await obtenerContexto({ ciudad: CONFIG.ciudadRespaldo }); }
  } else {
    ctx = await obtenerContexto({ ciudad: CONFIG.ciudadRespaldo });
  }
  const ms = Math.round(performance.now() - t0);

  vestirCielo(cieloPara(ctx.code, ctx.esDeNoche));
  $('ctx-ciudad-tag').textContent = ctx.ciudad;
  $('ctx-temp').classList.remove('cargando');
  $('ctx-temp').innerHTML = ctx.temp + '°<small>C</small>';
  $('ctx-cond').classList.remove('cargando');
  $('ctx-cond').textContent = ctx.clima;

  const nav = $('nav-live');
  nav.classList.remove('resolviendo');
  $('nav-live-txt').textContent = ctx.ciudad.toLowerCase() + ' · ' + ctx.temp + '° · ' + ctx.hora;

  return ctx;
}

/* ══════════ 2 · Saludo con máquina de escribir ══════════ */

function escribir(el, texto, cb) {
  const curViejo = el.querySelector('.cur');
  if (!CONFIG.ui.efectoEscritura) {
    el.textContent = texto;
    if (curViejo) { curViejo.hidden = false; el.appendChild(curViejo); }
    if (cb) cb(); return;
  }
  el.textContent = '';
  const tn = document.createTextNode('');
  const cur = curViejo || document.createElement('span');
  cur.className = 'cur'; cur.hidden = false;
  el.appendChild(tn); el.appendChild(cur);
  let i = 0;
  (function paso() {
    tn.textContent = texto.slice(0, i);
    if (i <= texto.length) { i++; setTimeout(paso, 15 + Math.random() * 24); }
    else { cur.remove(); if (cb) cb(); }
  })();
}

/* ══════════ 3 · Agente ══════════ */

const PARAMS = new URLSearchParams(location.search);
const NEGOCIO = perfilPor(PARAMS.get('negocio'));
let motorActivo = null;

/* Base de datos: todo turno, lead, llamada y PDF deja un registro JSON. */
const bd = new BD({
  remoto: (CONFIG.bd && CONFIG.bd.url) || null,
  supabase: (CONFIG.bd && CONFIG.bd.supabase) || null,
});
const funnel = new Funnel(bd);
const memoria = new Memoria();
let recordadoEnSesion = false;
setInterval(() => bd.sincronizar(), 20000);
window.addEventListener('beforeunload', () => bd.sincronizar());

/* Fusión de interrupción: el worker devuelve UNA respuesta fusionada. */
async function razonarFusion(endpoint, payload) {
  try {
    const r = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, idioma: pack.codigo, canal: 'voz' }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

/* Responder con IA si hay proxy; si no, motor. Siempre dejando registro. */
async function responderAgente(texto, canal, historial) {
  // Memoria: si reconoce al cliente, retoma en vez de empezar de cero
  if (!recordadoEnSesion) {
    const hit = memoria.recordar(texto);
    if (hit) {
      recordadoEnSesion = true;
      const p = hit.perfil;
      if (agente && agente.precargar) agente.precargar(p);
      const texto2 = textoRecuerdo(p, pack.codigo);
      bd.registrar('turno', { canal, memoria: 'recall', usuario: texto, respuesta: texto2, guion: { intencion: 'cliente recurrente' } });
      funnel.marcar('recall');
      return { texto: texto2, guion: { intencion: 'cliente recurrente', memoria: p } };
    }
  }
  if (motorActivo) {
    const rn = motorActivo.responder(texto);
    bd.registrar('turno', { canal, negocio: NEGOCIO.id, usuario: texto, intencion: rn.guion.intencion, respuesta: rn.texto, guion: rn.guion });
    return rn;
  }
  const endpoint = CONFIG.ia && CONFIG.ia.endpoint;
  const r = agente.responder(texto);           // avanza el estado y produce el guion
  let mostrar = r.texto, modo = 'motor', intencion = r.guion.intencion, confianza = null;
  if (endpoint) {
    const j = await razonar({ mensaje: texto, historial: historial || [], idioma: pack.codigo, canal, lead: r.guion.lead, guion: r.guion, endpoint });
    if (j) {
      mostrar = j.respuesta; modo = 'ia'; intencion = j.intencion; confianza = j.confianza;
      // la IA rellena huecos que el motor no capturó, nunca pisa lo ya dicho
      for (const [k, v] of Object.entries(j.datos || {})) {
        if (v == null || v === '') continue;
        if (k === 'sector' && !agente.lead.sector) agente.lead.sector = String(v).slice(0, 80);
        if (k === 'dolor' && !agente.lead.dolor) agente.lead.dolor = String(v).slice(0, 220);
        if (k === 'nombre' && !agente.lead.nombre) agente.lead.nombre = String(v).slice(0, 60);
        if (k === 'email' && !agente.lead.email) agente.lead.email = String(v).slice(0, 80);
        if (k === 'empresa' && !agente.lead.empresa) agente.lead.empresa = String(v).slice(0, 80);
      }
    }
  }
  r.texto = mostrar;
  bd.registrar('turno', { canal, idioma: pack.codigo, modo, usuario: texto, intencion, confianza, respuesta: mostrar, guion: r.guion });
  return r;
}
let pack = packPor(PARAMS.get('lang') || (navigator.language || 'es'));
let agente = null, ctx = null, iniciado = false, ocupado = false;
let historialChat = [];
const mensajes = $('mensajes'), entrada = $('entrada');

function burbuja(rol, texto) {
  const d = document.createElement('div');
  d.className = 'msg ' + rol; d.textContent = texto;
  mensajes.appendChild(d); mensajes.scrollTop = mensajes.scrollHeight;
  return d;
}
function marcando(txt) {
  const d = burbuja('bot', '');
  d.innerHTML = txt.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  mensajes.scrollTop = mensajes.scrollHeight;
  return d;
}
function typing() {
  const d = document.createElement('div'); d.className = 'typing';
  d.innerHTML = '<i></i><i></i><i></i>';
  mensajes.appendChild(d); mensajes.scrollTop = mensajes.scrollHeight;
  return d;
}
function quick(opts) {
  const q = $('quick'); q.innerHTML = '';
  (opts || []).forEach((t) => {
    const b = document.createElement('button'); b.textContent = t;
    b.onclick = () => enviar(t); q.appendChild(b);
  });
}
function actualizarPasos() {
  const mapa = { sector: 1, dolor: 2, volumen: 3, contacto: 4, propuesta: 5, pdf_ofrecido: 5, pdf_listo: 5, fin: 5 };
  const n = mapa[agente.estado.etapa] || 0;
  const spans = $('pasos').children;
  for (let i = 0; i < spans.length; i++) spans[i].className = i < n ? 'on' : '';
  $('p-estado').textContent = n >= 5 ? 'brief listo para generar' : 'diagnóstico en curso · paso ' + Math.max(1, n) + ' de 5';
}
function abrir() {
  $('panel').classList.add('abierto');
  $('fab-badge').style.display = 'none';
  if (!window.__saludado && iniciado) {
    window.__saludado = true;
    marcando(window.__primerMensaje);
    actualizarPasos();
    quick(['Vendemos repuestos', 'Somos una clínica', 'Software para logística']);
  }
  entrada.focus();
}
function cerrar() { $('panel').classList.remove('abierto'); }

function enviar(texto) {
  texto = (texto != null ? texto : entrada.value).trim();
  if (!texto || ocupado || !iniciado) return;
  ocupado = true; $('enviar').disabled = true; entrada.value = '';
  burbuja('user', texto); quick([]);
  historialChat.push({ role: 'user', content: texto });
  const t = typing();
  setTimeout(async () => {
    t.remove();
    const r = await responderAgente(texto, 'chat', historialChat.slice(0, -1));
    marcando(r.texto);
    historialChat.push({ role: 'bot', content: r.texto });
    actualizarPasos();
    if (r.listoParaPdf) {
      $('pdfbtn').style.display = 'block'; enviarLead(); quick([]);
      funnel.marcar('lead');
      memoria.guardar({
        nombre: agente.lead.nombre, negocio: agente.lead.sector,
        necesidad: agente.lead.dolor, idioma: pack.codigo,
        resumen: (agente.lead.dolor || '').slice(0, 200),
      });
      bd.registrar('lead', { lead: agente.lead, correcciones: agente.estado.correcciones });
      bd.registrar('pdf', { lead: agente.lead });
      bd.sincronizar();
    }
    else if (agente.estado.etapa === 'sector') quick(['Vendemos repuestos', 'Somos una clínica', 'Software para logística']);
    else if (agente.estado.etapa === 'volumen') quick(['Unas 300 al mes', 'No sé']);
    else if (agente.estado.etapa === 'propuesta' || agente.estado.etapa === 'pdf_ofrecido') quick(['Sí, dame el PDF', 'No, gracias']);
    ocupado = false; $('enviar').disabled = false; entrada.focus();
  }, 420 + Math.random() * 420);
}

function enviarLead() {
  const payload = {
    origen: 'agente-web', ts: new Date().toISOString(),
    contexto: { ciudad: ctx.ciudad, pais: ctx.pais, temp: ctx.temp, clima: ctx.clima, hora: ctx.hora, dispositivo: ctx.dispositivo },
    lead: agente.lead,
    correcciones: agente.estado.correcciones,
    propuesta: agente.estado.propuesta ? { titulo: agente.estado.propuesta.titulo, inversion: agente.estado.propuesta.inversion } : null,
  };
  try { localStorage.setItem('sinaptia:lead:' + Date.now(), JSON.stringify(payload)); } catch (e) {}
  if (CONFIG.webhookUrl) {
    fetch(CONFIG.webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
  }
}

/* ══════════ 4 · PDF ══════════ */

function fecha() { return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()); }
function slug(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); }

function generarPdf() {
  const L = agente.lead, C = ctx;
  const d = new PDFDoc({ titulo: 'Brief de implementación de IA — ' + (L.empresa || L.nombre) });
  d.titulo('Brief de implementación de IA');
  d.parrafo('Preparado para ' + (L.empresa || '—') + ' · ' + C.ciudad + ' · ' + fecha() +
            ' · Primer contacto: ' + C.hora + ' hora local, ' + C.temp + '° y ' + C.clima + '.');
  d.sub('1 · Datos del prospecto');
  d.claveValor('Contacto', L.nombre || '—');
  d.claveValor('Email', L.email || '—');
  if (L.telefono) d.claveValor('Teléfono', L.telefono);
  d.claveValor('Empresa', L.empresa || '—');
  d.claveValor('Sector', L.sector || '—');
  d.claveValor('Volumen declarado', L.volumen || 'sin dato');
  d.sub('2 · Dolor declarado');
  d.parrafo(L.dolor || '—');
  d.sub('3 · Propuesta');
  const P = agente.estado.propuesta || SKILL.propuestas.porDefecto;
  d.parrafo(P.titulo + '. ' + P.que);
  d.parrafo(P.fases);
  d.claveValor('Inversión estimada', P.inversion);
  d.sub('4 · Expectativas ajustadas durante la conversación');
  if (agente.estado.correcciones.length) agente.estado.correcciones.forEach((c) => d.vineta(c.porque));
  else d.vineta('No fue necesario ajustar expectativas: el planteamiento inicial era correcto.');
  d.aviso('Lo que NO recomendamos automatizar: ' + P.no);
  d.sub('5 · Siguientes pasos');
  d.vineta('Revisar este brief con quien decida contigo.');
  d.vineta('Agendar una llamada: ' + CONFIG.marca.agenda);
  d.vineta('Si se aprueba: kickoff y acceso a sistemas en la semana 1.');
  d.separador();
  d.parrafo(CONFIG.pdf.pie + ' · ' + CONFIG.marca.email + ' · ' + CONFIG.marca.web);
  d.descargar(CONFIG.pdf.nombreArchivo + '-' + slug(L.empresa || L.nombre || 'brief') + '.pdf');
  burbuja('sys', 'PDF generado y descargado.');
}

/* ══════════ 5 · Animación de página ══════════ */

const MENOS_MOVIMIENTO = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function contarHasta(el, objetivo, ms) {
  if (MENOS_MOVIMIENTO) { el.textContent = String(objetivo); return; }
  const t0 = performance.now();
  (function paso(t) {
    const p = Math.min(1, (t - t0) / ms);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(objetivo * ease));
    if (p < 1) requestAnimationFrame(paso);
  })(t0);
}

function revelar(el) {
  el.classList.add('revelado');
  el.querySelectorAll('[data-count]').forEach((c) => contarHasta(c, parseInt(c.dataset.count, 10), 900));
  el.querySelectorAll('.fill').forEach((f) => { f.style.width = f.dataset.w || f.style.width; });
}

function animarPagina() {
  // etiqueta automática: títulos, tarjetas, pasos, casos, barras, situaciones
  const objetivos = document.querySelectorAll(
    '.sec-head, .card, .pain, .step, .case, .corr, .bar, .situation, .lm-card, .proj-note, .cta-final .cta-row');
  objetivos.forEach((el, i) => {
    el.setAttribute('data-reveal', '');
    el.style.transitionDelay = Math.min(i % 4, 3) * 70 + 'ms';
  });
  // las barras guardan su ancho y arrancan en 0 para poder crecer
  document.querySelectorAll('.fill').forEach((f) => { f.dataset.w = f.style.width; f.style.width = '0%'; });

  if (MENOS_MOVIMIENTO || !('IntersectionObserver' in window)) {
    objetivos.forEach(revelar);
    return;
  }
  const io = new IntersectionObserver((entradas) => {
    entradas.forEach((e) => {
      if (!e.isIntersecting) return;
      revelar(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
  objetivos.forEach((el) => io.observe(el));
}

/* Acordeón de situaciones: una abierta a la vez → nunca hay dos para comparar. */
function acordeon() {
  const sits = Array.from(document.querySelectorAll('.situation'));
  const medir = (sit) => {
    const body = sit.querySelector('.sit-body');
    body.style.maxHeight = sit.classList.contains('abierto') ? body.scrollHeight + 'px' : '0px';
  };
  sits.forEach((sit) => {
    const head = sit.querySelector('.sit-head');
    head.addEventListener('click', () => {
      const abierto = sit.classList.contains('abierto');
      sits.forEach((o) => {
        o.classList.toggle('abierto', !abierto && o === sit);
        o.querySelector('.sit-head').setAttribute('aria-expanded', String(!abierto && o === sit));
        medir(o);
      });
      if (!abierto) setTimeout(() => medir(sit), 60);   // el contenido ya desplegado puede crecer
    });
    medir(sit);
  });
  window.addEventListener('resize', () => sits.forEach(medir));
  // los "?" de detalle técnico
  document.querySelectorAll('.sit-detail .why').forEach((b) => {
    b.addEventListener('click', () => {
      const li = b.closest('li');
      li.classList.toggle('mostrando');
      const sit = b.closest('.situation');
      const body = sit.querySelector('.sit-body');
      if (sit.classList.contains('abierto')) body.style.maxHeight = body.scrollHeight + 40 + 'px';
    });
  });
}

const ctaAgendar = $('cta-agendar');
if (ctaAgendar) ctaAgendar.addEventListener('click', () => {
  abrir();
  enviar('Quiero agendar una llamada. ¿Qué horarios tienes y qué necesitas saber de mí antes?');
});

/* Lo que no es crítico para el primer render se inicializa en el tiempo ocioso
   del navegador: el hilo principal queda libre para pintar y responder. */
function alRalentizar(fn) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(fn, { timeout: 1200 });
  else setTimeout(fn, 400);
}

/* ══════════ 5b · Calculadora: el dinero que se queda en la mesa ══════════ */

const fmtUSD = (n) => '$' + Math.round(n).toLocaleString('es-US');

function recalcular() {
  const v = (id) => {
    const el = $(id);
    const n = parseFloat(el && el.value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };
  const consultas = v('c-consultas'), valor = v('c-valor'), pierde = Math.min(100, v('c-pierde'));
  const horas = v('c-horas'), costohora = v('c-costohora');

  // conservador y explícito: recuperas el 25% de lo que hoy pierdes por responder tarde
  const ventasMes = consultas * (pierde / 100) * 0.25 * valor;
  // el 70% del tiempo liberado vuelve a trabajo que vende
  const horasMes = horas * 4.33 * costohora * 0.7;
  const totalMes = ventasMes + horasMes;

  const ov = $('o-ventas'), oh = $('o-horas'), ot = $('o-total');
  if (ov) ov.textContent = fmtUSD(ventasMes);
  if (oh) oh.textContent = fmtUSD(horasMes);
  if (ot) ot.textContent = fmtUSD(totalMes * 12);
  return totalMes * 12;
}

alRalentizar(() => {
  let movida = false;
  ['c-consultas', 'c-valor', 'c-pierde', 'c-horas', 'c-costohora'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('input', () => {
      recalcular();
      if (!movida) { movida = true; funnel.marcar('calculadora'); }
    });
  });
  recalcular();
});

const calcCta = $('calc-cta');
if (calcCta) calcCta.addEventListener('click', () => {
  const anual = recalcular();
  funnel.marcar('calculadora_cta', { anual });
  bd.registrar('calculadora', {
    anual, consultas: $('c-consultas').value, valor: $('c-valor').value,
    pierde: $('c-pierde').value, horas: $('c-horas').value, costohora: $('c-costohora').value,
  });
  abrir();
  enviar('Según la calculadora de tu sitio, estoy dejando en la mesa unos ' + fmtUSD(anual) +
    ' al año. Quiero recuperar ese dinero: ¿por dónde empezamos?');
});

/* ══════════ 6 · Voz: conversación hablada real ══════════ */

const TEXTO_ESTADO = {
  [ESTADOS.ESCUCHANDO]: 'escuchándote',
  [ESTADOS.PENSANDO]: 'pensando…',
  [ESTADOS.HABLANDO]: 'hablando',
  [ESTADOS.INACTIVA]: 'en pausa',
};
let voz = null;

function asegurarVoz() {
  if (voz) return voz;
  voz = new Voz({
    responder: (t) => responderAgente(t, 'voz', historialChat),
    onEstado: (e) => {
      const ov = $('llamada');
      ov.dataset.estado = e;
      $('ll-estado').textContent = TEXTO_ESTADO[e] || e;
      $('ll-mic-txt').textContent = e === ESTADOS.ESCUCHANDO ? 'pausar' : 'escuchar';
    },
    onTranscripcion: (t, final) => {
      $('ll-transcripcion').textContent = t || '…';
      if (final && t) burbuja('user', t);
    },
    onPatron: (p) => { $('ll-respuesta').dataset.patron = p; },
    onRespuesta: (t, r) => {
      marcando(t);
      historialChat.push({ role: 'bot', content: t });
      $('ll-respuesta').textContent = 'patrón: ' + (($('ll-respuesta').dataset.patron) || '—') + '\n' + t.slice(0, 200);
      if (r && r.listoParaPdf) {
        $('pdfbtn').style.display = 'block';
        enviarLead();
        burbuja('sys', 'Brief listo: el botón de PDF está abajo en el chat.');
      }
    },
    fusionar: async (payload) => {
      const endpoint = CONFIG.ia && CONFIG.ia.endpoint;
      if (!endpoint) return null;   // sin backend: fusión determinista en voz.js
      const j = await razonarFusion(endpoint, payload);
      return j && j.respuesta_fusionada ? j.respuesta_fusionada : null;
    },
    conf: {
      lang: pack.stt || (CONFIG.voz && CONFIG.voz.lang) || 'es-ES',
      autoEscucha: !CONFIG.voz || CONFIG.voz.autoEscucha !== false,
      genero: (CONFIG.voz && CONFIG.voz.genero) || 'femenina',   // antes no se pasaba: el dock siempre caía en 'auto'
      prefVoz: pack.voz || (CONFIG.voz && CONFIG.voz.prefVoz) || '',
      velocidad: (CONFIG.voz && CONFIG.voz.velocidad) || 1.04,
      tono: (CONFIG.voz && CONFIG.voz.tono) || 1,
    },
  });
  return voz;
}

function abrirLlamada() {
  const ov = $('llamada');
  ov.classList.add('abierta');
  ov.setAttribute('aria-hidden', 'false');
  const sop = Voz.soportado();
  const v = asegurarVoz();
  if (!sop.completo) {
    $('ll-aviso').textContent = !sop.stt
      ? 'Tu navegador no reconoce voz. Usa Chrome, Edge o Safari. El chat de texto sigue funcionando.'
      : 'Tu navegador no tiene síntesis de voz: verás las respuestas escritas.';
    $('ll-estado').textContent = 'voz no disponible';
    return;
  }
  // venir del QR (?voz=1): mostramos el botón grande; el micrófono pide un gesto
  if (PARAMS.get('voz') === '1' && !window.__vozIniciada) {
    $('ll-tap').hidden = false;
    $('ll-estado').textContent = 'listo para hablarte';
    return;
  }
  $('ll-tap').hidden = true;
  // si el agente aún no terminó de iniciar (contexto/clima), esperamos y saludamos hablado
  if (iniciado) {
    if (!window.__vozIniciada) {
      window.__vozIniciada = true;
      funnel.marcar('llamada'); bd.registrar('llamada', { evento2: 'inicio', idioma: pack.codigo });
      v.iniciar((motorActivo && motorActivo.saludo) || pack.saludoVoz || window.__primerMensaje);
    }
    else v.reanudar();
  const f2 = $('fab'); if (f2) f2.classList.remove('oculto');
  } else {
    $('ll-estado').textContent = 'conectando…';
    const espera = setInterval(() => {
      if (iniciado) {
        clearInterval(espera);
        if (!window.__vozIniciada) {
        window.__vozIniciada = true;
        funnel.marcar('llamada'); bd.registrar('llamada', { evento2: 'inicio', idioma: pack.codigo });
        v.iniciar((motorActivo && motorActivo.saludo) || pack.saludoVoz || window.__primerMensaje);
      }
      }
    }, 180);
  }
}

function colgarLlamada() {
  if (voz) { voz.detener(); bd.registrar('llamada', { evento2: 'fin', lead: agente ? agente.lead : null }); bd.sincronizar(); }
  const ov = $('llamada');
  ov.classList.remove('abierta');
  ov.setAttribute('aria-hidden', 'true');
  $('ll-transcripcion').textContent = '…';
  $('ll-respuesta').textContent = '';
}

const llTap = $('ll-tap');
if (llTap) llTap.addEventListener('click', () => {
  llTap.hidden = true;
  const v = asegurarVoz();
  window.__vozIniciada = true;
  funnel.marcar('llamada'); bd.registrar('llamada', { evento2: 'inicio', idioma: pack.codigo, origen: PARAMS.get('voz') === '1' ? 'qr' : 'web' });
  v.iniciar((motorActivo && motorActivo.saludo) || pack.saludoVoz || window.__primerMensaje);
});
// entrada por QR o enlace directo: la sala se abre sola y espera el toque
if (PARAMS.get('voz') === '1') {
  const esperaVoz = setInterval(() => {
    if (iniciado) { clearInterval(esperaVoz); abrirLlamada(); }
  }, 200);
}
const llColgar = $('ll-colgar');
if (llColgar) llColgar.addEventListener('click', colgarLlamada);
const llSil = $('ll-silencio');
if (llSil) llSil.addEventListener('click', () => {
  const sil = asegurarVoz().alternarSilencio();
  $('ll-sil-txt').textContent = sil ? 'activar voz' : 'silenciar';
});
const llMic = $('ll-mic');
if (llMic) llMic.addEventListener('click', () => {
  const v = asegurarVoz();
  if (v.estado === ESTADOS.HABLANDO) { v.interrumpirYEscuchar(); return; }  // corte + fusión
  if (v.estado === ESTADOS.ESCUCHANDO) v.pausar();
  else v.reanudar();
});

/* ══════════ arranque ══════════ */

// Los CTA de precios abren el agente con el mensaje ya sembrado:
// ningún botón del sitio debe llevar a un callejón sin salida.
let pendiente = null;
function sembrar(msg) {
  abrir();
  if (iniciado) enviar(msg);
  else pendiente = msg;
}
document.querySelectorAll('.sit-cta').forEach((b) => {
  b.addEventListener('click', () => sembrar(b.dataset.sitmsg));
});

$('fab').onclick = abrir;
$('cerrar').onclick = cerrar;
$('nav-agente').onclick = abrir;
$('cta-agente').onclick = abrir;
$('enviar').onclick = () => enviar();
$('pdfbtn').onclick = generarPdf;
entrada.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } });

/* Selector de idioma: cambia paquete, saludo, voz y reinicia la conversación. */
function pintarIdiomas() {
  const caja = $('nav-id');
  if (!caja) return;
  caja.innerHTML = '';
  IDIOMAS.forEach((i) => {
    const b = document.createElement('button');
    b.textContent = i.etiqueta;
    b.title = i.nombre;
    b.className = i.codigo === pack.codigo ? 'activo' : '';
    b.addEventListener('click', () => setIdioma(i.codigo));
    caja.appendChild(b);
  });
}
function setIdioma(codigo) {
  if (pack.codigo === codigo) return;
  pack = packPor(codigo);
  document.documentElement.lang = pack.codigo;
  pintarIdiomas();
  if (voz) { voz.detener(); voz = null; window.__vozIniciada = false; }
  mensajes.innerHTML = '';
  quick([]);
  window.__saludado = false;
  if (ctx) {
    ctx.saludo = saludoDe(ctx);
    agente = crearAgente(pack, ctx);
    const s2 = agente.iniciar();
    iniciado = true;
    window.__primerMensaje = s2;
    marcando(s2);
    escribir($('saludo'), s2.split('\n\n')[0]);
    if ($('llamada').classList.contains('abierta')) {
      const v = asegurarVoz();
      $('ll-tap').hidden = false;
      $('ll-estado').textContent = 'listo';
    }
  }
}
pintarIdiomas();

alRalentizar(() => { acordeon(); animarPagina(); });
const fab = $('fab');
if (fab) fab.classList.add('oculto');

/* ── Invitación contextual: la llamada aparece cuando una acción le da sentido ── */
const INV_TEXTOS = {
  propuesta: '<b>Lo que acabo de armarte tiene detalles que se entienden mejor hablados.</b> ¿Una llamada corta de voz y te los explico mientras ves tu propia operación en pantalla?',
  situacion: '<b>¿Prefieres escucharlo?</b> En una llamada corta de voz te cuento qué haríamos en tu caso y por dónde empezar.',
  pdf: '<b>Tu brief está listo.</b> ¿Lo revisamos juntos en una llamada corta? Es donde más dudas se resuelven.',
};
const invVistos = {};
function mostrarInvitacion(tipo) {
  const caja = $('invitacion');
  if (!caja || invVistos[tipo] || caja.classList.contains('visible')) return;
  invVistos[tipo] = true;
  funnel.marcar('invitacion', { tipo });
  $('inv-texto').innerHTML = INV_TEXTOS[tipo] || INV_TEXTOS.situacion;
  caja.classList.add('visible');
  caja.setAttribute('aria-hidden', 'false');
  bd.registrar('invitacion', { tipo });
}
function ocultarInvitacion() {
  const caja = $('invitacion');
  if (!caja) return;
  caja.classList.remove('visible');
  caja.setAttribute('aria-hidden', 'true');
}
/* ── Mapa de CTAs: dos destinos, sin competencia ─────────────────────────
   DESTINO A · agente (chat o voz): nav-cta, hero, situaciones, calculadora,
               cta-agendar, invitación, QR. Todos siembran el mismo agente;
               solo cambia la primera frase que llevan escrita.
   DESTINO B · agenda externa: SOLO si config.marca.agenda está configurada;
               si no, el CTA final cae al destino A con frase de agendamiento.
   Ningún CTA compite: cada uno aparece en un momento distinto del viaje.   */
alRalentizar(() => {
const invSi = $('inv-si');
if (invSi) invSi.addEventListener('click', () => {
  ocultarInvitacion();
  if (fab) fab.classList.remove('oculto');
  abrirLlamada();
});
const invNo = $('inv-no');
if (invNo) invNo.addEventListener('click', ocultarInvitacion);

// disparadores: acciones concretas que le dan valor a la llamada
document.querySelectorAll('.sit-head').forEach((h) => {
  h.addEventListener('click', () => setTimeout(() => mostrarInvitacion('situacion'), 1400));
});
});

function saludoDe(c) {
  const h = parseInt(String(c.hora).slice(0, 2), 10);
  return (pack.cuerdas && pack.cuerdas.saludoHora) ? pack.cuerdas.saludoHora(h) : c.saludo;
}

funnel.marcar('visita', {
  origen: PARAMS.get('voz') === '1' ? 'qr' : PARAMS.get('negocio') ? 'demo-' + PARAMS.get('negocio') : (document.referrer ? 'referido' : 'directo'),
  idioma: pack.codigo,
});

resolverContexto().then((c) => {
  ctx = c;
  c.saludo = saludoDe(c);
  agente = crearAgente(pack, c);
  if (NEGOCIO) motorActivo = motorNegocio(NEGOCIO);
  const saludo = motorActivo ? motorActivo.saludo : agente.iniciar();
  if (NEGOCIO) {
    const live = $('nav-live-txt');
    if (live) live.textContent = 'demo adaptada · ' + NEGOCIO.nombre.toLowerCase();
  }
  iniciado = true;
  window.__primerMensaje = saludo;
  escribir($('saludo'), saludo.split('\n\n')[0], () => {
    if (pendiente) { const m = pendiente; pendiente = null; setTimeout(() => enviar(m), 350); }
    else if (CONFIG.ui.abrirAgenteSolo) setTimeout(abrir, 700);
  });
});
