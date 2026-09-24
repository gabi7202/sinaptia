/**
 * pdf.js — Generador de PDF sin dependencias.
 *
 * Por qué sin librerías: el sitio se aloja en GitHub Pages (estático, sin build).
 * Cualquier CDN sería un punto de fallo y rompería la entrega del PDF justo en el
 * momento más importante del funnel. Esto produce un PDF válido con Helvetica,
 * multi-página, acentos y eñes incluidos (WinAnsiEncoding).
 *
 * Uso:
 *   const doc = new PDFDoc();
 *   doc.titulo('Brief de implementación');
 *   doc.parrafo('texto…');
 *   doc.sub('Sección');
 *   doc.vineta('punto…');
 *   doc.claveValor('Cliente', 'Acme');
 *   doc.salto();
 *   doc.descargar('brief.pdf');            // navegador
 *   const bytes = doc.bytes();             // Uint8Array (testable en Node)
 */

  // Anchos Helvetica estándar (unidades/1000), ASCII 32–126.
  const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
             556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
             1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
             667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
             333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
             556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const widthOf = (ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 32 && c <= 126) return W[c - 32];
    // WinAnsi: acentos y signos latinos ≈ ancho de su letra base
    const map = { 'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n','ü':'u','Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ñ':'N','¿':'?','¡':'!','€':'E','“':'"','”':'"','‘':"'",'’':"'",'—':'m','–':'-','·':'.','•':'.','…':'.','→':'-' };
    return W[( (map[ch] || ' ').charCodeAt(0) ) - 32] || 556;
  };

  const BULLET = '\u2022';                 // latin1() lo convierte a 0x95 (WinAnsi)
  const PW = 595.28, PH = 841.89;           // A4 en puntos
  const M = 56;                              // margen
  const CW = PW - M * 2;                     // ancho útil

  // Bytes WinAnsi para puntuación tipográfica que no está en Latin-1 directo
  const WIN = { 0x20AC:0x80, 0x2026:0x85, 0x2018:0x91, 0x2019:0x92, 0x201C:0x93,
                0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97 };
  // Sustitutos ASCII para glifos que WinAnsi no tiene
  const FALL = { 0x2192:'->', 0x2713:'OK', 0x26A0:'!', 0x00A0:' ', 0x2028:' ', 0x2029:' ' };

  function latin1(str) {
    const out = [];
    for (const ch of String(str)) {
      const c = ch.codePointAt(0);
      if (c < 256) { out.push(c); continue; }
      if (WIN[c] != null) { out.push(WIN[c]); continue; }
      if (FALL[c] != null) { for (const r of FALL[c]) out.push(r.charCodeAt(0)); continue; }
      out.push(63);                          // '?' como último recurso
    }
    return out;
  }
  function esc(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }
  function measure(text, size) {
    let t = 0;
    for (const ch of String(text)) t += widthOf(ch);
    return t * size / 1000;
  }
  function wrap(text, size, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '';
    for (const w of words) {
      const trial = cur ? cur + ' ' + w : w;
      if (measure(trial, size) <= maxW) cur = trial;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  function PDFDoc(meta) {
    this.meta = meta || {};
    this.pages = [];        // cada página: array de operaciones de contenido
    this._newPage();        // deja this.y listo en el tope de la página
  }

  PDFDoc.prototype._newPage = function () {
    this.pages.push([]);
    this.y = PH - M;        // primera línea (desde arriba)
  };
  PDFDoc.prototype._ensure = function (h) {
    if (this.y - h < M) this._newPage();
  };
  PDFDoc.prototype._text = function (str, o) {
    o = o || {};
    const size = o.size || 10, color = o.color || [0.2, 0.25, 0.31];
    const lines = wrap(str, size, o.maxW != null ? o.maxW : CW - (o.indent || 0));
    const lh = o.lh != null ? o.lh : size * 1.42;
    for (const ln of lines) {
      this._ensure(lh);
      const x = M + (o.indent || 0);
      this.y -= lh;
      this.pages[this.pages.length - 1].push(
        `BT /F1 ${size} Tf ${color[0]} ${color[1]} ${color[2]} rg ${x.toFixed(2)} ${this.y.toFixed(2)} Td (${esc(ln)}) Tj ET`
      );
    }
    if (o.after) { this.y -= o.after; this._ensure(0); }
    return this;
  };

  // ── API pública ──────────────────────────────────────────────
  PDFDoc.prototype.titulo = function (t) {
    this._ensure(60);
    this.y -= 6;
    this._text(t, { size: 21, color: [0.04, 0.11, 0.17], lh: 26, after: 4 });
    // regla cian
    this.pages[this.pages.length - 1].push(
      `0.13 0.83 0.93 rg ${M} ${this.y.toFixed(2)} ${CW * 0.34} 2.2 re f`
    );
    this.y -= 14;
    return this;
  };
  PDFDoc.prototype.sub = function (t) {
    this.y -= 8; this._ensure(30);
    this._text(t, { size: 12.5, color: [0.11, 0.29, 0.40], lh: 17, after: 3 });
    return this;
  };
  PDFDoc.prototype.parrafo = function (t) { return this._text(t, { size: 10, lh: 14.6, after: 7 }); };
  PDFDoc.prototype.vineta = function (t) {
    const lines = wrap(t, 10, CW - 16);
    const lh = 14.6;
    for (let i = 0; i < lines.length; i++) {
      this._ensure(lh);
      this.y -= lh;
      const pg = this.pages[this.pages.length - 1];
      if (i === 0) pg.push(`BT /F1 10 Tf 0.13 0.55 0.62 rg ${M + 2} ${this.y.toFixed(2)} Td (${BULLET}) Tj ET`);
      pg.push(`BT /F1 10 Tf 0.2 0.25 0.31 rg ${M + 16} ${this.y.toFixed(2)} Td (${esc(lines[i])}) Tj ET`);
    }
    this.y -= 2; this._ensure(0);
    return this;
  };
  PDFDoc.prototype.claveValor = function (k, v) {
    this._ensure(15);
    this._text(k + ':', { size: 10, lh: 14.6, maxW: 120 });
    return this._text(String(v), { size: 10, lh: 14.6, indent: 122, maxW: CW - 122, after: 1 });
  };
  PDFDoc.prototype.aviso = function (t) {
    this._ensure(40);
    const lines = wrap(t, 9.5, CW - 24);
    const h = lines.length * 13 + 14;
    this._ensure(h);
    const top = this.y;
    this.pages[this.pages.length - 1].push(
      `0.99 0.95 0.80 rg ${M} ${(top - h).toFixed(2)} ${CW} ${h} re f` +
      ` 0.96 0.62 0.04 rg ${M} ${(top - h).toFixed(2)} 2.4 ${h} re f`
    );
    this.y -= 11;
    this._text(t, { size: 9.5, lh: 13, indent: 12, maxW: CW - 24, color: [0.42, 0.25, 0.03] });
    this.y -= 8;
    return this;
  };
  PDFDoc.prototype.separador = function () {
    this.y -= 6; this._ensure(10);
    this.pages[this.pages.length - 1].push(`0.85 0.88 0.90 rg ${M} ${this.y.toFixed(2)} ${CW} 0.7 re f`);
    this.y -= 12;
    return this;
  };
  PDFDoc.prototype.salto = function () { this._newPage(); return this; };
  PDFDoc.prototype.espacio = function (h) { this.y -= h; this._ensure(0); return this; };

  // ── Serialización ────────────────────────────────────────────
  PDFDoc.prototype.bytes = function () {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const date = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const objs = [];
    const nPages = this.pages.length;

    objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
    const kids = [];
    for (let i = 0; i < nPages; i++) kids.push(`${4 + i * 2} 0 R`);
    objs[2] = `<< /Type /Pages /Count ${nPages} /Kids [${kids.join(' ')}] >>`;
    objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;

    for (let i = 0; i < nPages; i++) {
      const pageObj = 4 + i * 2, contentObj = 5 + i * 2;
      objs[pageObj] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObj} 0 R >>`;
      const stream = this.pages[i].join('\n');
      const sb = latin1(stream);
      objs[contentObj] = { stream: sb, dict: `<< /Length ${sb.length} >>` };
    }

    const infoObj = 4 + nPages * 2;
    objs[infoObj] = `<< /Title (${esc(this.meta.titulo || 'Documento')}) /Producer (Sinaptia Prospect Agent) /CreationDate (${date}) >>`;

    // ensambla
    const chunks = [];
    const offsets = [0];
    let pos = 0;
    const push = (s) => { const b = latin1(s); chunks.push(b); pos += b.length; };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = pos;
      const o = objs[i];
      if (o && o.stream) {
        push(`${i} 0 obj\n${o.dict}\nstream\n`);
        chunks.push(o.stream); pos += o.stream.length;
        push('\nendstream\nendobj\n');
      } else {
        push(`${i} 0 obj\n${o}\nendobj\n`);
      }
    }
    const xref = pos;
    let x = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    push(x);

    const total = pos;
    const out = new Uint8Array(total);
    let k = 0;
    for (const c of chunks) { for (let i = 0; i < c.length; i++) out[k++] = c[i]; }
    return out;
  };

  PDFDoc.prototype.descargar = function (nombre) {
    const b = this.bytes();
    // IMPORTANTE: el Blob debe recibir el Uint8Array crudo. Si se le pasa un
    // string binario, el navegador lo codifica como UTF-8 y corrompe todo byte
    // >127 (acentos) además de desplazar los offsets de la tabla xref.
    const blob = new Blob([b], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre || 'documento.pdf';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
    return this;
  };

  // expone utilidades para tests
  PDFDoc._measure = measure;
  PDFDoc._wrap = wrap;

export { PDFDoc };
