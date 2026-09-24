/**
 * postbuild.mjs — Hace dist/ portable Y autónomo.
 *
 *  1. URLs absolutas (/_astro/…) → relativas (./_astro/…): funcionan en raíz de
 *     dominio, en subruta de GitHub Pages y abierto desde el disco.
 *
 *  2. Los bundles ESM no cargan por file:// (CORS). Con varias páginas, Vite
 *     emite además chunks compartidos y el entry queda con imports sueltos.
 *     Re-empaquetamos cada entry a un IIFE autocontenido con esbuild y lo
 *     inlineamos como script clásico antes de </body>: cada HTML funciona
 *     abierto con doble clic, en el preview y servido desde cualquier ruta.
 */
import fs from 'node:fs';
import path from 'node:path';
import esbuild from 'esbuild';

const DIST = path.resolve(new URL('../dist/', import.meta.url).pathname);
let htmlTocados = 0, bundlesInlineados = 0;

async function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) { await walk(f); continue; }
    if (!f.endsWith('.html')) continue;
    await procesar(f);
  }
}

async function procesar(f) {
  let h = fs.readFileSync(f, 'utf8');

  // 1 · URLs absolutas → relativas
  h = h.replace(/(src|href)="\/([^"]*)"/g, (m, attr, rest) => `${attr}="./${rest}"`);

  // 2 · cada entry ESM → IIFE autocontenido inlineado
  const encontrados = [...h.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g)];
  const codigos = [];
  for (const m of encontrados) {
    const rel = m[1].replace(/^\.\//, '').replace(/^\//, '');
    const file = path.join(path.dirname(f), rel);
    if (!fs.existsSync(file)) continue;
    const out = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      format: 'iife',
      write: false,
      minify: false,
      target: 'es2020',
      logLevel: 'silent',
    });
    let code = out.outputFiles[0].text;
    code = code.replace(/<\/script>/gi, '<\\/script>');   // no cerrar el tag antes de tiempo
    codigos.push(code);
    h = h.split(m[0]).join('');
  }

  if (codigos.length) {
    const bloque = '\n<!-- bundle inlineado por postbuild: funciona sin servidor -->\n' +
      codigos.map((c) => `<script>\n${c}\n</script>`).join('\n') + '\n';
    // Función como reemplazo: si el bundle contiene "$&" o "$'", String.replace
    // los interpretaría y corrompería el código inyectado.
    h = h.replace('</body>', () => bloque + '</body>');
    bundlesInlineados += codigos.length;
  }

  fs.writeFileSync(f, h);
  htmlTocados++;
}

await walk(DIST);
console.log(`  postbuild: ${htmlTocados} html · ${bundlesInlineados} bundle(s) inlineado(s)`);
