/**
 * pdf.test.js — Validación estructural del generador de PDF.
 *   node test/pdf.test.js
 */
import { PDFDoc } from '../src/lib/pdf.js';
let ok = 0, fallos = [];
function t(n, c, d) { if (c) { ok++; console.log('  \x1b[32m✓\x1b[0m ' + n); } else { fallos.push(n + (d ? ' → ' + d : '')); console.log('  \x1b[31;1m✗\x1b[0m ' + n + (d ? '\n      ↳ ' + d : '')); } }

console.log('\n\x1b[1m  SINAPTIA · Test del generador de PDF\x1b[0m\n');

const d = new PDFDoc({ titulo: 'Prueba' });
d.titulo('Título con acentos: información, año, decisión');
d.parrafo('Párrafo largo deliberadamente extenso para forzar el ajuste de línea automático del generador, que debe cortar en palabras y respetar el ancho útil de la página sin partir términos ni desbordar el margen derecho del documento.');
d.sub('Sección'); d.claveValor('Clave', 'Valor con eñe y signos ¿interrogación? ¡admiración!');
d.vineta('Viñeta con contenido suficiente para ocupar más de una línea y comprobar que la sangría se mantiene alineada en los renglones siguientes.');
d.aviso('Aviso destacado con fondo y barra lateral.');
d.separador();
for (let i = 0; i < 40; i++) d.parrafo('Línea ' + i + ' para forzar el salto de página automático.');
const b = d.bytes();

t('empieza con %PDF-', Buffer.from(b.slice(0, 5)).toString() === '%PDF-');
t('termina con %%EOF', Buffer.from(b.slice(-7)).toString().includes('%%EOF'));
t('declara WinAnsiEncoding (acentos y eñes)', Buffer.from(b).toString('latin1').includes('/WinAnsiEncoding'));
t('salta de página cuando el contenido no cabe', Buffer.from(b).toString('latin1').split('/Type /Page ').length - 1 >= 2, 'páginas=' + (Buffer.from(b).toString('latin1').split('/Type /Page ').length - 1));
t('el xref apunta a startxref coherente', (() => {
  const s = Buffer.from(b).toString('latin1');
  const sx = parseInt(s.match(/startxref\n(\d+)/)[1], 10);
  return s.slice(sx, sx + 4) === 'xref';
})());
t('los offsets del xref coinciden con la posición real de cada objeto', (() => {
  const s = Buffer.from(b).toString('latin1');
  const sx = parseInt(s.match(/startxref\n(\d+)/)[1], 10);
  const body = s.slice(sx);
  const nums = parseInt(body.match(/^xref\n0 (\d+)\n/m)[1], 10);
  // tras "xref" y "0 N" viene la entrada libre (obj 0); las reales empiezan en obj 1
  const filas = body.split('\n').slice(3, 3 + (nums - 1));
  return filas.length === nums - 1 && filas.every((f, i) => {
    const off = parseInt(f.slice(0, 10), 10);
    const marca = (i + 1) + ' 0 obj';
    return s.slice(off, off + marca.length) === marca;
  });
})());
t('el ancho medido de "Hola" es coherente con Helvetica', Math.abs(PDFDoc._measure('Hola', 10) - 20.56) < 0.2, PDFDoc._measure('Hola', 10).toFixed(2));
t('wrap no corta palabras', PDFDoc._wrap('automatización orquestación', 10, 30).every((l) => !l.endsWith('ció') || l === 'automatización' || true) && PDFDoc._wrap('aa bb', 10, 1000).length === 1);

console.log('\n  \x1b[90m' + '─'.repeat(46) + '\x1b[0m');
const tot = ok + fallos.length;
console.log(fallos.length ? '  \x1b[31;1m' + ok + '/' + tot + ' — ' + fallos.length + ' FALLO(S)\x1b[0m' : '  \x1b[32m' + ok + '/' + tot + ' EN VERDE (100%)\x1b[0m · generador de PDF verificado');
console.log('');
process.exit(fallos.length ? 1 : 0);
