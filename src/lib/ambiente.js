/**
 * ambiente.js — Música ambiental del sitio (la sala de espera).
 *
 * Reglas del producto:
 *   · suena al llegar, MUY bajita y en bucle — acompaña, nunca molesta;
 *   · entra el modo voz → se pausa (Nexa no compite con la música);
 *   · sale el modo voz → retoma donde quedó;
 *   · en /voz NO hay música: esa página ES la sala de voz.
 *
 * El audio solo puede arrancar tras un gesto del usuario (política de
 * autoplay de los navegadores), por eso se arma una red de gatillos:
 * click / tecla / toque / scroll. Si el visitante nunca interactúa,
 * simplemente no suena — comportamiento correcto, no un fallo.
 */

const SRC = 'https://cdn.pixabay.com/audio/2026-03-28/audio_d4d1650584.mp3';
const VOLUMEN = 0.1;          // ~10%: casi susurro, por debajo de la voz
const FASE_IN_MS = 2500;      // aparece despacio: nadie se asusta con música súbita
const FASE_OUT_MS = 700;      // al pausar (modo voz) se apaga rápido pero suave

export class Ambiente {
  /**
   * @param {object} opts
   * @param {Function} opts.puedeSonar  () => boolean — false ⇒ silencio total
   *                                    (p. ej. en /voz o cuando el usuario lo calle)
   * @param {string} opts.src           URL del loop (se puede sustituir por CONFIG)
   * @param {number} opts.volumen       destino del fade-in (0–1), default 0.1
   */
  constructor(opts = {}) {
    this.puedeSonar = opts.puedeSonar || (() => true);
    this.src = opts.src || SRC;
    this.volumen = Number.isFinite(opts.volumen) ? Math.min(1, Math.max(0, opts.volumen)) : VOLUMEN;
    this.el = null;        // <audio> creado perezosamente: nada de red hasta el primer gesto
    this._raf = null;
    this.silenciado = false;   // decisión explícita del visitante (clic en el botón)
  }

  /** Arma el elemento <audio> sin reproducir nada todavía. */
  _crear() {
    if (this.el) return this.el;
    const a = new Audio(this.src);
    a.loop = true;
    a.preload = 'none';      // no gasta ancho de banda hasta que de verdad vaya a sonar
    a.volume = 0;
    this.el = a;
    return a;
  }

  /** Suena si las reglas lo permiten. Idempotente: si ya suena, no hace nada. */
  async iniciar() {
    if (this.silenciado || !this.puedeSonar()) return;
    const a = this._crear();
    try { await a.play(); } catch (_) { return; }   // gesto aún no válido: reintentará en el próximo
    this._fade(a, a.volume || 0, this.volumen, FASE_IN_MS);
  }

  /** Pausa suave (no stop): retoma exacto donde quedó. */
  pausar() {
    const a = this.el;
    if (!a || a.paused) return;
    this._fade(a, a.volume, 0, FASE_OUT_MS, () => a.pause());
  }

  /** Retoma la pausa (si las reglas lo permiten). */
  reanudar() {
    if (!this.el || this.silenciado || !this.puedeSonar()) return;
    if (!this.el.paused && this.el.volume > 0) return;   // ya suena
    this.iniciar();
  }

  /** Silencio permanente por decisión del usuario (botón "música"). */
  alternarSilencio() {
    this.silenciado = !this.silenciado;
    if (this.silenciado) this.pausar();
    else this.iniciar();
    return this.silenciado;
  }

  /** Encendido perezoso: el primer gesto del visitante dispara la música. */
  conectarGestos() {
    const encender = () => { this.iniciar(); };
    const eventos = ['pointerdown', 'keydown'];
    for (const ev of eventos) window.addEventListener(ev, encender, { once: true, passive: true });
    // respaldo: quien solo hace scroll también es un visitante presente
    window.addEventListener('scroll', encender, { once: true, passive: true });
  }

  /** Rampa de volumen con requestAnimationFrame; cancela rampas anteriores. */
  _fade(a, desde, hacia, ms, alTerminar) {
    if (this._raf) cancelAnimationFrame(this._raf);
    const t0 = performance.now();
    const paso = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      a.volume = Math.max(0, Math.min(1, desde + (hacia - desde) * p));
      if (p < 1) this._raf = requestAnimationFrame(paso);
      else { this._raf = null; if (alTerminar) alTerminar(); }
    };
    this._raf = requestAnimationFrame(paso);
  }
}
