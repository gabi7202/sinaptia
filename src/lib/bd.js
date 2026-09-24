/**
 * bd.js — Base de datos del agente.
 *
 * Todo lo que pasa deja un registro JSON: cada turno de chat o de voz, cada
 * patrón detectado, cada campo del cliente, cada corrección aplicada, cada PDF
 * generado y cada evento de llamada.
 *
 * Tres niveles de almacenamiento, de menor a mayor:
 *   1. Memoria       · siempre, para la sesión
 *   2. localStorage  · siempre, sobrevive recargas (tope de 500 registros)
 *   3. Remoto        · si configuras bd.url (cualquier POST) o bd.supabase
 *                      {url, key, tabla}: sincroniza en lotes y vacía la cola
 *
 * El sitio sigue siendo estático: la "base de datos" vive en el navegador del
 * visitante y viaja a tu backend cuando tú lo conectas. Nada se envía sin
 * configurarlo, y el visitante puede exportar o borrar sus datos.
 */

const CLAVE = 'sinaptia:bd';
const TOPE = 500;

let sec = 0;
function id() {
  sec += 1;
  return `${Date.now().toString(36)}-${sec.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class BD {
  constructor({ remoto = null, supabase = null, alCambiar = null } = {}) {
    this.remoto = remoto;
    this.supabase = supabase;
    this.alCambiar = alCambiar;
    this.memoria = [];
    this.cola = [];
    this._cargar();
  }

  _cargar() {
    try {
      const raw = localStorage.getItem(CLAVE);
      if (!raw) return;
      const j = JSON.parse(raw);
      if (Array.isArray(j.registros)) this.memoria = j.registros.slice(-TOPE);
      if (Array.isArray(j.cola)) this.cola = j.cola;
    } catch (e) { /* almacenamiento bloqueado: seguimos en memoria */ }
  }

  _guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ registros: this.memoria, cola: this.cola }));
    } catch (e) {}
    if (this.alCambiar) this.alCambiar(this);
  }

  /**
   * Registra un evento.
   * @param {string} evento  'turno'|'lead'|'llamada'|'pdf'|'correccion'|'contexto'
   * @param {object} datos   payload JSON libre
   */
  registrar(evento, datos = {}) {
    const r = { id: id(), ts: new Date().toISOString(), evento, ...datos };
    this.memoria.push(r);
    if (this.memoria.length > TOPE) this.memoria.shift();
    this.cola.push(r);
    this._guardar();
    return r;
  }

  todos() { return this.memoria.slice(); }
  porEvento(evento) { return this.memoria.filter((r) => r.evento === evento); }
  get tamano() { return this.memoria.length; }
  get pendiente() { return this.cola.length; }

  /** Último snapshot de lead, o null. */
  lead() {
    const leads = this.porEvento('lead');
    return leads.length ? leads[leads.length - 1].lead : null;
  }

  /** Vacía los datos del visitante en este navegador. */
  borrar() {
    this.memoria = [];
    this.cola = [];
    try { localStorage.removeItem(CLAVE); } catch (e) {}
    if (this.alCambiar) this.alCambiar(this);
  }

  /** Descarga todo como archivo JSON. */
  exportar(nombre = 'sinaptia-datos.json') {
    const blob = new Blob([JSON.stringify({ exportado: new Date().toISOString(), registros: this.memoria }, null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
    return this.memoria.length;
  }

  /** Envía la cola al remoto configurado. Devuelve cuántos registros viajaron. */
  async sincronizar() {
    if (!this.cola.length) return 0;
    const lote = this.cola.slice();

    if (this.supabase && this.supabase.url && this.supabase.key) {
      const tabla = this.supabase.tabla || 'eventos';
      const r = await fetch(`${this.supabase.url.replace(/\/$/, '')}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.supabase.key,
          Authorization: `Bearer ${this.supabase.key}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(lote.map((x) => ({ payload: x }))),
      }).catch(() => null);
      if (r && r.ok) { this.cola = []; this._guardar(); return lote.length; }
      return 0;
    }

    if (this.remoto) {
      const r = await fetch(this.remoto, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lote }),
      }).catch(() => null);
      if (r && r.ok) { this.cola = []; this._guardar(); return lote.length; }
    }
    return 0;
  }
}
