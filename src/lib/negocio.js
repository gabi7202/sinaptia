/**
 * negocio.js — Automatización de voz adaptable a cualquier negocio.
 *
 * La misma capa de voz (escuchar → detectar → analizar → responder) sirve para
 * cualquier negocio cambiando UN objeto de perfil: nombre, saludo, servicios,
 * preguntas frecuentes, regla de cita y regla de derivación a humano.
 *
 * Por qué así y no un prompt gigante: un perfil declarativo es auditable,
 * testeable y no alucina. Cada respuesta sale de datos del negocio, nunca de la
 * imaginación de un modelo. Cuando conectes un LLM (infra/worker-ia.js), el perfil
 * sigue siendo la fuente de verdad y el modelo solo pone el lenguaje.
 *
 * Para adaptar un negocio nuevo: copia un perfil, cambia sus datos, y listo.
 */

export const PERFILES = {
  clinica: {
    id: 'clinica',
    nombre: 'Clínica Dental Sonrisa',
    sector: 'salud',
    saludo: 'Hola, soy el asistente de Clínica Dental Sonrisa. Dime qué necesitas: agendar una cita, cambiarla, o saber horarios y precios.',
    servicios: [
      { cuando: /limpieza|profilaxis|higiene/i, desc: 'La limpieza dental dura 40 minutos e incluye revisión completa. Sin dolor y sin cita previa larga: suelo tener huecos libres.' },
      { cuando: /blanqueamiento|estetica|estética/i, desc: 'El blanqueamiento es una sesión de 90 minutos con resultado desde el primer día. Incluye control a la semana.' },
      { cuando: /ortodoncia|brackets|brackets|alinead/i, desc: 'La ortodoncia empieza con un estudio de 30 minutos con radiografía y plan de tratamiento escrito, sin compromiso.' },
    ],
    faq: [
      { cuando: /horario|abren|cierran|s[áa]bado/i, a: 'Abrimos de lunes a viernes de 9 a 19 y sábados de 9 a 14. Los domingos cerramos, pero el asistente sigue atendiendo y dejando citas para el lunes.' },
      { cuando: /precio|costo|cu[áa]nto (cuesta|vale|cobran)/i, a: 'La valoración inicial es sin costo. Una limpieza son 60 USD, un blanqueamiento 180 y el estudio de ortodoncia 45. Todo se confirma por escrito antes de empezar.' },
      { cuando: /seguro|aseguradora|cobertura/i, a: 'Trabajamos con las principales aseguradoras. Trae tu credencial y verificamos cobertura antes de citar, para que no haya sorpresas en el mostrador.' },
    ],
    cita: {
      cuando: /agendar|cita|reservar|apartar/i,
      a: 'Puedo agendarte ahora mismo: dime qué día y hora te vienen bien y te lo confirmo en esta misma conversación.',
    },
    humano: {
      cuando: /emergencia|dolor fuerte|urgencia|sangr|golpe|accidente/i,
      a: 'Esto necesita atención de una persona ya. Te paso con el equipo de urgencias ahora mismo; no cuelgues.',
    },
    fuera: 'Eso lo revisa mejor alguien del equipo en persona. Te dejo con una persona para que te ayude con eso, sin que tengas que repetir nada.',
  },

  taller: {
    id: 'taller',
    nombre: 'Taller Mecánico El Pistón',
    sector: 'automotriz',
    saludo: 'Hola, soy el asistente de Taller Mecánico El Pistón. Dime qué le pasa a tu carro o qué servicio necesitas, y te digo si hay cupo hoy.',
    servicios: [
      { cuando: /aceite|cambio de aceite|lubric/i, desc: 'El cambio de aceite toma 45 minutos con filtro incluido. Si llegas antes de las 4, sales el mismo día.' },
      { cuando: /freno|brake|pastilla/i, desc: 'El cambio de pastillas toma 2 horas por eje. Revisamos disco y líquido sin costo y te mostramos las piezas antes de cambiarlas.' },
      { cuando: /diagnost|falla|check|luz/i, desc: 'El diagnóstico con escáner toma 1 hora y te lo explicamos con la lectura en la mano, no con suposiciones.' },
    ],
    faq: [
      { cuando: /horario|abren|cierran/i, a: 'Lunes a viernes de 8 a 18 y sábados de 8 a 13. El carro puede quedarse en el patio cerrado si lo traes fuera de horario.' },
      { cuando: /precio|costo|cu[áa]nto|cotiz/i, a: 'Te doy un rango ahora y el número cerrado cuando el carro esté en el elevador: mano de obra de diagnóstico 40 USD, y toda pieza se aprueba contigo antes de montarla.' },
      { cuando: /garant|garant[ií]a/i, a: 'Toda pieza que montamos lleva 6 meses de garantía por escrito, y la mano de obra 3. Si algo vuelve a fallar, lo ves sin cita.' },
    ],
    cita: {
      cuando: /cupo|agendar|cita|reservar|traer|hoy/i,
      a: 'Dime marca, modelo y qué le pasa, y te aparto el cupo: si es antes de las 4, sale el mismo día.',
    },
    humano: {
      cuando: /accidente|grua|grúa|no arranca|humo|humo|huele a/i,
      a: 'Eso no lo toco por teléfono: te paso con el mecánico de guardia ahora, y si no arranca te mando la grúa nuestra.',
    },
    fuera: 'Eso lo ve mejor el mecánico con el carro enfrente. Te paso con alguien del equipo para que te dé el número cerrado.',
  },

  inmobiliaria: {
    id: 'inmobiliaria',
    nombre: 'Inmobiliaria Costa Norte',
    sector: 'inmobiliario',
    saludo: 'Hola, soy el asistente de Inmobiliaria Costa Norte. Dime qué buscas: comprar, alquilar o vender, y en qué zona.',
    servicios: [
      { cuando: /comprar|compra|busco (piso|casa|apartamento)/i, desc: 'Dime zona, presupuesto y habitaciones, y te mando ahora mismo las opciones reales que encajan, con fotos y precio. Sin listas infladas.' },
      { cuando: /alquilar|alquiler|renta/i, desc: 'Para alquiler necesito zona y renta máxima: te mando las disponibles hoy y agendamos visitas en bloque el mismo día.' },
      { cuando: /vender|venta|tasar|tasaci/i, desc: 'La valoración es en tu propiedad, con comparables de la zona y un número por escrito. Sin compromiso de exclusividad para empezar.' },
    ],
    faq: [
      { cuando: /horario|abren|cierran/i, a: 'Oficina de lunes a viernes de 9 a 19 y sábados de 10 a 14. Las visitas se agendan también fuera de horario, según la propiedad.' },
      { cuando: /comisi|comisi[oó]n|cu[áa]nto (cuesta|cobran)|precio del servicio/i, a: 'La comisión la paga quien vende y es un porcentaje cerrado que se firma por escrito antes de empezar. Quien compra no paga comisión de agencia.' },
      { cuando: /hipoteca|financ|cr[eé]dito/i, a: 'No somos banco, pero te conectamos con dos entidades que pre-aprueban en pocos días y te dicen el número máximo antes de visitar nada.' },
    ],
    cita: {
      cuando: /visita|visitar|agendar|ver (el|la|la propiedad)/i,
      a: 'Dime qué propiedad y qué día puedes, y te confirmo la visita con el asesor que tiene las llaves.',
    },
    humano: {
      cuando: /negoci|oferta|rebaj|contrato|firmar|legal/i,
      a: 'Negociación y firmas las lleva una persona, no yo. Te paso con el asesor de la propiedad ahora mismo.',
    },
    fuera: 'Eso lo responde mejor el asesor que conoce la propiedad. Te dejo con una persona para que te dé el dato exacto.',
  },
};

