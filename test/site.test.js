/**
 * site.test.js — Integración del SITIO CONSTRUIDO (dist/) en jsdom con red real.
 *   npm run build && node test/site.test.js
 *
 * Carga dist/index.html tal cual sale de Astro, inlinea el bundle generado
 * (es autocontenido, sin sintaxis ESM) y recorre el flujo completo:
 * contexto → cielo → saludo → conversación con correcciones → PDF → lead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');

let ok = 0, fallos = [];
function t(nombre, cond, detalle) {
  if (cond) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + nombre); }
  else { fallos.push(nombre + (detalle ? ' → ' + detalle : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + nombre + (detalle ? '\n      ↳ ' + detalle : '')); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, msMax, cada) {
  const t0 = Date.now();
  while (Date.now() - t0 < msMax) { if (fn()) return true; await esperar(cada || 120); }
  return false;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('\n  ✗ No existe dist/. Ejecuta antes: npm run build\n');
  process.exit(2);
}

// inlinea el bundle de Astro como script clásico (jsdom no ejecuta type=module)
function htmlConBundle(file = 'index.html') {
  let h = fs.readFileSync(path.join(DIST, file), 'utf8');
  h = h.replace(/<script[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g, (m, src) => {
    const rel = src.replace(/^\//, '');
    const f = path.join(DIST, rel);
    if (!fs.existsSync(f)) return '';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
  return h;
}

const blobs = [];

(async () => {
  console.log('\n\x1b[1m  SINAPTIA · Integración del build de Astro (jsdom + red real)\x1b[0m\n');

  const dom = new JSDOM(htmlConBundle(), {
    url: 'http://localhost:4321/?lang=es',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = fetch;
      w.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:fake/' + blobs.length; };
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
    },
  });
  const w = dom.window, d = w.document;
  const $ = (id) => d.getElementById(id);

  console.log('\n\x1b[36m  INTEGRIDAD DEL BUILD (regresiones)\x1b[0m');
  const crudo = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  t('sin scripts module externos: clicable abierto directo y en preview',
    !/<script[^>]*type="module"[^>]*src=/.test(crudo),
    'quedó un module con src → muere por file:// y nada responde');
  t('bundle inlineado como script clásico antes de </body>',
    crudo.includes('<script>') && crudo.lastIndexOf('<script>') < crudo.indexOf('</body>'));
  t('sin URLs absolutas: portable en raíz, subruta de Pages y disco',
    !/(?:src|href)="\//.test(crudo));
  t('la marca se muestra en mayúsculas', crudo.includes('SINAPTIA'));

  console.log('\x1b[36m  PANEL DE CONTEXTO (consola viva)\x1b[0m');
  t('sin rejilla de señales: el panel va directo al clima', d.querySelectorAll('.sig').length === 0 && d.querySelectorAll('.ctx-grid').length === 0, 'quedan tiles=' + d.querySelectorAll('.sig').length);
  const resuelto = await hasta(() => !$('ctx-temp').classList.contains('cargando'), 10000);
  t('resuelve el clima y sale del esqueleto', resuelto);
  t('la temperatura se pinta con unidad', /\d+°/.test($('ctx-temp').textContent), $('ctx-temp').textContent);
  t('el cielo reacciona al clima (data-cielo válido)', ['despejado', 'parcial', 'nublado', 'niebla', 'llovizna', 'lluvia', 'tormenta', 'nieve'].includes($('ctx-sky').dataset.cielo), $('ctx-sky').dataset.cielo);
  const cielo = $('ctx-sky').dataset.cielo;
  const momento = $('ctx-sky').dataset.momento;
  t('el cielo marca día o noche (los iconos oficiales tienen versión nocturna)', ['dia', 'noche'].includes(momento), 'momento=' + momento);
  const conGotas = ['llovizna', 'lluvia', 'tormenta'].includes(cielo);
  t('el cielo tiene los elementos de su estado',
    (conGotas ? $('ctx-lluvia').children.length > 0 : true) &&
    (cielo === 'nieve' ? $('ctx-nieve').children.length > 0 : true) &&
    (momento === 'noche' ? $('ctx-estrellas').children.length > 0 : true) &&
    (['nublado', 'niebla'].includes(cielo) ? $('ctx-sky').querySelectorAll('.humo').length === 3 : true), 'cielo=' + cielo);
  t('tormenta trae su relámpago y los demás no', $('ctx-rayo').hidden === (cielo !== 'tormenta'), 'cielo=' + cielo);
  t('de noche sale la luna en cielo despejado o parcial; de día el sol',
    (momento === 'noche' || cielo !== 'despejado' && cielo !== 'parcial') ? true : !$('ctx-sol').hidden, 'cielo=' + cielo);
  t('el panel muestra la ficha del tiempo (hora, sensación, viento, humedad)',
    !$('ctx-stats').hidden && /\d/.test($('ctx-hora').textContent) && !!$('ctx-sens') && !!$('ctx-viento') && !!$('ctx-humedad'),
    $('ctx-hora').textContent);
  t('el panel avisa que el clima se actualiza en vivo', !$('ctx-live').hidden && /actualizado/.test($('ctx-live').textContent));
  t('el panel no muestra esqueletos colgados tras resolver', !$('ctx-temp').classList.contains('cargando') && !$('ctx-cond').classList.contains('cargando'));
  t('la ciudad aparece en el tag del cielo', ($('ctx-ciudad-tag').textContent || '').length > 2, $('ctx-ciudad-tag').textContent);
  t('el panel ya no muestra fuentes, latencia ni badges', !$('ctx-fuentes') && !$('ctx-badge') && !$('ctx-badge-ref'));
  const cuerpo = d.body.cloneNode(true);
  // sin listas de PRECIOS nuestros; la calculadora muestra el dinero DEL cliente, que es el punto
  cuerpo.querySelectorAll('.sit-detail span, #crecimiento, script, style, [hidden]').forEach((n) => n.remove());
  t('sin listas de precios nuestras a la vista (el dinero del cliente sí se muestra)',
    !/USD|\$/.test(cuerpo.textContent.replace(/\s+/g, ' ')),
    (cuerpo.textContent.match(/.{0,30}(USD|\$).{0,30}/) || [''])[0]);
  const cta = d.querySelector('.sit-cta');
  const fondo = w.getComputedStyle(cta).backgroundColor;
  t('el botón "Pregúntale a Nexa" no hereda fondo blanco del navegador',
    fondo === 'rgba(0, 0, 0, 0)' || fondo === 'transparent', 'fondo=' + fondo);
  t('el indicador del nav deja de decir "resolviendo"', !$('nav-live').classList.contains('resolviendo'), $('nav-live-txt').textContent);

  console.log('\n\x1b[36m  SALUDO\x1b[0m');
  const saludoOk = await hasta(() => ($('saludo').textContent || '').length > 20 && !$('saludo').querySelector('.cur'), 9000);
  t('el saludo se escribe completo', saludoOk, $('saludo').textContent.slice(0, 60));
  const sal = $('saludo').textContent;
  const ciudadPanel = ($('ctx-ciudad-tag').textContent || '').trim();
  t('el saludo menciona la ciudad detectada', ciudadPanel && sal.includes(ciudadPanel), 'ciudad=' + ciudadPanel);

  console.log('\n\x1b[36m  CONVERSACIÓN\x1b[0m');
  $('fab').click();
  t('el panel del agente abre', $('panel').classList.contains('abierto'));
  t('el agente saluda primero', await hasta(() => $('mensajes').querySelectorAll('.msg.bot').length >= 1, 4000));
  t('no hay botón de llamar en el header', !d.getElementById('nav-voz'));
  t('el fab empieza oculto: la llamada se gana su lugar', d.getElementById('fab').classList.contains('oculto'));
  t('la invitación no aparece antes de tiempo', !d.getElementById('invitacion').classList.contains('visible'));

  async function decir(texto) {
    const antes = $('mensajes').querySelectorAll('.msg').length;
    $('entrada').value = texto; $('enviar').click();
    const r = await hasta(() => $('mensajes').querySelectorAll('.msg').length >= antes + 2, 6000);
    const bots = $('mensajes').querySelectorAll('.msg.bot');
    return { ok: r, ultimo: bots.length ? bots[bots.length - 1].textContent : '' };
  }
  console.log('\n\x1b[36m  PRECIO ORIENTADO AL CASO\x1b[0m');
  let r = await decir('¿cuánto cuesta esto?');
  t('sin conocer el caso, pide los dos datos en vez de dar un menú',
    /necesito|conocer tu caso|a qué se dedica|qué proceso/.test(r.ultimo), r.ultimo.slice(0, 90));

  console.log('\n\x1b[36m  CONVERSACIÓN\x1b[0m');
  r = await decir('Nos dedicamos a la venta de repuestos automotrices');
  t('captura sector y pide el dolor', r.ok && /proceso|duele|tiempo/i.test(r.ultimo), r.ultimo.slice(0, 60));
  r = await decir('tardamos horas en responder consultas y hacer cotizaciones a mano');
  t('captura dolor y pide volumen', r.ok && /mes/i.test(r.ultimo), r.ultimo.slice(0, 60));
  r = await decir('¿y cuánto sería lo mío?');
  t('con el caso conocido, da el rango orientado a esa situación',
    /lo nuestro ser[íi]a/i.test(r.ultimo) && /va de/i.test(r.ultimo), r.ultimo.slice(0, 110));
  r = await decir('quiero automatizar todo el negocio con IA');
  t('CORRIGE "automatizar todo"', r.ok && /mapear|simplificar/i.test(r.ultimo), r.ultimo.slice(0, 80));
  r = await decir('unas 400 al mes');
  t('pide datos de contacto', r.ok && /nombre|email|empresa/i.test(r.ultimo), r.ultimo.slice(0, 60));
  r = await decir('Laura Ortiz, laura@repuestosandinos.com, Repuestos Andinos');
  t('presenta la propuesta', r.ok && /haría|inversión/i.test(r.ultimo), r.ultimo.slice(0, 80));
  r = await decir('sí, dame el pdf');
  t('deja listo el botón de PDF', r.ok && $('pdfbtn').style.display === 'block');

  console.log('\n\x1b[36m  SECCIÓN DE SITUACIONES (sin precios)\x1b[0m');
  const sec = d.getElementById('precios');
  const clon = sec.cloneNode(true);
  clon.querySelectorAll('.sit-detail span').forEach((n) => n.remove());  // el detalle del "?" sí puede llevar cifras
  t('la sección no muestra dinero a simple vista',
    !/USD|\$/.test(clon.textContent),
    (clon.textContent.match(/.{0,40}(USD|\$).{0,40}/) || [''])[0]);
  t('el detalle técnico bajo el "?" sí contiene el tope, pero oculto',
    /USD 500/.test(sec.textContent) && !sec.querySelector('.sit-detail li').classList.contains('mostrando'));
  t('arranca con una sola situación abierta', d.querySelectorAll('.situation.abierto').length === 1);
  d.querySelector('.situation[data-sit="equipo"] .sit-head').click();
  await esperar(120);
  t('abrir una cierra las otras: nunca dos a la vez',
    d.querySelectorAll('.situation.abierto').length === 1 &&
    d.querySelector('.situation[data-sit="equipo"]').classList.contains('abierto'));
  d.querySelector('.situation[data-sit="equipo"] .sit-head').click();
  await esperar(120);
  t('tocar la abierta la cierra (cero opciones visibles)', d.querySelectorAll('.situation.abierto').length === 0);
  d.querySelector('.situation[data-sit="cuidado"] .sit-head').click();
  await esperar(120);
  const win = d.querySelector('.situation[data-sit="cuidado"] .win-num');
  const contado = await hasta(() => win.textContent === '22', 3000);
  t('el contador de horas se cuenta solo hasta 22', contado, 'quedó en ' + win.textContent);
  t('los bloques revelables quedan revelados (fallback sin IntersectionObserver)',
    d.querySelectorAll('[data-reveal].revelado').length > 5,
    'revelados=' + d.querySelectorAll('[data-reveal].revelado').length);
  d.querySelector('.sit-detail .why').click();
  t('el "?" despliega el detalle técnico', d.querySelector('.sit-detail li').classList.contains('mostrando'));

  console.log('\n\x1b[36m  PDF Y LEAD\x1b[0m');
  const clave = Object.keys(w.localStorage).find((k) => k.startsWith('sinaptia:lead:'));
  t('el lead se guarda en localStorage', !!clave);
  if (clave) {
    const p = JSON.parse(w.localStorage.getItem(clave));
    t('payload con lead, correcciones y contexto', !!p.lead && Array.isArray(p.correcciones) && !!p.contexto);
    t('la corrección viaja en el payload', p.correcciones.some((c) => c.id === 'todo_automatico'));
    t('email correcto', p.lead.email === 'laura@repuestosandinos.com', p.lead.email);
  }
  $('pdfbtn').click();
  await esperar(400);
  t('genera un Blob de PDF', blobs.length >= 1, 'blobs=' + blobs.length);
  if (blobs.length) {
    const buf = Buffer.from(await blobs[blobs.length - 1].arrayBuffer());
    t('es application/pdf y empieza con %PDF', blobs[blobs.length - 1].type === 'application/pdf' && buf.slice(0, 5).toString() === '%PDF-');
    t('sin mojibake en el texto del PDF', !Buffer.from(buf).toString('latin1').includes('Ã'));
    fs.writeFileSync('/tmp/astro-brief.pdf', buf);
    console.log('     → /tmp/astro-brief.pdf (' + buf.length + ' bytes)');
  }

  console.log('\n\x1b[36m  CRECIMIENTO Y DINERO\x1b[0m');
  t('las demos de referencia ya no están', !d.getElementById('casos') && !d.querySelector('.case'));
  t('la sección de crecimiento existe para emprendedores y startups', !!d.getElementById('crecimiento'));
  const hoja = Array.from(d.querySelectorAll('style')).map((x) => x.textContent).join('');
  const regla = hoja.match(/\.ctx-sky \.ciudad-tag\{[^}]*\}/);
  const token = hoja.match(/--azul-osc:([^;]+);/);
  t('la ciudad aparece en azul, no en blanco',
    !!regla && /color:var\(--azul-osc\)/.test(regla[0]) && /^#1[0-9A-F]{5}$/i.test((token || [, ''])[1].trim()),
    regla ? regla[0].slice(0, 90) : 'sin regla');
  // calculadora: con los valores por defecto el anual debe ser 83.115
  t('la calculadora arranca calculada', d.getElementById('o-total').textContent.replace(/[^0-9]/g, '') === '83115', d.getElementById('o-total').textContent);
  d.getElementById('c-consultas').value = '600';
  d.getElementById('c-consultas').dispatchEvent(new w.Event('input'));
  await esperar(60);
  const t2 = parseInt(d.getElementById('o-total').textContent.replace(/[^0-9]/g, ''), 10);
  t('recalcula al mover un número (y sube)', t2 > 83115, 'dio ' + t2);
  d.getElementById('calc-cta').click();
  await esperar(900);
  const ultimoUser = Array.from(d.querySelectorAll('#mensajes .msg.user')).pop();
  t('el CTA de la calculadora siembra la conversación con tu propio dinero',
    !!ultimoUser && /dejando en la mesa/.test(ultimoUser.textContent) && /\$/.test(ultimoUser.textContent),
    ultimoUser && ultimoUser.textContent.slice(0, 80));

  console.log('\n\x1b[36m  BASE DE DATOS JSON\x1b[0m');
  const bdRaw = w.localStorage.getItem('sinaptia:bd');
  t('la conversación quedó registrada en la base de datos', !!bdRaw && JSON.parse(bdRaw).registros.length > 3, bdRaw ? JSON.parse(bdRaw).registros.length + ' registros' : 'sin registros');
  const regs = bdRaw ? JSON.parse(bdRaw).registros : [];
  t('cada turno guarda canal, idioma, patrón y respuesta',
    regs.some((r) => r.evento === 'turno' && r.canal && r.idioma && r.intencion && r.respuesta));
  t('el lead y el PDF dejan su propio registro',
    regs.some((r) => r.evento === 'lead') && regs.some((r) => r.evento === 'pdf'));
  t('el guion estructurado viaja en cada registro',
    regs.filter((r) => r.evento === 'turno').every((r) => r.guion && r.guion.lead));

  console.log('\n\x1b[36m  INVITACIÓN TRAS ACCIÓN CON VALOR\x1b[0m');
  // la conversación de arriba llegó a propuesta → la invitación debe aparecer sola
  const invOk = await hasta(() => d.getElementById('invitacion').classList.contains('visible'), 4000);
  t('al llegar a la propuesta, la llamada se ofrece con su valor explicado', invOk);
  t('el texto de la invitación menciona el beneficio, no la función',
    /mejor hablados|dos minutos|voz/i.test(d.getElementById('inv-texto').textContent),
    d.getElementById('inv-texto').textContent.slice(0, 60));
  d.getElementById('inv-si').click();
  await esperar(300);
  t('aceptar abre la sala y revela el fab', d.getElementById('llamada').classList.contains('abierta') && !d.getElementById('fab').classList.contains('oculto'));
  d.getElementById('cerrar').click();

  console.log('\n\x1b[36m  MULTILINGÜE Y QR EN EL SITIO\x1b[0m');
  t('la sección QR existe con un SVG de código embebido', !!d.querySelector('#qr .qr-svg svg'));
  t('el QR y sus demos llevan a la llamada (?voz=1)',
    !!d.querySelector('#qr .qr-svg svg') && d.querySelectorAll('#qr a[href*="voz=1"]').length >= 3,
    'demos: ' + d.querySelectorAll('#qr a[href*="voz=1"]').length);
  t('el selector de idioma pinta ES / EN / PT', d.querySelectorAll('#nav-id button').length === 3);
  d.querySelectorAll('#nav-id button')[1].click();
  await esperar(400);
  const botsEn = d.querySelectorAll('#mensajes .msg.bot');
  t('al cambiar a EN, el agente reinicia y saluda en inglés',
    botsEn.length > 0 && /what does your company do/i.test(botsEn[botsEn.length - 1].textContent),
    botsEn.length ? botsEn[botsEn.length - 1].textContent.slice(0, 70) : 'sin mensajes');

  // ── segundo dom: entrada por QR (?voz=1) ──
  const habladas2 = [];
  const dom2 = new JSDOM(htmlConBundle(), {
    url: 'http://localhost:4321/?voz=1&lang=es',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w2) {
      w2.fetch = () => Promise.reject(new Error('sin red'));
      w2.URL.createObjectURL = () => 'blob:x'; w2.URL.revokeObjectURL = () => {};
      w2.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      w2.speechSynthesis = {
        getVoices: () => [{ lang: 'es-ES', name: 'Voz' }],
        speak(u) { habladas2.push(u); u.onstart && u.onstart(); },
        cancel() {},
      };
      w2.SpeechRecognition = class {
        constructor() { dom2sr = this; }
        start() { this.started = true; }
        stop() { this.onend && this.onend(); }
        abort() {}
      };
    },
  });
  let dom2sr = null;
  await esperar(3000);
  const d2 = dom2.window.document;
  t('con ?voz=1 la sala se abre sola, sin botón en el header',
    d2.getElementById('llamada').classList.contains('abierta') && !d2.getElementById('nav-voz'));
  t('y aparece el botón grande "toca para hablar"', d2.getElementById('ll-tap').hidden === false);
  t('y el micrófono NO se abre sin gesto humano', habladas2.length === 0 && !dom2sr);
  d2.getElementById('ll-tap').click();
  await esperar(350);
  t('al tocar, saluda hablado con UNA línea directa al motivo (sin recitar el sitio)',
    habladas2.length >= 1 && /soy Nexa/.test(habladas2[0].text) && habladas2[0].text.length < 110 && !/ciudad|clima|grados|°/.test(habladas2[0].text),
    habladas2[0] && habladas2[0].text);

  console.log('\n\x1b[36m  CERO PLAZOS PROMETIDOS\x1b[0m');
  const visible = d.body.cloneNode(true);
  visible.querySelectorAll('script, style, [hidden]').forEach((n) => n.remove());
  const textoVisible = visible.textContent;
  const plazos = textoVisible.match(/\b\d+\s*(d[ií]as|semanas|meses|minutos|min)\b/gi);
  t('ningún "X días / semanas / meses / minutos" en el texto visible', !plazos, plazos ? plazos.join(', ') : '');
  // en este punto del test el idioma activo es EN (el test multilingüe lo cambió antes)
  const rPlazo = await decir('how long does a project like this take?');
  t('el agente tampoco promete plazos al responder',
    !/\b\d+\s*(days|weeks|months|d[ií]as|semanas|meses)\b/i.test(rPlazo.ultimo), rPlazo.ultimo.slice(0, 90));
  t('y explica que el ritmo sale de revisar el proceso',
    /process|review|depend|scope/i.test(rPlazo.ultimo), rPlazo.ultimo.slice(0, 90));

  console.log('\n\x1b[36m  SEO Y ROBUSTEZ (puntos de la revisión)\x1b[0m');
  const htmlCrudo = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  t('el h1 tiene texto estático de respaldo (SEO y sin JS)',
    /<h1 class="greet" id="saludo">[A-ZÁÉÍÓÚÑ][^<]{10,}<span class="cur" hidden>/.test(htmlCrudo));
  t('con urlPublica configurada, canonical y og:url son absolutos',
    /rel="canonical" href="https:\/\/sinaptia\.vercel\.app\/"/.test(htmlCrudo) && /property="og:url" content="https:\/\/sinaptia\.vercel\.app\/"/.test(htmlCrudo));
  t('og:image y twitter:card presentes siempre',
    /property="og:image"/.test(htmlCrudo) && /name="twitter:card"/.test(htmlCrudo));
  t('og:image apunta al og.png raíz en todas las páginas (no al directorio de la página)',
    /property="og:image" content="https:\/\/sinaptia\.vercel\.app\/og\.png"/.test(htmlCrudo));
  const vozCrudo = fs.readFileSync(path.join(DIST, 'voz/index.html'), 'utf8');
  t('og:image de /voz también apunta a la raíz (regresión del 404 /voz/og.png)',
    /property="og:image" content="https:\/\/sinaptia\.vercel\.app\/og\.png"/.test(vozCrudo) && !/\/voz\/og\.png/.test(vozCrudo));
  t('JSON-LD con Organization, Service y WebSite',
    /"Organization"/.test(htmlCrudo) && /"Service"/.test(htmlCrudo) && /"WebSite"/.test(htmlCrudo));
  t('JSON-LD no expone precios ni ofertas (cero precios, también para crawlers)',
    !/"price"\s*:/.test(htmlCrudo) && !/"offers"\s*:/.test(htmlCrudo) && !/priceCurrency/.test(htmlCrudo));
  const audHtml = fs.readFileSync(path.join(DIST, 'auditoria.html'), 'utf8');
  t('auditoria.html sin placeholders de plantilla', !/\{\{/.test(audHtml));
  t('auditoria.html sin plazos prometidos en la copia (título, CTA, microcta)',
    !/Auditoría IA de 20 minutos/.test(audHtml) && !/Tardarás unos 20 minutos/.test(audHtml) &&
    !/Agendar 30 minutos/.test(audHtml) && !/en 14 días/.test(audHtml) && !/precio cerrado/.test(audHtml));
  t('auditoria.html sin rango de precio propio visible (3.000–8.000 € fuera)', !/3\.000.8\.000/.test(audHtml));
  t('auditoria.html: el CTA de llamada lleva a /voz (entrada contextual)', /href="\.\/voz"/.test(audHtml));

  // Contacto: WhatsApp directo, ubicación México, sin correo
  const idxC = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  t('auditoria.html sin correo (mailto eliminado)', !/mailto:/.test(audHtml));
  t('auditoria.html con WhatsApp directo (wa.me/529834066179)', audHtml.includes('wa.me/529834066179'));
  t('auditoria.html con ubicación SEO (Tapachula de Córdova y Ordóñez, Chiapas 30794, México)',
    audHtml.includes('Tapachula') && audHtml.includes('30794'));
  t('index sin correo hola@ (eliminado)', !idxC.includes('hola@sinaptialabs.com'));
  t('index con WhatsApp directo en el CTA', idxC.includes('wa.me/529834066179'));
  t('index con número legible +52 983 406 6179', idxC.includes('983 406 6179'));
  t('index con ubicación SEO (Tapachula de Córdova y Ordóñez, Chiapas 30794, México)',
    idxC.includes('Tapachula de Córdova y Ordóñez') && idxC.includes('30794'));
  const footIdx = idxC.slice(idxC.indexOf('<footer'), idxC.indexOf('</footer>'));
  t('footer limpio: sin WhatsApp ni dominio genérico (sinaptialabs.com)',
    !footIdx.includes('wa.me') && !footIdx.includes('sinaptialabs.com'));
  t('footer con la dirección SEO como único dato de contacto',
    footIdx.includes('Tapachula de Córdova y Ordóñez') && footIdx.includes('30794'));
  t('auditoria: pie sin dominio genérico ni WhatsApp (el CTA sí conserva wa.me)',
    !audHtml.slice(audHtml.indexOf('class="foot"')).includes('sinaptialabs.com'));
  t('index JSON-LD: contactPoint por teléfono (no email)',
    /"telephone":\s*"\+529834066179"/.test(idxC) && !/"email":/.test(idxC));
  t('index JSON-LD: PostalAddress MX (Tapachula, Chiapas, 30794)',
    /"addressCountry":\s*"MX"/.test(idxC) && /"postalCode":\s*"30794"/.test(idxC));
  t('index JSON-LD: dirección SEO completa (localidad oficial + GeoCoordinates + areaServed)',
    /"addressLocality":\s*"Tapachula de Córdova y Ordóñez"/.test(idxC)
    && /"GeoCoordinates"/.test(idxC) && /"areaServed"/.test(idxC));
  const priv = fs.readFileSync(path.join(DIST, 'privacidad', 'index.html'), 'utf8');
  t('privacidad: derechos/borrado por WhatsApp, sin mailto',
    priv.includes('wa.me/529834066179') && !/mailto:/.test(priv));
  t('og.png existe en el build', fs.existsSync(path.join(DIST, 'og.png')));
  t('sin agenda configurada, el CTA final no lleva a un enlace muerto',
    !d.querySelector('#contacto a[href*="tu-usuario"]') && !!d.getElementById('cta-agendar'));
  d.getElementById('cta-agendar').click();
  await esperar(900);
  const msgAgenda = Array.from(d.querySelectorAll('#mensajes .msg.user')).pop();
  t('el CTA de agendar siembra la conversación en vez de romperse',
    !!msgAgenda && /agendar/.test(msgAgenda.textContent), msgAgenda && msgAgenda.textContent.slice(0, 60));

  // hero con red colgada: debe degradar en ≤5 s, no quedarse en "resolviendo"
  const dom3 = new JSDOM(htmlConBundle(), {
    url: 'http://localhost:4321/?lang=es',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w3) {
      w3.fetch = () => new Promise(() => {});   // nunca responde
      w3.URL.createObjectURL = () => 'blob:x'; w3.URL.revokeObjectURL = () => {};
    },
  });
  await esperar(6500);
  const d3 = dom3.window.document;
  const saludo3 = d3.getElementById('saludo').textContent;
  t('con la red colgada, el saludo aparece igual en ≤5 s', saludo3.length > 20, saludo3.slice(0, 50));
  t('y el indicador de contexto deja de decir "resolviendo"',
    !/resolviendo/.test(d3.getElementById('nav-live-txt').textContent), d3.getElementById('nav-live-txt').textContent);
  t('y degrada a la ciudad de referencia con cielo pintado',
    (d3.getElementById('ctx-ciudad-tag').textContent || '').length > 2 && d3.getElementById('ctx-sky').dataset.cielo !== '');

  // ── cuarto dom: el QR con negocio adaptado ──
  const habladas4 = [];
  const dom4 = new JSDOM(htmlConBundle(), {
    url: 'http://localhost:4321/?voz=1&negocio=clinica',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w4) {
      w4.fetch = () => Promise.reject(new Error('sin red'));
      w4.URL.createObjectURL = () => 'blob:x'; w4.URL.revokeObjectURL = () => {};
      w4.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      w4.speechSynthesis = { getVoices: () => [{ lang: 'es-ES', name: 'Voz' }], speak(u) { habladas4.push(u); u.onstart && u.onstart(); }, cancel() {} };
      w4.SpeechRecognition = class { constructor() { this.started = true; } start() {} stop() { this.onend && this.onend(); } abort() {} };
    },
  });
  await esperar(3000);
  const d4 = dom4.window.document;
  d4.getElementById('ll-tap').click();
  await esperar(350);
  t('con ?negocio=clinica la voz saluda COMO LA CLÍNICA, no como Sinaptia',
    habladas4.length >= 1 && /Cl[ií]nica Dental Sonrisa/.test(habladas4[0].text), habladas4[0] && habladas4[0].text.slice(0, 60));
  t('y el indicador muestra que es una demo adaptada',
    /demo adaptada/.test(d4.getElementById('nav-live-txt').textContent), d4.getElementById('nav-live-txt').textContent);

  console.log('\n\x1b[36m  PÁGINA /voz: POPUP DIRECTO CON MEMORIA DE CLIENTE\x1b[0m');
  const domV = new JSDOM(htmlConBundle('voz/index.html'), {
    url: 'http://localhost:4321/voz/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(wv) {
      wv.__habladas = [];
      wv.fetch = () => Promise.reject(new Error('sin red'));
      wv.URL.createObjectURL = () => 'blob:x'; wv.URL.revokeObjectURL = () => {};
      wv.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
      wv.speechSynthesis = {
        getVoices: () => [{ lang: 'es-ES', name: 'Voz' }],
        speak(u) {
          wv.__habladas.push(u);
          u.onstart && u.onstart();
          setTimeout(() => { u.onend && u.onend(); }, 30);   // el saludo termina → pasa a escuchar
        },
        cancel() {},
      };
      wv.__turno = 0;
      wv.SpeechRecognition = class {
        constructor() { this.lang = 'es'; this.continuous = false; this.interimResults = true; }
        start() {
          const guion = [
            'soy José, te hablé la semana pasada de mi pastelería',
            'sí, sigamos desde ahí',
          ];
          const texto = guion[wv.__turno++];
          if (!texto) return;
          setTimeout(() => {
            const ev = { resultIndex: 0, results: [{ 0: { transcript: texto }, isFinal: true, length: 1 }] };
            this.onresult && this.onresult(ev);
            this.onend && this.onend();
          }, 80);
        }
        stop() { this.onend && this.onend(); }
        abort() { this.onend && this.onend(); }
      };
      wv.localStorage.setItem('sinaptia:memoria', JSON.stringify([{
        id: 'p1', nombre: 'José Pérez', negocio: 'pastelería', necesidad: 'implementar IA',
        ultimo: new Date().toISOString(), veces: 1, resumen: 'quiere automatizar pedidos',
      }]));
    },
  });
  await esperar(700);
  const dv = domV.window.document;
  const wv = domV.window;
  wv.__respuestas = [];
  const obs = new wv.MutationObserver(() => {
    const txt = dv.getElementById('respuesta').textContent.trim();
    if (txt && wv.__respuestas[wv.__respuestas.length - 1] !== txt) wv.__respuestas.push(txt);
  });
  obs.observe(dv.getElementById('respuesta'), { childList: true, characterData: true, subtree: true });
  t('la ruta /voz existe y abre directo, sin el resto del sitio',
    !dv.getElementById('nav-id') && !!dv.getElementById('orb') && !!dv.getElementById('idiomas'));
  t('ofrece elegir idioma: español, inglés y portugués', dv.querySelectorAll('#idiomas button').length === 3);
  t('el paso de consentimiento viaja en el build (oculto hasta que aplica)', (() => {
    const c = dv.getElementById('consent');
    return !!c && c.hidden === true && !!dv.getElementById('consent-si') && !!dv.getElementById('consent-no');
  })());
  t('el paso de consentimiento queda horneado en el bundle', /sinaptia:consentVoz/.test(htmlConBundle('voz/index.html')));
  t('con el backend apagado (default), el bundle NO incluye llamadas remotas: dead-code elimination',
    !/backend_no_disponible/.test(htmlConBundle('voz/index.html')) && !/\/api\/voz/.test(htmlConBundle('voz/index.html')));
  dv.getElementById('orb').click();
  await esperar(500);
  t('saluda por voz en cuanto tocas el orbe', domV.window.__habladas.length >= 1,
    domV.window.__habladas[0] && domV.window.__habladas[0].text.slice(0, 50));
  dv.getElementById('orb').click();   // segundo toque: arranca la escucha
  await esperar(1600);
  const primera = wv.__respuestas[0] || '';
  t('reconoce al cliente recurrente y NO empieza de cero',
    /Jos[eé]/.test(primera) && /pasteler/i.test(primera) && /no empezamos de cero/i.test(primera),
    primera.slice(0, 90));
  t('ninguna respuesta vuelve a preguntar datos que ya tenía',
    wv.__respuestas.length > 0 && !wv.__respuestas.some((r) => /a qu[eé] se dedica|qu[eé] proceso te quita/i.test(r)),
    wv.__respuestas.map((r) => r.slice(0, 40)).join(' | '));
  t('el recall quedó guardado en el historial (el oro del análisis)', (() => {
    const raw = JSON.parse(domV.window.localStorage.getItem('sinaptia:bd') || '{}');
    return (raw.registros || []).some((r) => r.memoria === 'recall');
  })());
  dv.querySelectorAll('#idiomas button')[1].click();
  await esperar(200);
  t('cambiar de idioma reinicia la conversación limpia',
    dv.getElementById('respuesta').textContent === '' && dv.getElementById('transcripcion').textContent === '');
  domV.window.close();

  console.log('\n\x1b[36m  PÁGINA /panel: EMBUDO LOCAL + ANALÍTICA REAL DEL SERVIDOR\x1b[0m');
  const panelHtml = fs.readFileSync(path.join(DIST, 'panel/index.html'), 'utf8');
  t('/panel conserva el embudo local y las búsquedas', /panel-pasos/.test(panelHtml) && /panel-busquedas/.test(panelHtml));
  t('/panel estrena el bloque de analítica del servidor', /panel-conectar/.test(panelHtml) && /x-panel-clave/.test(panelHtml));
  t('la clave del panel se pide al vuelo: no viaja horneada en el HTML', /sessionStorage/.test(panelHtml) && !/x-panel-clave['"]?\s*:\s*['"][A-Za-z0-9]{8,}/.test(panelHtml));

  console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
  const total = ok + fallos.length;
  if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · build de Astro verificado de punta a punta');
  else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
  console.log('');
  w.close();
  process.exit(fallos.length ? 1 : 0);
})().catch((e) => { console.error('\n  \x1b[31mError fatal:\x1b[0m', e); process.exit(2); });
