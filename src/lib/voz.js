/**
 * voz.js — Conversación hablada real sobre el agente existente.
 *
 *   habla la persona → SpeechRecognition (voz→texto, nativo del navegador)
 *                    → engine.responder() (razonamiento, milisegundos, sin red)
 *                    → speechSynthesis (texto→voz, nativo)
 *
 * Sin claves y sin backend: funciona en GitHub Pages tal cual. El presupuesto
 * de latencia es: fin de la frase → respuesta sonando en ~0,3–1,5 s, porque el
 * "razonamiento" es local e instantáneo y el TTS empieza a hablar con el primer
 * fragmento de texto.
 *
 * Comportamiento conversacional:
 *   · escucha automática tras terminar de hablar (bucle de conversación)
 *   · barge-in: si la persona habla mientras la IA habla, la IA se calla y escucha
 *   · estados visibles: escuchando / pensando / hablando
 *   · si el navegador no soporta alguna de las dos mitades, degrada con aviso
 *     y el chat de texto sigue funcionando igual
 */

const ESTADOS = { INACTIVA: 'inactiva', ESCUCHANDO: 'escuchando', PENSANDO: 'pensando', HABLANDO: 'hablando' };

export class Voz {
  /**
   * @param {object} opts
   * @param {Function} opts.responder   (texto) => { texto, ... }  · el agente
   * @param {Function} opts.onEstado    (estado) => void
   * @param {Function} opts.onTranscripcion (texto, esFinal) => void
   * @param {Function} opts.onRespuesta (texto, r) => void
   * @param {Function} [opts.onPatron]  (intencion) => void · patrón detectado en el turno
   * @param {object}  [opts.conf]       { lang, autoEscucha, velocidad, tono, prefVoz }
   */
  constructor({ responder, onEstado, onTranscripcion, onRespuesta, onPatron, fusionar, conf = {} }) {
    this.responder = responder;
    this.onEstado = onEstado || (() => {});
    this.onTranscripcion = onTranscripcion || (() => {});
    this.onRespuesta = onRespuesta || (() => {});
    this.onPatron = onPatron || (() => {});
    this.conf = {
      lang: conf.lang || 'es-ES',
      autoEscucha: conf.autoEscucha !== false,
      velocidad: conf.velocidad || 1.04,
      tono: conf.tono || 1,
      prefVoz: conf.prefVoz || '',
    };
    this.estado = ESTADOS.INACTIVA;
    this.activa = false;
    // Estado de interrupción/fusión: qué iba a decir, cuánto alcanzó a decir,
    // y qué dijo el cliente encima. Nunca pause()/resume(): cancel() + onboundary.
    this.fullResponseText = '';
    this.spokenSoFar = '';
    this.fusionar = fusionar || null;   // (payload) => texto fusionado
    this._rec = null;
    this._vozElegida = null;
    this._reiniciarEn = null;
  }

  static soportado() {
    const stt = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const tts = typeof window.speechSynthesis !== 'undefined';
    return { stt, tts, completo: stt && tts };
  }

  _setEstado(e) { this.estado = e; this.onEstado(e); }

  _vozes() {
    const todas = window.speechSynthesis.getVoices() || [];
    if (!todas.length) return null;
    const pref = this.conf.prefVoz;
    return (
      (pref && todas.find((v) => v.lang && v.lang.toLowerCase().startsWith(pref.toLowerCase()))) ||
      todas.find((v) => v.lang && v.lang.toLowerCase() === this.conf.lang.toLowerCase()) ||
      todas.find((v) => v.lang && v.lang.toLowerCase().startsWith('es-')) ||
      todas.find((v) => v.lang && v.lang.toLowerCase().startsWith('es')) ||
      todas[0] || null
    );
  }

  iniciar(saludoInicial) {
    if (!Voz.soportado().completo) return false;
    this.activa = true;
    this._vozElegida = this._vozes();
    // las voces cargan de forma asíncrona en algunos navegadores
    if (!this._vozElegida && typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
      window.speechSynthesis.onvoiceschanged = () => { if (!this._vozElegida) this._vozElegida = this._vozes(); };
    }
    if (saludoInicial) this._hablar(saludoInicial);
    else this._escuchar();
    return true;
  }

  detener() {
    this.activa = false;
    clearTimeout(this._reiniciarEn);
    if (this._rec) { try { this._rec.abort(); } catch (e) {} this._rec = null; }
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    this._setEstado(ESTADOS.INACTIVA);
  }