/**
 * Motor de un negocio: detectar → analizar → responder, todo desde el perfil.
 * Devuelve el mismo contrato que el agente principal ({texto, guion}) para que
 * la capa de voz no note la diferencia.
 */
export function motorNegocio(perfil) {
  return {
    perfil,
    saludo: perfil.saludo,
    responder(texto) {
      const t = String(texto);
      const guion = { negocio: perfil.id, sector: perfil.sector, intencion: null };

      if (perfil.humano.cuando.test(t)) {
        guion.intencion = 'urgencia: derivar a humano';
        return { texto: perfil.humano.a, guion, humano: true };
      }
      if (perfil.cita.cuando.test(t)) {
        guion.intencion = 'quiere agendar';
        return { texto: perfil.cita.a, guion };
      }
      const faq = perfil.faq.find((f) => f.cuando.test(t));
      if (faq) {
        guion.intencion = 'pregunta frecuente';
        return { texto: faq.a, guion };
      }
      const serv = perfil.servicios.find((sv) => sv.cuando.test(t));
      if (serv) {
        guion.intencion = 'interés en un servicio';
        return { texto: serv.desc + ' ' + perfil.cita.a, guion };
      }
      guion.intencion = 'fuera de alcance: derivar a humano';
      return { texto: perfil.fuera, guion, humano: true };
    },
  };
}

export function perfilPor(codigo) {
  return PERFILES[String(codigo).toLowerCase()] || null;
}
