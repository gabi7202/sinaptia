/**
 * extras.test.js — Páginas nuevas: /en, /interprete y textos de confianza.
 *   npm run build && node test/extras.test.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
if (!fs.existsSync(path.join(DIST, 'en/index.html'))) {
  console.error('\n  ✗ No existe dist/en. Ejecuta antes: npm run build\n');
  process.exit(2);
}

let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return true; await esperar(120); }
  return false;
}
function htmlConBundle(file) {
  let h = fs.readFileSync(path.join(DIST, file), 'utf8');
  h = h.replace(/<script[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g, (m, src) => {
    const f = path.join(DIST, src.replace(/^\//, ''));
    if (!fs.existsSync(f)) return '';
    return '<script>\n' + fs.readFileSync(f, 'utf8') + '\n</script>';
  });
  return h;
}

console.log('\n\x1b[1m  SINAPTIA · Inglés, intérprete y confianza\x1b[0m\n');

console.log('\x1b[36m  LANDING /en\x1b[0m');
{
  const crudo = fs.readFileSync(path.join(DIST, 'en/index.html'), 'utf8');
  t('/en existe y declara lang="en"', /<html lang="en"/.test(crudo));
  t('/en tiene copy en inglés, no traducción literal',
    /AI that goes into production/.test(crudo) && /Not another chatbot demo/.test(crudo) && /small and mid-sized businesses/.test(crudo));
  t('/en explica la transparencia: IA + fundador sin inglés fluido + intérprete',
    /You are talking to an AI/.test(crudo) && /does not speak fluent English/.test(crudo) &&
    /live AI interpretation both ways/.test(crudo) && /No pretending/.test(crudo));
  t('/en muestra rangos honestos sin plazos',
    /\$1,800/.test(crudo) && /from \$3,500/.test(crudo) && !/\b\d+\s*(weeks?|days?|months?)\b/i.test(crudo));
  t('/en tiene chat funcional y botón de PDF', /id="en-msgs"/.test(crudo) && /id="en-pdf-btn"/.test(crudo));
  t('/en enlaza al sitio en español y a la voz en inglés',
    /href="(?:\.\.\/|\/)"/.test(crudo) && /voz\/\?lang=en/.test(crudo));
  t('/en no incluye el bundle del sitio español (aislado)', !/id="ctx-sky"/.test(crudo));

  const dom = new JSDOM(htmlConBundle('en/index.html'), {
    url: 'http://localhost:4321/en/',
    runScripts: 'dangerously', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = async () => { throw new Error('sin red'); };
      w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
    },
  });
  const d = dom.window.document;
  t('el chat de /en saluda en inglés', await hasta(() => (d.getElementById('en-msgs').textContent || '').includes("I'm Nexa"), 3000),
    d.getElementById('en-msgs').textContent.slice(0, 80));
  d.getElementById('en-input').value = 'We sell auto parts';
  d.getElementById('en-send').click();
  const okTurno = await hasta(() => {
    const bots = d.querySelectorAll('#en-msgs .en-msg.bot');
    return bots.length >= 2 && /process|hurt|time or money/i.test(bots[bots.length - 1].textContent);
  }, 6000);
  t('el chat de /en entiende el sector y pide el proceso (en inglés)', okTurno,
    Array.from(d.querySelectorAll('#en-msgs .en-msg.bot')).map((x) => x.textContent).join(' | ').slice(0, 160));
  dom.window.close();
}

console.log('\x1b[36m  INTÉRPRETE DE VIDEOLLAMADA\x1b[0m');
{
  const crudo = fs.readFileSync(path.join(DIST, 'interprete/index.html'), 'utf8');
  t('/interprete ofrece modo videollamada por turnos',
    /Modo videollamada/.test(crudo) && /Escuchar al cliente/.test(crudo) && /Hablarle/.test(crudo));
  t('/interprete tiene controles de escucha, parada y transcripción',
    /id="escuchar-en"/.test(crudo) && /id="hablar-es"/.test(crudo) && /id="interp-stop"/.test(crudo) && /id="interp-log"/.test(crudo));
  t('/interprete avisa de que es por turnos (no simultáneo)', /por turnos, no simultáneo/.test(crudo));
  t('/interprete conserva las dos direcciones escritas', /Español → Inglés/.test(crudo) && /Inglés → Español/.test(crudo));
}

console.log('\x1b[36m  CONFIANZA Y SEO\x1b[0m');
{
  const priv = fs.readFileSync(path.join(DIST, 'privacidad/index.html'), 'utf8');
  t('privacidad explica la memoria temporal de 12 h y cómo borrarla',
    /12 horas/.test(priv) && /empezar de cero/.test(priv));
  t('privacidad explica el proveedor del modelo y la copia del brief',
    /proveedor del modelo/.test(priv) && /Copia de tu brief/.test(priv));
  const term = fs.readFileSync(path.join(DIST, 'terminos/index.html'), 'utf8');
  t('términos declara que Nexa es IA y que el fundador usa IA para el idioma',
    /Nexa es una IA/.test(term) && /no habla inglés fluido/.test(term));
  const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8');
  t('sitemap incluye /en/ y /en/privacy/', /\/en\//.test(sm) && /\/en\/privacy\//.test(sm));
  const en = fs.readFileSync(path.join(DIST, 'en/index.html'), 'utf8');
  t('og:locale en_US en la página inglesa', /og:locale" content="en_US/.test(en));
  const enPriv = fs.readFileSync(path.join(DIST, 'en/privacy/index.html'), 'utf8');
  t('/en/privacy existe y explica memoria, proveedor y copia',
    /Temporary conversation memory/.test(enPriv) && /Groq by default/.test(enPriv) && /A copy of your brief/.test(enPriv));

  const index = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
  const enIndex = fs.readFileSync(path.join(DIST, 'en/index.html'), 'utf8');
  t('el correo del dueño NO aparece en el HTML público', !/hola@|mailto:/i.test(index + enIndex + enPriv));
  t('el contacto público es WhatsApp +52 983 406 6176',
    /wa\.me\/529834066176/.test(index) && /\+52 983 406 6176/.test(index) &&
    /wa\.me\/529834066176/.test(enIndex) && /\+52 983 406 6176/.test(enIndex));
  t('la web muestra Rafael Ortiz como persona de contacto',
    /Rafael Ortiz/.test(index) || /Rafael Ortiz/.test(enIndex));
}

console.log('\x1b[36m  GOOGLE APPS SCRIPT Y ENV\x1b[0m');
{
  const gs = fs.readFileSync(path.join(RAIZ, 'google-apps-script/Code.gs'), 'utf8');
  t('el script de Google envía por Gmail sin correo hardcodeado',
    /MailApp\.sendEmail/.test(gs) && /getEffectiveUser\(\)\.getEmail\(\)/.test(gs) &&
    !/@gmail\.com|@googlemail\.com/i.test(gs));
  t('adjunta el PDF con nombre Cliente-Sinaptia', /Cliente-Sinaptia\.pdf/.test(gs) && /attachments/.test(gs));
  const envDoc = fs.readFileSync(path.join(RAIZ, 'docs/VERCEL-ENV.md'), 'utf8');
  t('la guía de Vercel lista las variables obsoletas',
    /XAI_API_KEY/.test(envDoc) && /GROK_MODEL/.test(envDoc) && /OPENAI_KEY/.test(envDoc) &&
    /qué borrar/i.test(envDoc));
}

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const total = ok + fallos.length;
if (!fallos.length) console.log('  \x1b[32m' + ok + '/' + total + ' EN VERDE (100%)\x1b[0m · inglés, intérprete y confianza verificados');
else { console.log('  \x1b[31;1m' + ok + '/' + total + ' — ' + fallos.length + ' FALLO(S)\x1b[0m'); fallos.forEach((f) => console.log('   · ' + f)); }
console.log('');
process.exit(fallos.length ? 1 : 0);
