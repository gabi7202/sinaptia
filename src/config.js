/**
 * config.js — Lo único que editas para personalizar el sitio.
 */
export const CONFIG = {
  marca: {
    nombre: 'SINAPTIA',
    agente: 'Nexa',
    tagline: 'IA que entra en operación',
    email: 'hola@sinaptialabs.com',
    web: 'sinaptialabs.com',
    agenda: 'https://cal.com/tu-usuario/descubrimiento',
  },
  ciudadRespaldo: 'Bogotá',
  // URL pública real (necesaria para que el QR apunte a tu dominio):
  urlPublica: 'https://sinaptia.vercel.app',   // dominio de producción (canonical, og:url, QR)
  // Automatización de prospectos: POST JSON con el lead completo cuando acepta el PDF.
  // null = solo localStorage + PDF.
  webhookUrl: null,
  pdf: {
    nombreArchivo: 'brief-implementacion-ia',
    pie: 'Documento generado automáticamente por el agente de diagnóstico de Sinaptia.',
  },
  voz: {
    lang: 'es-ES',
    genero: 'femenina',    // decisión de marca: Nexa habla con voz femenina. 'femenina' | 'masculina' | 'auto'
    prefVoz: '',           // ej: 'es-MX' para forzar acento; vacío = la mejor voz femenina 'es' disponible
    autoEscucha: true,     // bucle de conversación: la IA habla y vuelve a escuchar
    velocidad: 1.04,
    tono: 1,
  },
  // Base de datos: todo queda en JSON en el navegador y, si conectas un remoto,
  // se sincroniza en lotes. Supabase: {url, key, tabla}. Genérico: url de POST.
  bd: { url: '', supabase: null },

  // IA real como cerebro. endpoint = URL de tu proxy (infra/worker-ia.js).
  // Sin endpoint, el agente sigue vivo con el motor determinista: degrada, no se rompe.
  //
  // voz = backend completo de conversación (fusión A+B): Grok (xAI) en streaming +
  // memoria de clientes en Supabase + resumen automático a lead. Rutas en
  // api/voz/* (solo Vercel; ver DEPLOY.md §6). En '/voz' activa el paso de
  // consentimiento y la memoria en servidor. Vacío = todo local, como siempre.
  ia: { endpoint: '', voz: '' },   // ej. voz: '/api/voz' desplegado en Vercel con las claves

  ui: { abrirAgenteSolo: false, efectoEscritura: true },
};
