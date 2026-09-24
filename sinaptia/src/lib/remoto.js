/**
 * remoto.js — Cliente del backend real de voz (/api/voz/*, el cerebro de B).
 *
 * Qué aporta sobre el motor local:
 *   · Claude conversando en STREAMING: la primera frase se habla antes de que
 *     el modelo termine (enviar() va entregando deltas por onDelta).
 *   · Memoria de clientes EN SERVIDOR: la cookie httpOnly `vid` viaja sola; el
 *     saludo de inicio ya reconoce al cliente ("¡Hola de nuevo!") aunque cambie
 *     de dispositivo… mientras el navegador conserve la cookie.
 *   · Cierre con resumen: cerrar() dispara /end y el backend convierte la
 *     conversación en un lead estructurado (frases textuales, objeciones…).
 *
 * Sin backend configurado (CONFIG.ia.voz vacío) nadie instancia esto: el sitio
 * sigue 100% local. Y si el backend falla al iniciar, la página degrada al
 * motor local: degrada, no se rompe.
 */

/**
 * @param {object} opts
 * @param {string} opts.base      p.ej. '/api/voz' o 'https://sitio.com/api/voz'
 * @param {string} [opts.idioma]  'es' | 'en' | 'pt'
 * @param {Function} [opts.fetchImpl]  inyectable para tests
 */
export function crearRemoto({ base, idioma = 'es', fetchImpl } = {}) {
  const f = fetchImpl || ((...a) => fetch(...a));
  const url = (p) => String(base || '').replace(/\/+$/, '') + p;
  let sessionId = null;

  return {
    get sessionId() { return sessionId; },
    get idioma() { return idioma; },

    /** Abre sesión: consentimiento + cookie + saludo (posiblemente con recall). */
    async iniciar() {
      const r = await f(url('/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ consent: true, lang: idioma }),
      });
      if (!r.ok) throw new Error('session ' + r.status);
      const j = await r.json();
      if (!j || !j.sessionId) throw new Error('session sin id');
      sessionId = j.sessionId;
      return j; // { sessionId, saludo, conocido }
    },

    /**
     * Un turno: manda texto y consume el stream. onDelta(trozo, acumulado) se
     * llama con cada delta para hablar/ pintar sin esperar el final.
     * Devuelve { texto, error } — error 'limit' = 429 (rate limit por visitante).
     */
    async enviar(texto, onDelta) {
      if (!sessionId) return { texto: '', error: 'sin_sesion' };
      let r;
      try {
        r = await f(url('/chat'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ sessionId, text: String(texto || '').slice(0, 1000) }),
        });
      } catch (e) {
        return { texto: '', error: 'red' };
      }
      if (r.status === 429) return { texto: '', error: 'limit' };
      if (!r.ok) return { texto: '', error: 'http ' + r.status };

      let lleno = '';
      try {
        if (r.body && r.body.getReader) {
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            const t = dec.decode(value, { stream: true });
            if (t) { lleno += t; if (onDelta) onDelta(t, lleno); }
          }
          lleno += dec.decode();
        } else {
          lleno = await r.text(); // navegadores viejos: sin streaming, pero funciona
          if (lleno && onDelta) onDelta(lleno, lleno);
        }
      } catch (e) {
        return { texto: lleno.trim(), error: lleno ? null : 'stream' };
      }
      return { texto: lleno.trim(), error: null };
    },

    /** Colgar: el servidor resume la conversación y actualiza el lead. */
    async cerrar() {
      if (!sessionId) return false;
      const s = sessionId;
      sessionId = null;
      try {
        await f(url('/end'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          keepalive: true, // sobrevive al cierre de la pestaña
          body: JSON.stringify({ sessionId: s }),
        });
        return true;
      } catch (e) {
        return false; // no pasa nada: el cron de rescate la resume igual
      }
    },
  };
}

/**
 * Fraccionador de stream → frases hablables.
 * push(trozo) devuelve las frases COMPLETAS que se cerraron (terminan en
 * . ! ? seguidos de espacio); lo incompleto queda en el búfer hasta flush().
 * Es lo que permite que la voz empiece a hablar con la primera frase mientras
 * Claude sigue escribiendo la segunda.
 */
export function fraccionar() {
  let buf = '';
  return {
    push(t) {
      buf += String(t || '');
      const partes = buf.split(/(?<=[.!?])\s+/);
      buf = partes.pop() ?? '';
      return partes.filter((p) => p.trim().length);
    },
    flush() {
      const r = buf.trim();
      buf = '';
      return r ? [r] : [];
    },
  };
}
