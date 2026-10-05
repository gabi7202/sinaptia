/**
 * faq.js — Las preguntas frecuentes en un solo lugar.
 *
 * Se usan DOS veces y tienen que decir exactamente lo mismo:
 *   1. la sección visible de la home (components/Faq.astro)
 *   2. el JSON-LD `FAQPage` que le damos a Google y a los motores generativos
 *
 * Google solo marca como válidas las FAQ cuyo texto estructurado coincide con el
 * texto visible, así que nada de copias paralelas: una fuente, dos salidas.
 *
 * Reglas de marca que aplican aquí: cero plazos prometidos, lenguaje sencillo y
 * respuestas que se puedan citar tal cual. Voz en primera persona del singular:
 * SINAPTIA es una persona, y el copy no puede describir a un equipo (ver checklist
 * de correcciones P0-5: ni "nosotros" ni verbos en plural).
 */
export const FAQ = [
  {
    q: '¿Necesito tener un equipo técnico para trabajar contigo?',
    a: 'No. Esa es precisamente la razón por la que existe esto. Me encargo yo de todo el ciclo: diagnóstico, diseño, construcción, despliegue, capacitación de tu equipo y mantenimiento. Tú necesitas un decisor que conozca bien la operación y alguien que me dé acceso a los sistemas. Nada más.',
    abierta: true,
  },
  {
    q: 'La IA se equivoca. ¿Cómo evitas un problema con mis clientes?',
    a: 'No la dejo suelta. Todo lo que construyo incluye validaciones de salida, revisión humana en los puntos críticos que definimos juntos, registro completo de cada decisión y pruebas con tus datos reales antes de ir a producción. El error no se elimina: se acota, se mide y se corrige rápido.',
  },
  {
    q: '¿Qué pasa con la confidencialidad de mis datos?',
    a: 'Firmo NDA y acuerdo de tratamiento de datos antes de comenzar. Uso modelos que no entrenan con tu información y, si tu sector lo requiere, despliego en tu propia infraestructura o con modelos de pesos abiertos. Nunca envío datos personales a una API sin base legal para hacerlo.',
  },
  {
    q: '¿Cuánto tarda y cuánto cuesta un proyecto típico?',
    a: 'El diagnóstico con piloto es la primera fase y tiene un número cerrado publicado en la sección de situaciones: USD 1,200. El resto depende de tu operación: el alcance y el ritmo salen de revisarla juntos. Antes de empezar recibes un presupuesto cerrado por escrito, con alcance y excluidos explícitos: sin sorpresas.',
  },
  {
    q: 'Ya intenté con IA y no funcionó. ¿Por qué sería distinto?',
    a: 'Porque en la mayoría de los casos el problema no fue la tecnología: fue automatizar un proceso que antes había que rediseñar, o arrancar por el proceso equivocado. Por eso empiezo con un diagnóstico serio antes de escribir una línea de código, y por eso el primer entregable incluye algo funcionando en producción.',
  },
  {
    q: '¿Trabajas con empresas de mi país y en mi moneda?',
    a: 'Trabajo 100% en remoto con clientes en Europa y América. Facturo en la moneda que tu entidad use (MXN, USD o EUR) y acepto transferencia internacional, Wise, PayPal y tarjeta. Las reuniones son en tu zona horaria y en tu idioma.',
  },
  {
    q: '¿Y si después quiero cambios o el sistema necesita mantenimiento?',
    a: 'Por eso existe la operación continua. Todo proyecto se entrega con documentación, runbooks y capacitación. Un sistema de IA sin mantenimiento se degrada: los modelos cambian, tus procesos cambian y tus clientes cambian. Prefiero decirlo desde el principio.',
  },
  {
    q: '¿Cumples con la regulación europea de IA?',
    a: 'Sí. Clasifico por escrito el nivel de riesgo de cada sistema que entrego e incluyo documentación de gobernanza y registro de decisiones como entregable estándar — algo que tus clientes grandes ya empiezan a exigir en licitaciones. Sigo el calendario de aplicación de la EU AI Act y de GDPR.',
  },
];

/** Bloque `FAQPage` para JSON-LD. Mismo texto que el visible, sin inventar nada. */
export function faqJsonLd(origen) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': (origen || '/') + '#faq',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}
