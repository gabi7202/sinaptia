/**
 * config.js — Lo único que editas para personalizar el sitio.
 *
 * Las variables PUBLIC_* se pueden pasar en el build (Vercel → Environment
 * Variables o `PUBLIC_IA_VOZ=/api/voz npm run build`) sin tocar el código.
 */
const ENV = (import.meta && import.meta.env) || {};

export const CONFIG = {
  marca: {
    nombre: 'SINAPTIA',
    agente: 'Nexa',
    tagline: 'IA que entra en operación',
    // El correo NO se publica: el contacto público es WhatsApp. El email privado
    // del dueño vive solo en Vercel (LEAD_EMAIL) y nunca entra al bundle.
    persona: ENV.PUBLIC_FUNDADOR || 'Rafael Ortiz',
    whatsapp: '+52 983 406 6176',
    whatsappNumero: '529834066176',
    whatsappUrl: 'https://wa.me/529834066176',
    web: 'sinaptialabs.com',
    agenda: 'https://cal.com/tu-usuario/descubrimiento',
  },
  ciudadRespaldo: 'Bogotá',
  // Idioma por defecto: vacío = detecta navigator.language (en/pt/es).
  idiomaPorDefecto: ENV.PUBLIC_IDIOMA || '',
  // URL pública real (necesaria para que el QR apunte a tu dominio):
  urlPublica: '',   // ej: 'https://tu-usuario.github.io/sinaptia/'
  // Automatización de prospectos: POST JSON con el lead completo cuando acepta el PDF.
  // null = solo localStorage + PDF.
  webhookUrl: null,
  pdf: {
    nombreArchivo: 'Cliente-Sinaptia',
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
  // Memoria TEMPORAL del hilo en el navegador. Groq no guarda estado: esto es
  // lo que evita que pierda el hilo si el cliente recarga o bloquea el móvil.
  // Se borra sola a las N horas del último turno y el visitante puede borrarla.
  memoria: { horas: 12, maxTurnos: 40 },
  // Copia del proyecto al dueño: el PDF se descarga en el navegador y esta ruta
  // intenta enviarlo por email/webhook/Supabase. Si falla, queda mailto + Web Share.
  proyecto: {
    endpoint: ENV.PUBLIC_PROYECTO_ENDPOINT === 'off' ? '' : (ENV.PUBLIC_PROYECTO_ENDPOINT || '/api/proyecto'),
    autoEnviar: ENV.PUBLIC_PROYECTO_AUTO !== '0',
    enviarPdf: true,
  },
  // Base de datos: todo queda en JSON en el navegador y, si conectas un remoto,
  // se sincroniza en lotes. Supabase: {url, key, tabla}. Genérico: url de POST.
  bd: { url: '', supabase: null },

  // IA real como cerebro. endpoint = URL de tu proxy (api/ia.js o worker-ia.js).
  // Por defecto /api/ia: en Vercel funciona con solo GROQ_API_KEY; en GitHub
  // Pages devuelve 404 y el motor determinista sigue atendiendo.
  //
  // voz = backend completo de conversación con streaming + Supabase. Vacío =
  // /voz usa /api/ia (Groq sin streaming) o el motor local. Para activar el
  // streaming con memoria de servidor: PUBLIC_IA_VOZ=/api/voz en el build.
  ia: {
    // PUBLIC_IA_ENDPOINT=off deja el sitio 100% local (GitHub Pages sin proxy).
    endpoint: ENV.PUBLIC_IA_ENDPOINT === 'off' ? '' : (ENV.PUBLIC_IA_ENDPOINT || '/api/ia'),
    voz: ENV.PUBLIC_IA_VOZ || '',
    timeoutMs: Number(ENV.PUBLIC_IA_TIMEOUT_MS) || 12000,
  },

  ui: { abrirAgenteSolo: false, efectoEscritura: true },
};
