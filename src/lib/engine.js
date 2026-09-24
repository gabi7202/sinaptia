/**
 * engine.js — Motor conversacional del agente.
 *
 * Sin DOM y sin dependencias: recibe la skill y el contexto del visitante y
 * devuelve respuestas. Eso lo hace testeable en Node (ver test/engine.test.js)
 * y reutilizable si mañana quieres ponerlo en WhatsApp o en un backend.
 *
 * Flujo de etapas:
 *   saludo → sector → dolor → volumen(opc.) → contacto → propuesta → pdf
 *
 * Principios:
 *   · Una pregunta por turno.
 *   · Las correcciones de la skill se ANTEPONEN al complacer, y solo una vez cada una.
 *   · Los datos que el usuario suelta sin que los pidas se registran sin fricción.
 *   · Nada se inventa: si un campo falta, se pregunta; no se asume.
 */

  const RX_EMAIL = /[\w.+-]+@[\w-]+\.[\w.]{2,}/;
  const RX_TEL = /(?:\+?\d{1,3}[\s.-]?)?[679]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/;
  const RX_NUM = /(\d{1,3}(?:[.\s]\d{3})+|\d+)/;

  function plantilla(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }
  function primera(m, rx, i) { const r = String(m).match(rx); return r ? r[i || 1].trim() : null; }
  function crearAgente(skill, ctx) {
    ctx = ctx || {};
    const S = skill;
  const CU = (skill.cuerdas) || {};
  const RX_NOSE = CU.noSe || /(no s[eé]|ni idea|no tengo idea|no estoy segur)/i;
  const RX_SI = CU.si || /^(si|sí|s|ok|okay|dale|va|claro|perfecto|genial|hecho|vend[eí]a|me interesa)\b/i;
  const RX_NO = CU.no || /^(no|nop|nah|mejor no|despu[eé]s|luego)\b/i;
  const RX_PRECIO_PACK = CU.precio || /cu[áa]nto (cuesta|vale|ser[íi]a)|precio|tarifa|inversi[óo]n/i;
  const RETOMANDO = CU.retomando || 'Y retomando:';

  function esPregunta(t) { return /\?|¿|\bqu[eéi]\b|\bc[óo]mo\b|\bcu[áa]ndo\b|\bcu[áa]nto\b|\bpor qu[eé]\b|\bwhat\b|\bhow\b|\bwhy\b|\bwhen\b|\bquanto\b|\bcomo\b/i.test(t); }
  function esAfirmacionSi(t) { return RX_SI.test(t.trim()); }
  function esAfirmacionNo(t) { return RX_NO.test(t.trim()); }
  function esNoSe(t) { return RX_NOSE.test(t); }

    const lead = {
      sector: null, dolor: null, volumen: null,
      nombre: null, email: null, telefono: null, empresa: null,
      ciudad: ctx.ciudad || null, pais: ctx.pais || null,
      temp: ctx.temp != null ? ctx.temp : null, clima: ctx.clima || null,
      hora: ctx.hora || null, dispositivo: ctx.dispositivo || null,
    };
    const estado = {
      etapa: 'saludo',
      correcciones: [],          // { id, porque }
      vistos: {},                // correcciones ya aplicadas
      turno: 0,
      pdfOfrecido: false,
      iniciado: false,
    };

    function vars() {
      const t = S.saludo.tips[ctx.tipKey] || S.saludo.tips.nublado;
      return {
        saludo: ctx.saludo || 'Hola', ciudad: ctx.ciudad || 'tu ciudad',
        temp: ctx.temp != null ? ctx.temp : '—', clima: ctx.clima || 'cielo variable',
        hora: ctx.hora || '—', tip: t, nombre: S.identidad.nombre,
        empresa: S.identidad.empresa, nombreUsuario: lead.nombre || '',
        empresaUsuario: lead.empresa || '', sector: lead.sector || '', dolor: lead.dolor || '',
      };
    }

    function aplicarCorreccion(texto) {
      for (const c of S.correcciones) {
        if (estado.vistos[c.id]) continue;
        if (c.cuando.some((rx) => rx.test(texto))) {
          estado.vistos[c.id] = true;
          estado.correcciones.push({ id: c.id, porque: c.porque });
          return c;
        }
      }
      return null;
    }

    function preguntaPendiente() {
      const pasos = S.descubrimiento;
      if (estado.etapa === 'sector') return pasos[0];
      if (estado.etapa === 'dolor') return pasos[1];
      if (estado.etapa === 'volumen') return pasos[2];
      if (estado.etapa === 'contacto') return pasos[3];
      return null;
    }

    function extraerContacto(texto) {
      const partes = String(texto).split(/[,;|]/).map((x) => x.trim()).filter(Boolean);
      for (const p of partes) {
        const em = p.match(RX_EMAIL);
        if (em && !lead.email) { lead.email = em[0]; continue; }
        if (/^\+?[\d\s.-]{9,}$/.test(p) && !lead.telefono) { lead.telefono = p; continue; }
        const cap = p.match(/^(?:me llamo|soy|mi nombre es)\s+(.+)$/i);
        if (cap && !lead.nombre) { lead.nombre = cap[1].replace(RX_EMAIL, '').trim(); continue; }
        if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2}$/.test(p) && !lead.nombre && !lead.empresa) {
          lead.nombre = p; continue;
        }
        if (!lead.empresa && p.length > 2 && !RX_EMAIL.test(p)) lead.empresa = p;
      }
      // nombre suelto en frase larga
      if (!lead.nombre) {
        const n = primera(texto, /(?:me llamo|mi nombre es|soy)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,2})/);
        if (n) lead.nombre = n;
      }
      if (!lead.email) { const e = texto.match(RX_EMAIL); if (e) lead.email = e[0]; }
      if (!lead.telefono) { const t2 = texto.match(RX_TEL); if (t2 && /\d{9}/.test(t2[0].replace(/\D/g, ''))) lead.telefono = t2[0]; }
    }

    function faltaContacto() {
      const f = [];
      if (!lead.nombre) f.push('tu nombre');
      if (!lead.email) f.push('tu email');
      if (!lead.empresa) f.push('el nombre de tu empresa');
      return f;
    }

    function elegirPropuesta() {
      const texto = (lead.dolor || '') + ' ' + (lead.sector || '');
      for (const r of S.propuestas.reglas) if (r.cuando.test(texto)) return r;
      return S.propuestas.porDefecto;
    }

    function presentarPropuesta() {
      const p = elegirPropuesta();
      estado.propuesta = p;
      const v = vars();
      v.titulo = p.titulo; v.que = p.que; v.fases = p.fases;
      v.inversion = p.inversion; v.no = p.no;
      return plantilla(S.cierre.presentar, v) + '\n\n' + S.cierre.ofrecerPdf;
    }

    // ── API ────────────────────────────────────────────────────
    const agente = {
      get estado() { return estado; },
      get lead() { return lead; },

      iniciar() {
        estado.iniciado = true;
        estado.etapa = 'sector';
        return plantilla(S.saludo.plantilla, vars());
      },

      responder(texto) {
        const corrAntes = estado.correcciones.length;
        const etapaAntes = estado.etapa;
        const r = this._turno(texto);
        const corrNueva = estado.correcciones.length > corrAntes
          ? estado.correcciones[estado.correcciones.length - 1] : null;
        const pend = preguntaPendiente();
        // Guion estructurado: la única fuente de verdad que recibe el LLM.
        r.guion = {
          idioma: skill.codigo || 'es',
          etapa: etapaAntes,
          etapaNueva: estado.etapa,
          intencion: corrNueva ? ('pedido mal planteado: ' + corrNueva.id)
            : estado.etapa !== etapaAntes ? 'avance del diagnostico'
            : 'pregunta o comentario libre',
          correccion: corrNueva ? { id: corrNueva.id, decir: corrNueva.decir, retoma: corrNueva.retoma } : null,
          propuesta: estado.propuesta ? {
            titulo: estado.propuesta.titulo, inversion: estado.propuesta.inversion,
            no: estado.propuesta.no, fases: estado.propuesta.fases,
          } : null,
          siguiente: pend ? pend.pregunta : null,
          lead: {
            sector: lead.sector, dolor: lead.dolor, volumen: lead.volumen,
            nombre: lead.nombre, email: lead.email, empresa: lead.empresa,
          },
        };
        return r;
      },

      _turno(texto) {
        texto = String(texto || '').trim();
        estado.turno++;
        const acciones = [];

        // Datos que llegan sin pedirlos: se registran siempre, en cualquier etapa
        if (RX_EMAIL.test(texto)) extraerContacto(texto);

        // 1 · Correcciones primero (una vez cada una)
        const corr = aplicarCorreccion(texto);

        // 2 · Etapa de cierre: ofrecer/confirmar PDF
        if (estado.etapa === 'pdf_ofrecido') {
          if (esAfirmacionSi(texto)) {
            estado.etapa = 'pdf_listo';
            acciones.push({ tipo: 'generar_pdf' });
            return { texto: plantilla(S.cierre.despedidaPdf, vars()), etapa: estado.etapa, lead, acciones, listoParaPdf: true };
          }
          if (esAfirmacionNo(texto)) {
            estado.etapa = 'fin';
            return { texto: plantilla(S.cierre.despedidaNo, vars()), etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          // ambiguo: re-ofrece
          return { texto: S.cierre.ofrecerPdf, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
        }
        if (estado.etapa === 'propuesta') {
          // puede preguntar algo libre antes de decidir
          const kb = (S.conocimiento || []).find((k) => k.cuando.some((rx) => rx.test(texto)));
          if (kb && esPregunta(texto)) {
            estado.etapa = 'pdf_ofrecido';
            return { texto: kb.decir + '\n\n' + S.cierre.ofrecerPdf, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          if (esAfirmacionSi(texto) || /pdf|brief|documento|s[ií], (dame|genera|quiero)/i.test(texto)) {
            estado.etapa = 'pdf_listo'; acciones.push({ tipo: 'generar_pdf' });
            return { texto: plantilla(S.cierre.despedidaPdf, vars()), etapa: estado.etapa, lead, acciones, listoParaPdf: true };
          }
          if (esAfirmacionNo(texto)) {
            estado.etapa = 'fin';
            return { texto: plantilla(S.cierre.despedidaNo, vars()), etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          estado.etapa = 'pdf_ofrecido';
          return { texto: S.cierre.ofrecerPdf, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
        }

        // 2b · Si saltó una corrección, el turno es PARA corregir: no se consume
        //      como respuesta de la etapa (si no, "automatizar todo" quedaría
        //      registrado como "dolor"). Se corrige y se retoma la pregunta.
        if (corr) {
          const pend = preguntaPendiente();
          const retoma = corr.retoma || (pend ? pend.pregunta : '');
          return { texto: corr.decir + (retoma ? '\n\n' + retoma : ''), etapa: estado.etapa, lead, acciones, listoParaPdf: false };
        }

        // 2c · Precio: nunca un menú. Si no conocemos el caso, pedimos los dos datos;
        //      si lo conocemos, damos el rango orientado a esa situación.
        if (RX_PRECIO_PACK.test(texto) && esPregunta(texto) &&
            ['sector', 'dolor', 'volumen'].includes(estado.etapa)) {
          if (!lead.sector || !lead.dolor) {
            const falta = !lead.sector
              ? '¿a qué se dedica tu empresa?'
              : '¿qué proceso te quita más tiempo o más dinero hoy?';
            return {
              texto: 'Te doy un número honesto y no un menú de precios, pero para eso necesito ' +
                     'conocer tu caso: ' + falta,
              etapa: estado.etapa, lead, acciones, listoParaPdf: false,
            };
          }
          const P = elegirPropuesta();
          return {
            texto: 'Por lo que me contaste —' + lead.dolor.slice(0, 90) + '— lo nuestro sería ' +
                   P.titulo.toLowerCase() + '. La inversión para algo así va de ' + P.inversion +
                   ', y el número cerrado sale de revisar tu proceso, no de una lista.\n\n' +
                   '¿Seguimos con tus datos para dejarte el brief completo?',
            etapa: estado.etapa, lead, acciones, listoParaPdf: false,
          };
        }

        // 3 · Preguntas libres con respuesta en conocimiento
        const kb = (S.conocimiento || []).find((k) => k.cuando.some((rx) => rx.test(texto)));
        if (kb && esPregunta(texto) && estado.etapa !== 'contacto') {
          const pend = preguntaPendiente();
          const extra = corr ? corr.decir + '\n\n' : '';
          return {
            texto: extra + kb.decir + (pend ? '\n\n' + RETOMANDO + ' ' + pend.pregunta.toLowerCase() : ''),
            etapa: estado.etapa, lead, acciones, listoParaPdf: false,
          };
        }

        // 4 · Lógica de etapa
        switch (estado.etapa) {
          case 'sector': {
            const cap = primera(texto, S.descubrimiento[0].capturar) || (texto.length > 3 ? texto : null);
            if (cap) {
              lead.sector = cap.replace(/[.¡!]+$/, '').slice(0, 80);
              estado.etapa = 'dolor';
              const pre = corr ? corr.decir + '\n\n' : '';
              return { texto: pre + 'Anotado: ' + lead.sector + '. ' + S.descubrimiento[1].pregunta, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
            }
            return { texto: S.descubrimiento[0].pregunta + ' ' + S.descubrimiento[0].ayuda, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          case 'dolor': {
            if (texto.length >= 4) {
              lead.dolor = texto.replace(/[.¡!]+$/, '').slice(0, 220);
              estado.etapa = 'volumen';
              const pre = corr ? corr.decir + '\n\n' : '';
              return { texto: pre + 'Ese duele, sí. ' + S.descubrimiento[2].pregunta + ' (' + S.descubrimiento[2].ayuda + ')', etapa: estado.etapa, lead, acciones, listoParaPdf: false };
            }
            return { texto: S.descubrimiento[1].pregunta, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          case 'volumen': {
            if (esNoSe(texto)) { lead.volumen = 'sin dato'; }
            else {
              const n = primera(texto, RX_NUM);
              if (n) lead.volumen = String(parseInt(n.replace(/[.\s]/g, ''), 10));
            }
            if (lead.volumen) {
              estado.etapa = 'contacto';
              const pre = corr ? corr.decir + '\n\n' : '';
              return { texto: pre + S.descubrimiento[3].pregunta + ' ' + S.descubrimiento[3].ayuda, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
            }
            estado.etapa = 'contacto';
            return { texto: S.descubrimiento[3].pregunta + ' ' + S.descubrimiento[3].ayuda, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          case 'contacto': {
            extraerContacto(texto);
            const f = faltaContacto();
            if (f.length) {
              const pre = corr ? corr.decir + '\n\n' : '';
              return { texto: pre + 'Voy teniendo: ' + resumenContacto() + '. Me falta ' + f.join(' y ') + '.', etapa: estado.etapa, lead, acciones, listoParaPdf: false };
            }
            estado.etapa = 'propuesta';
            const pre = corr ? corr.decir + '\n\n' : '';
            return { texto: pre + presentarPropuesta(), etapa: estado.etapa, lead, acciones, listoParaPdf: false };
          }
          default:
            return { texto: S.descubrimiento[0].pregunta, etapa: estado.etapa, lead, acciones, listoParaPdf: false };
        }
      },
    };

    /**
     * precargar(perfil) — Trae lo que ya sabemos del cliente desde la memoria.
     * No es un adorno: mueve la etapa al primer dato que FALTA de verdad, para
     * que nadie vuelva a escuchar "¿a qué se dedica tu empresa?" cuando ya lo
     * dijimos la semana pasada.
     */
    agente.precargar = function (perfil) {
      if (!perfil) return agente;
      if (perfil.nombre) lead.nombre = perfil.nombre;
      if (perfil.empresa) lead.empresa = perfil.empresa;
      if (perfil.negocio || perfil.sector) lead.sector = perfil.negocio || perfil.sector;
      if (perfil.necesidad || perfil.dolor) lead.dolor = perfil.necesidad || perfil.dolor;
      if (perfil.volumen) lead.volumen = perfil.volumen;
      estado.etapa = !lead.sector ? 'sector' : !lead.dolor ? 'dolor' : !lead.volumen ? 'volumen' : 'contacto';
      estado.iniciado = true;
      return agente;
    };

    function resumenContacto() {
      const t = [];
      if (lead.nombre) t.push('nombre ' + lead.nombre);
      if (lead.email) t.push('email ' + lead.email);
      if (lead.empresa) t.push('empresa ' + lead.empresa);
      return t.length ? t.join(', ') : 'nada aún';
    }

    return agente;
  }

export { crearAgente };
