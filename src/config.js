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
  urlPublica: '',   // ej: 'https://tu-usuario.github.io/sinaptia/'
  // Automatización de prospectos: POST JSON con el lead completo cuando acepta el PDF.
  // null = solo localStorage + PDF.
  webhookUrl: null,
  pdf: {
    nombreArchivo: 'brief-implementacion-ia',
    pie: 'Documento generado automáticamente por el agente de diagnóstico de Sinaptia.',
  },
  voz: {
    lang: 'es-ES',          // o 'es-MX', 'es-AR'… cambia también la voz elegida
    autoEscucha: true,      // bucle de conversación: la IA habla y vuelve a escuchar
    prefVoz: '',            // ej: 'es-MX' para forzar acento; vacío = la mejor 'es' disponible
    velocidad: 1.04,
    tono: 1,
  },
  // Base de datos: todo queda en JSON en el navegador y, si conectas un remoto,
  // se sincroniza en lotes. Supabase: {url, key, tabla}. Genérico: url de POST.
  bd: { url: '', supabase: null },

  // IA real como cerebro. endpoint = URL de tu proxy (infra/worker-ia.js).
  // Sin endpoint, el agente sigue vivo con el motor determinista: degrada, no se rompe.
  ia: { endpoint: '' },

  ui: { abrirAgenteSolo: false, efectoEscritura: true },
};
