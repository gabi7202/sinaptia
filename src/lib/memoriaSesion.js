/**
 * memoriaSesion.js — Memoria temporal de la conversación en el navegador.
 *
 * Por qué existe: Groq no guarda estado entre peticiones. Si el cliente recarga,
 * bloquea el móvil o cambia de pestaña, sin esto el hilo se pierde. Aquí la
 * conversación vive en `localStorage` con caducidad (12 h por defecto) y se manda
 * en cada turno al proxy. Así el modelo recuerda sin necesidad de Supabase.
 *
 * Decisiones:
 *   · Temporal de verdad: TTL desde el último turno, no para siempre.
 *   · Por idioma: cambiar de idioma no mezcla conversaciones.
 *   · Tope de 40 turnos y 600 caracteres por turno: cuota de móvil respetada.
 *   · Borrable: `borrar()` elimina todo y el visitante puede empezar de cero.
 *   · Sin secretos: solo texto de la conversación y datos que él dio.
 *
 * No es la memoria de clientes (memoria.js); esto es el hilo de ESTA sesión.
 */

const PREFIJO = 'sinaptia:sesion';
const VERSION = 'v1';

function almacenSeguro(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (e) { /* modo privado bloqueado */ }
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

function recortar(v, max) {
  const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

export class MemoriaSesion {
  /**
   * @param {object} opts
   * @param {string} [opts.idioma]   'es'|'en'|'pt'
   * @param {Storage} [opts.storage] inyectable para tests
   * @param {number} [opts.horas]    TTL desde el último turno (12 por defecto)
   * @param {number} [opts.maxTurnos]
   * @param {Function} [opts.ahora]  () => ms, inyectable para tests
   */
  constructor({ idioma = 'es', storage = null, horas = 12, maxTurnos = 40, ahora = () => Date.now() } = {}) {
    this.idioma = String(idioma || 'es').slice(0, 5);
    this.storage = almacenSeguro(storage);
    this.horas = Number.isFinite(Number(horas)) && Number(horas) > 0 ? Number(horas) : 12;
    this.maxTurnos = Number.isFinite(Number(maxTurnos)) && Number(maxTurnos) > 4 ? Number(maxTurnos) : 40;
    this.ahora = ahora;
    this.clave = `${PREFIJO}:${this.idioma}:${VERSION}`;
    this.datos = this._leer();
  }

  _leer() {
    try {
      const raw = this.storage.getItem(this.clave);
      if (!raw) return this._vacio();
      const j = JSON.parse(raw);
      if (!j || !Array.isArray(j.turnos)) return this._vacio();
      if (j.expira && Number(j.expira) <= this.ahora()) {
        this.storage.removeItem(this.clave);
        return this._vacio();
      }
      return {
        version: VERSION,
        idioma: this.idioma,
        creado: j.creado || new Date(this.ahora()).toISOString(),
        actualizado: j.actualizado || j.creado || null,
        expira: j.expira || null,
        lead: j.lead && typeof j.lead === 'object' ? j.lead : {},
        resumen: typeof j.resumen === 'string' ? j.resumen : '',
        turnos: j.turnos.slice(-this.maxTurnos),
      };
    } catch (e) {
      return this._vacio();
    }
  }

  _vacio() {
    return {
      version: VERSION, idioma: this.idioma,
      creado: new Date(this.ahora()).toISOString(), actualizado: null,
      expira: null, lead: {}, resumen: '', turnos: [],
    };
  }

  _guardar() {
    try { this.storage.setItem(this.clave, JSON.stringify(this.datos)); } catch (e) { /* cuota llena: no romper la charla */ }
    return this;
  }

  /** Añade un turno: 'user' | 'bot'. */
  agregar(rol, texto, extra = {}) {
    const t = recortar(texto, 600);
    if (!t) return this;
    this.datos.turnos.push({
      rol: rol === 'bot' || rol === 'assistant' ? 'bot' : 'user',
      texto: t,
      ts: new Date(this.ahora()).toISOString(),
      ...extra,
    });
    if (this.datos.turnos.length > this.maxTurnos) {
      this.datos.turnos = this.datos.turnos.slice(-this.maxTurnos);
    }
    this.datos.actualizado = new Date(this.ahora()).toISOString();
    this.datos.expira = this.ahora() + this.horas * 3600e3;
    return this._guardar();
  }

  /** Guarda/actualiza el perfil del lead (solo lo que dijo). */
  guardarLead(lead = {}) {
    if (!lead || typeof lead !== 'object') return this;
    const campos = ['nombre', 'empresa', 'email', 'telefono', 'sector', 'dolor', 'volumen',
      'herramientas', 'urgencia', 'rol', 'pais', 'presupuesto'];
    for (const k of campos) {
      const v = recortar(lead[k], k === 'email' ? 120 : 220);
      if (v) this.datos.lead[k] = k === 'email' ? v.toLowerCase() : v;
    }
    if (lead.dolor) this.datos.resumen = recortar(lead.dolor, 300);
    this.datos.actualizado = new Date(this.ahora()).toISOString();
    this.datos.expira = this.ahora() + this.horas * 3600e3;
    return this._guardar();
  }

  turnos() { return this.datos.turnos.slice(); }
  get tamano() { return this.datos.turnos.length; }
  get vacia() { return this.datos.turnos.length === 0 && !Object.keys(this.datos.lead || {}).length; }
  lead() { return { ...(this.datos.lead || {}) }; }

  /** Historial en formato OpenAI/Groq (sin duplicar el mensaje actual). */
  historial(limite = 14) {
    return this.datos.turnos.slice(-limite).map((t) => ({
      role: t.rol === 'bot' ? 'assistant' : 'user',
      content: t.texto,
    }));
  }

  /** Lo que viaja al proxy en cada turno. */
  contexto() {
    return {
      resumen: this.datos.resumen,
      lead: this.lead(),
      idioma: this.idioma,
      actualizado: this.datos.actualizado,
      turnos: this.datos.turnos.slice(-16).map((t) => ({ rol: t.rol, texto: t.texto })),
    };
  }

  /** Reproduce los turnos del usuario en el motor para recuperar su estado. */
  reproducir(agente) {
    if (!agente || typeof agente.responder !== 'function') return null;
    let ultimo = null;
    for (const t of this.datos.turnos) {
      if (t.rol !== 'user') continue;
      try { ultimo = agente.responder(t.texto); } catch (e) { /* un turno raro no bloquea el resto */ }
    }
    return ultimo;
  }

  /** Borra esta conversación (no toca la memoria de clientes ni la BD). */
  borrar() {
    this.datos = this._vacio();
    try { this.storage.removeItem(this.clave); } catch (e) { /* nada */ }
    return this;
  }

  /** Milisegundos hasta caducar (0 si no hay nada). */
  restanteMs() {
    if (!this.datos.expira) return 0;
    return Math.max(0, Number(this.datos.expira) - this.ahora());
  }
}

export { PREFIJO, VERSION };