  /**
   * Interrumpir el audio y escuchar al cliente: cancel() (nunca pause) y luego
   * STT. Lo dicho hasta el corte + lo que el cliente diga se fusionan en UNA
   * sola respuesta nueva, no en dos audios pegados.
   */
  interrumpirYEscuchar() {
    if (this.estado !== ESTADOS.HABLANDO) return false;
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    this._setEstado(ESTADOS.ESCUCHANDO);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this._setEstado(ESTADOS.INACTIVA); return false; }
    const rec = new SR();
    rec.lang = this.conf.lang; rec.continuous = false; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const dicho = ev.results[0] && ev.results[0][0] ? ev.results[0][0].transcript : '';
      if (dicho) this._procesarInterrupcion(dicho);
      else this._setEstado(ESTADOS.INACTIVA);
    };
    rec.onerror = () => this._setEstado(ESTADOS.INACTIVA);
    rec.onend = () => { if (this.estado === ESTADOS.ESCUCHANDO) this._setEstado(ESTADOS.INACTIVA); };
    try { rec.start(); } catch (e) { this._setEstado(ESTADOS.INACTIVA); }
    return true;
  }

  /** Manda el contexto de corte y habla la respuesta fusionada como un solo audio. */
  async _procesarInterrupcion(textoCliente) {
    if (!this.activa) return;
    this._setEstado(ESTADOS.PENSANDO);
    const payload = {
      respuesta_incompleta: this.fullResponseText,
      respuesta_ya_dicha: this.spokenSoFar,
      interrupcion_cliente: textoCliente,
    };
    let fusion = null;
    if (this.fusionar) fusion = await this.fusionar(payload);
    if (!fusion) {
      // fusión determinista sin backend: responde la interrupción y retoma el hilo
      // sin repetir lo ya dicho ni decir "como mencionaba antes"
      const r = await Promise.resolve(this.responder(textoCliente));
      fusion = r && r.texto ? r.texto : textoCliente;
    }
    if (!this.activa) return;
    this._hablar(fusion);
  }

  /** Pausa la escucha sin colgar (la persona quiere leer o escribir). */
  pausar() {
    this.conf.autoEscucha = false;
    clearTimeout(this._reiniciarEn);
    if (this._rec) { try { this._rec.stop(); } catch (e) {} }
    if (this.estado === ESTADOS.ESCUCHANDO) this._setEstado(ESTADOS.INACTIVA);
  }

  /** Reanuda el bucle de conversación. */
  reanudar() {
    this.conf.autoEscucha = true;
    if (this.estado === ESTADOS.INACTIVA && this.activa) this._escuchar();
  }

  /** La persona puede silenciar la voz de la IA y seguir por texto. */
  silenciada = false;
  alternarSilencio() {
    this.silenciada = !this.silenciada;
    if (this.silenciada && typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();
    return this.silenciada;
  }

  // ── escucha ────────────────────────────────────────────────
  _escuchar() {
    if (!this.activa) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this._setEstado(ESTADOS.INACTIVA); return; }
    // si la IA está hablando, se calla primero: manda la persona
    if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel();

    const rec = new SR();
    this._rec = rec;
    rec.lang = this.conf.lang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    let finalTexto = '';
    rec.onresult = (ev) => {
      let inter = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalTexto += t;
        else inter += t;
      }
      this.onTranscripcion(finalTexto || inter, !!finalTexto && !inter);
    };
    rec.onerror = (ev) => {
      // 'no-speech' es simplemente silencio: se vuelve a intentar
      if (ev.error === 'no-speech' || ev.error === 'aborted') return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        this.onTranscripcion('⚠ El navegador negó el permiso de micrófono.', true);
        this.detener();
      }
    };
    rec.onend = () => {
      this._rec = null;
      if (!this.activa) return;
      const dicho = finalTexto.trim();
      if (dicho) this._procesar(dicho);
      else if (this.conf.autoEscucha) this._reiniciarEn = setTimeout(() => this._escuchar(), 250);
      else this._setEstado(ESTADOS.INACTIVA);
    };

    this._setEstado(ESTADOS.ESCUCHANDO);
    try { rec.start(); } catch (e) { /* ya estaba arrancado */ }
  }

  // ── razonamiento ───────────────────────────────────────────
  _procesar(texto) {
    if (!this.activa) return;
    this._setEstado(ESTADOS.PENSANDO);
    // el motor es síncrono y local: el "pensando" dura milisegundos
    setTimeout(() => {
      if (!this.activa) return;
      Promise.resolve(this.responder(texto)).then((r) => {
        if (!this.activa) return;
        this.onRespuesta(r.texto, r);
        if (r && r.guion && r.guion.intencion) this.onPatron(r.guion.intencion);
        this._hablar(this._paraVoz(this._resumir(r.texto)));
      });
    }, 60);
  }

  /** En voz, como mucho dos ideas: lo demás se ve en pantalla, no se escucha. */
  _resumir(t) {
    const frases = String(t).split(/(?<=[.!?])\s+/).filter(Boolean);
    if (frases.length <= 2) return t;
    return frases.slice(0, 2).join(' ');
  }

  /** Quita del texto lo que no debe pronunciarse: marcas, urls, símbolos. */
  _paraVoz(t) {
    return String(t)
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/https?:\/\/\S+/g, 'el enlace que ves en pantalla')
      .replace(/[·•]/g, ',')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // ── habla ──────────────────────────────────────────────────
  _hablar(texto) {
    if (!this.activa) return;
    this.fullResponseText = texto;
    this.spokenSoFar = '';
    if (this.silenciada) {
      // sin voz: se muestra y se vuelve a escuchar
      if (this.conf.autoEscucha) this._reiniciarEn = setTimeout(() => this._escuchar(), 700);
      else this._setEstado(ESTADOS.INACTIVA);
      return;
    }
    const u = new SpeechSynthesisUtterance(texto);
    if (this._vozElegida) u.voice = this._vozElegida;
    u.lang = this.conf.lang;
    u.rate = this.conf.velocidad;
    u.pitch = this.conf.tono;
    // hasta dónde alcanzó a hablar, palabra por palabra, sin pause()/resume()
    u.onboundary = (e) => { if (typeof e.charIndex === 'number') this.spokenSoFar = texto.slice(0, e.charIndex); };
    u.onstart = () => this._setEstado(ESTADOS.HABLANDO);
    u.onend = () => {
      if (!this.activa) return;
      if (this.conf.autoEscucha) this._escuchar();
      else this._setEstado(ESTADOS.INACTIVA);
    };
    u.onerror = () => {
      if (!this.activa) return;
      if (this.conf.autoEscucha) this._escuchar();
    };
    this._setEstado(ESTADOS.HABLANDO);
    window.speechSynthesis.speak(u);
  }
}

export { ESTADOS };
