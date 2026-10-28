/**
 * proyecto.js — Cómo el brief llega al visitante y cómo llega una copia al dueño.
 *
 * Tres caminos, en este orden:
 *   1. `POST /api/proyecto` → el servidor envía la copia por Google Apps Script
 *      (Gmail), Resend, webhook o Supabase. El correo del dueño nunca se expone.
 *   2. Web Share API del móvil → comparte el PDF por WhatsApp/email con el
 *      archivo adjunto real (iOS/Android). No depende del backend.
 *   3. `wa.me` con el resumen del proyecto → último recurso universal y sin
 *      exponer ningún correo.
 *
 * El PDF siempre se descarga en el dispositivo: el visitante nunca se queda sin
 * su documento porque el servidor falle.
 */

/** Uint8Array → base64 sin reventar el stack con archivos grandes. */
export function bytesABase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let bin = '';
  const trozo = 0x8000;
  for (let i = 0; i < u8.length; i += trozo) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + trozo));
  }
  return btoa(bin);
}

export function nombreSeguro(nombre) {
  return String(nombre || 'brief-sinaptia.pdf').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 120);
}

/** Envía el proyecto (y opcionalmente el PDF) al backend del dueño. */
export async function enviarCopia({ endpoint, proyecto, bytes = null, fetchImpl, timeoutMs = 12000 } = {}) {
  if (!endpoint) return { ok: false, motivo: 'sin_endpoint' };
  const f = fetchImpl || ((...a) => fetch(...a));
  let pdfBase64 = null;
  let pdfOmitido = false;
  if (bytes) {
    try {
      const b64 = bytesABase64(bytes);
      if (b64.length <= 3_500_000) pdfBase64 = b64;
      else pdfOmitido = true;
    } catch (e) { pdfOmitido = true; }
  }
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const r = await f(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({ proyecto, pdfBase64, pdfOmitido, consentimiento: true }),
    });
    clearTimeout(timer);
    let j = null;
    try { j = await r.json(); } catch (e) { j = null; }
    if (!r.ok) return { ok: false, motivo: (j && j.error) || `http ${r.status}` };
    return { ok: true, ...(j || {}) };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, motivo: String((e && e.message) || e).slice(0, 120) };
  }
}

/** WhatsApp de respaldo: resumen legible, sin adjunto y sin correo visible. */
export function whatsappCopia(proyecto = {}, numero = '529834066176', idioma = 'es') {
  const c = proyecto.contacto || {};
  const p = proyecto.propuesta || {};
  const lineas = [
    idioma === 'en' ? 'Hi Rafael, I generated this brief on the Sinaptia site:' : idioma === 'pt' ? 'Olá Rafael, gerei este brief no site da Sinaptia:' : 'Hola Rafael, generé este brief en el sitio de Sinaptia:',
    `Ref: ${proyecto.id || '—'}`,
    `Contacto: ${c.nombre || '—'} · ${c.empresa || '—'}`,
    `Sector: ${c.sector || '—'} · Volumen: ${c.volumen || '—'}`,
    `Dolor: ${(proyecto.diagnostico && proyecto.diagnostico.dolor) || '—'}`,
    p.titulo ? `Proyecto: ${p.titulo} · ${p.inversion || ''}` : '',
    idioma === 'en' ? 'I am sending the PDF and would like to discuss it.' : idioma === 'pt' ? 'Estou enviando o PDF e gostaria de conversar.' : 'Te envío el PDF y me gustaría comentarlo.',
  ].filter(Boolean);
  const limpio = String(numero || '').replace(/\D/g, '');
  return `https://wa.me/${limpio}?text=${encodeURIComponent(lineas.join('\n').slice(0, 1800))}`;
}

/** Abre WhatsApp en una pestaña nueva sin perder la página. */
export function abrirWhatsApp(url) {
  try { window.open(url, '_blank', 'noopener'); } catch (e) { window.location.href = url; }
}

/** Comparte el PDF con el archivo real en móviles compatibles. */
export async function compartirPdf(bytes, nombre, texto = 'Sinaptia · brief de proyecto') {
  try {
    if (typeof navigator === 'undefined' || !navigator.share || typeof File === 'undefined') return false;
    const file = new File([bytes], nombreSeguro(nombre), { type: 'application/pdf' });
    if (navigator.canShare && !navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: nombre, text: texto });
    return true;
  } catch (e) {
    return false;
  }
}
