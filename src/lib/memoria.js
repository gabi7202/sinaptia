/**
 * memoria.js — Memoria de clientes: "ya hemos hablado antes o empezamos desde cero".
 *
 * No es entrenamiento de modelo: es memoria estructurada y auditable. Cada
 * conversación guarda un perfil (nombre, negocio, necesidad, fecha, resumen de
 * turnos). Al volver, el agente busca por nombre o por negocio en milisegundos
 * y retoma desde donde quedó, en vez de empezar de cero.
 *
 * Por qué así y no "entrenar": un perfil explícito se puede revisar, corregir y
 * borrar (GDPR); un modelo entrenado no. Y para el dueño, este historial es el
 * oro: qué busca la gente y cómo lo busca.
 */

const CLAVE = 'sinaptia:memoria';

const NEGOCIOS = [
  'pastelería', 'panadería', 'clínica', 'clinica', 'taller', 'inmobiliaria', 'restaurante',
  'cafetería', 'cafeteria', 'tienda', 'gimnasio', 'escuela', 'consultorio', 'abogados',
  'consultora', 'logística', 'logistica', 'florería', 'floreria', 'veterinaria', 'hotel',
];

const NECESIDADES = [
  'implementar IA', 'automatizar', 'agente', 'chatbot', 'responder', 'cotizaciones',
  'facturación', 'facturacion', 'reportes', 'atención', 'atencion', 'ventas', 'web', 'app',
];

export function extraerIdentidad(texto) {
  const t = String(texto);
  const out = { nombre: null, negocio: null, necesidad: null, vuelve: false };

  const n = t.match(/\b(?:soy|me llamo|mi nombre es|soy de nuevo|habla)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i)
         || t.match(/\bsoy\s+([a-záéíóúñ]{3,12})\b/i);
  if (n) out.nombre = n[1].trim();

  const tl = t.toLowerCase();
  out.negocio = NEGOCIOS.find((n2) => tl.includes(n2.toLowerCase())) || null;
  out.necesidad = NECESIDADES.find((n2) => tl.includes(n2.toLowerCase())) || null;
  out.vuelve = /\b(ya|antes|la (semana|vez|otra) pasada|la última vez|la ultima vez|te (habl|hable|hablé|cont|conté|escrib)|hablamos)\b/i.test(tl);
  return out;
}

/** Puntúa qué tanto se parece un perfil guardado a lo que dice el texto. */
function puntaje(perfil, id) {
  let s = 0;
  if (id.nombre && perfil.nombre && norm(perfil.nombre).includes(norm(id.nombre).split(' ')[0])) s += 3;
  if (id.negocio && perfil.negocio && norm(perfil.negocio).includes(norm(id.negocio))) s += 3;
  if (id.necesidad && perfil.necesidad && norm(perfil.necesidad).includes(norm(id.necesidad))) s += 1;
  return s;
}
function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

/** Texto de recuerdo por idioma: "ya hemos hablado antes". */
export function textoRecuerdo(p, idioma = 'es') {
  const nombre = p.nombre ? p.nombre.split(' ')[0] + ', ' : '';
  const fecha = new Date(p.ultimo).toLocaleDateString(idioma === 'en' ? 'en' : idioma === 'pt' ? 'pt' : 'es', { day: 'numeric', month: 'long' });
  const tema = p.negocio || p.necesidad || 'tu proyecto';
  if (idioma === 'en') return `${nombre}I found your case: we spoke on ${fecha} about ${tema}. We don't start from zero: we pick up where we left off. Shall we continue from there, or is there something new?`;
  if (idioma === 'pt') return `${nome(p)}encontrei seu caso: conversamos em ${fecha} sobre ${tema}. Não começamos do zero: continuamos de onde paramos.`;
  return `${nombre}encontré tu caso: hablamos el ${fecha} sobre ${tema}${p.necesidad && p.negocio ? ' para ' + p.necesidad : ''}. No empezamos de cero: seguimos desde ahí. ¿Continuamos donde quedamos o hay algo nuevo?`;
}
function nome(p) { return p.nombre ? p.nombre.split(' ')[0] + ', ' : ''; }

export class Memoria {
  constructor(storage) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }
  _cargar() {
    if (!this.storage) return [];
    try { return JSON.parse(this.storage.getItem(CLAVE) || '[]'); } catch (e) { return []; }
  }
  _guardar(lista) {
    if (!this.storage) return;
    try { this.storage.setItem(CLAVE, JSON.stringify(lista.slice(-200))); } catch (e) {}
  }
  perfiles() { return this._cargar(); }

  /** Busca en un "segundo": por nombre o negocio. Devuelve el mejor perfil o null. */
  recordar(texto) {
    const id = extraerIdentidad(texto);
    const lista = this._cargar();
    let mejor = null, mejorP = 0;
    for (const p of lista) {
      const s = puntaje(p, id);
      if (s > mejorP) { mejorP = s; mejor = p; }
    }
    return mejorP >= 3 ? { perfil: mejor, score: mejorP, identidad: id } : null;
  }

  /** Guarda o actualiza el perfil tras una conversación. */
  guardar({ nombre, negocio, necesidad, resumen, idioma }) {
    if (!nombre && !negocio) return null;
    const lista = this._cargar();
    const id = { nombre, negocio };
    const idx = lista.findIndex((p) => puntaje(p, id) >= 3);
    const perfil = idx >= 0 ? lista[idx] : { id: 'p' + Date.now().toString(36), creado: new Date().toISOString() };
    Object.assign(perfil, {
      nombre: nombre || perfil.nombre,
      negocio: negocio || perfil.negocio,
      necesidad: necesidad || perfil.necesidad,
      idioma: idioma || perfil.idioma,
      ultimo: new Date().toISOString(),
      veces: (perfil.veces || 0) + 1,
      resumen: resumen || perfil.resumen,
    });
    if (idx >= 0) lista[idx] = perfil; else lista.push(perfil);
    this._guardar(lista);
    return perfil;
  }
}
