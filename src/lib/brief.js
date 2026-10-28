/**
 * brief.js — Construye el brief del proyecto y el PDF de marca.
 *
 * El PDF es la pieza que se queda el prospecto y la copia que te llega a ti.
 * Por eso: encabezado profesional con logo SINAPTIA, cuerpo argumentado para una
 * conversación de ticket alto, requerimientos para contactar al cliente y pie con
 * WhatsApp. Sin correo público, sin plazos y sin cifras que no vengan del guion.
 */

import { PDFDoc } from './pdf.js';
import { textosPdf } from './textosPdf.js';
import { puntuarLead } from './conversacion.js';

export function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44) || 'proyecto';
}

export function fechaLarga(idioma, d = new Date()) {
  const loc = idioma === 'en' ? 'en-US' : idioma === 'pt' ? 'pt-BR' : 'es-MX';
  try { return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'long', year: 'numeric' }).format(d); }
  catch (e) { return d.toISOString().slice(0, 10); }
}

export function referencia(id) {
  return String(id || '').replace(/[^A-Za-z0-9-]/g, '').slice(-10).toUpperCase() || 'SIN-REF';
}

/** Objeto canónico que se guarda, se envía por email y se usa para el PDF. */
export function construirProyecto({ lead = {}, estado = {}, ctx = {}, pack = {}, memoria = null, config = {}, id = '' }) {
  const P = estado.propuesta || null;
  const turnos = (memoria && typeof memoria.turnos === 'function' ? memoria.turnos() : [])
    .slice(-12)
    .map((t) => ({ rol: t.rol, texto: String(t.texto || '').slice(0, 500) }));
  const correcciones = (estado.correcciones || []).map((c) => ({ id: c.id, porque: c.porque }));
  const faltan = [];
  for (const k of ['sector', 'dolor', 'volumen', 'nombre', 'email', 'empresa']) {
    if (!lead[k]) faltan.push(k);
  }
  const calificacion = puntuarLead(lead);
  return {
    id: referencia(id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`),
    fecha: new Date().toISOString(),
    idioma: pack.codigo || 'es',
    canal: ctx.canal || 'web',
    contacto: {
      nombre: lead.nombre || '', email: lead.email || '', telefono: lead.telefono || '',
      empresa: lead.empresa || '', sector: lead.sector || '', volumen: lead.volumen || '',
      rol: lead.rol || '', urgencia: lead.urgencia || '', pais: lead.pais || ctx.pais || '',
      herramientas: lead.herramientas || '',
    },
    contexto: {
      ciudad: ctx.ciudad || '', pais: ctx.pais || '', clima: ctx.clima || '',
      temp: ctx.temp != null ? ctx.temp : null, hora: ctx.hora || '',
      dispositivo: ctx.dispositivo || '',
    },
    diagnostico: {
      dolor: lead.dolor || '',
      correcciones,
      resumen: (lead.dolor || '').slice(0, 400),
      faltan,
      turnos,
    },
    calificacion,
    propuesta: P ? {
      titulo: P.titulo || '', que: P.que || '', fases: P.fases || '',
      inversion: P.inversion || '', no: P.no || '',
    } : null,
    siguiente_paso: P
      ? 'Revisar el brief y hablar por WhatsApp (o videollamada corta con intérprete de IA si hace falta).'
      : 'Completar el diagnóstico y generar el brief.',
    enlaces: {
      web: config.marca && config.marca.web ? config.marca.web : '',
      whatsapp: config.marca && config.marca.whatsapp ? config.marca.whatsapp : '',
      whatsappUrl: config.marca && config.marca.whatsappUrl ? config.marca.whatsappUrl : '',
    },
  };
}

/** Crea el PDF (sin descargarlo). Devuelve { doc, nombre, proyecto }. */
export function crearBrief({ lead = {}, estado = {}, ctx = {}, pack = {}, memoria = null, config = {}, proyecto = null }) {
  const T = textosPdf(pack.codigo || 'es');
  const p = proyecto || construirProyecto({ lead, estado, ctx, pack, memoria, config });
  const marca = (config.marca && config.marca.nombre) || 'SINAPTIA';
  const persona = (config.marca && config.marca.persona) || 'Rafael Ortiz';
  const whatsapp = (config.marca && config.marca.whatsapp) || '+52 983 406 6176';
  const web = (config.marca && config.marca.web) || 'sinaptialabs.com';
  const d = new PDFDoc({ titulo: `${T.encabezadoTitulo} — ${p.contacto.empresa || p.contacto.nombre || p.id}` });

  // Encabezado de marca: banda oscura, logo vectorial, nombre y referencia.
  d.encabezado({
    marca,
    tagline: T.tagline || (config.marca && config.marca.tagline) || 'IA QUE ENTRA EN OPERACIÓN',
    titulo: T.encabezadoTitulo,
    subtitulo: `${T.preparado} ${p.contacto.empresa || p.contacto.nombre || '—'} · ${T.encabezadoSub}`,
    persona: `${persona} · ${marca}`,
    preparadoPor: T.preparadoPor,
    contacto: `WhatsApp ${whatsapp}`,
    ref: p.id,
  });

  d.parrafo(T.intro);
  d.parrafo(T.notaPersonal);
  d.parrafo(`${T.preparado} ${p.contacto.empresa || p.contacto.nombre || '—'} · ${p.contexto.ciudad || '—'} · ${fechaLarga(p.idioma)} · ${T.primerContacto}: ${p.contexto.hora || '—'}${p.contexto.temp != null ? ', ' + p.contexto.temp + '° ' + (p.contexto.clima || '') : ''}.`);

  d.sub(T.datos);
  d.claveValor(T.contacto, p.contacto.nombre || '—');
  d.claveValor(T.email, p.contacto.email || '—');
  if (p.contacto.telefono) d.claveValor(T.telefono, p.contacto.telefono);
  d.claveValor(T.empresa, p.contacto.empresa || '—');
  d.claveValor(T.sector, p.contacto.sector || '—');
  d.claveValor(T.volumen, p.contacto.volumen || T.sinDato);
  d.claveValor(T.idioma, p.idioma.toUpperCase());
  d.claveValor(T.canal, p.canal);

  d.sub(T.dolor);
  d.parrafo(`${T.oportunidadIntro} ${p.diagnostico.dolor || T.sinDolor}`);
  if (p.contacto.herramientas) d.parrafo(`${T.herramientas}: ${p.contacto.herramientas}`);
  if (p.contacto.urgencia) d.parrafo(`${T.urgencia}: ${p.contacto.urgencia}`);
  d.parrafo(T.oportunidadCierre);

  d.sub(T.requerimientos);
  [T.req1, T.req2, T.req3, T.req4, T.req5, T.req6].forEach((x) => d.vineta(x));

  d.sub(T.debate);
  [T.deb1, T.deb2, T.deb3, T.deb4].forEach((x) => d.vineta(x));

  d.sub(T.proyecto);
  if (p.propuesta) {
    d.parrafo(`${p.propuesta.titulo}. ${p.propuesta.que}`);
    d.parrafo(`${T.fases}: ${p.propuesta.fases}`);
    d.parrafo(`${T.inversion}: ${p.propuesta.inversion || T.sinDato}`);
  } else {
    d.parrafo(T.sinDolor);
  }

  d.sub(T.expectativas);
  if (p.diagnostico.correcciones.length) {
    p.diagnostico.correcciones.forEach((c) => d.vineta(c.porque || c.id));
  } else {
    d.vineta(T.sinAjustes);
  }

  if (p.propuesta && p.propuesta.no) d.aviso(`${T.noAutomatizar}: ${p.propuesta.no}`);

  d.sub(T.porQue);
  d.parrafo(T.porQueTexto);

  d.sub(T.cuidado);
  d.parrafo(T.cuidadoTexto);

  d.sub(T.siguiente);
  d.vineta(T.paso1);
  d.vineta(`${T.paso2}: WhatsApp ${whatsapp}`);
  d.vineta(T.paso2b);
  d.vineta(T.paso3);

  if (p.diagnostico.dolor) {
    d.sub(T.resumen);
    d.vineta(`${p.contacto.sector || '—'} · ${p.diagnostico.dolor}`);
  }

  d.parrafo(`${persona} · ${marca}`);

  // Pie de marca con el WhatsApp visible y el número grande.
  d.contactoWhatsApp({
    whatsapp,
    web,
    marca,
    ref: p.id,
    etiqueta: T.whatsappEtiqueta,
    nota: T.whatsappNota,
  });
  d.parrafo(`${T.confidencial} ${T.referencia}: ${p.id}. ${T.pie}`);

  const prefijo = (config.pdf && config.pdf.nombreArchivo) || 'Cliente-Sinaptia';
  const nombre = `${prefijo}-${slug(p.contacto.empresa || p.contacto.nombre || 'cliente')}.pdf`;
  return { doc: d, nombre, proyecto: p };
}

/** Bytes del PDF (testable en Node). */
export function bytesBrief(opts) {
  return crearBrief(opts).doc.bytes();
}
