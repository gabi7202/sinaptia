// Se usa en servidor Y cliente. Para agregar un idioma, copia un bloque y cambia los textos.
export const BRAND = 'Tu Empresa';

export const LANGS = {
  es: {
    label: 'Español', speech: 'es-MX', name: 'español',
    hello: `Hola, soy el asistente de ${BRAND}. Cuéntame, ¿qué negocio tienes y en qué te puedo ayudar?`,
    back: (n: string, b?: string | null) => `¡Hola de nuevo, ${n}! ¿Seguimos con lo de ${b || 'tu negocio'}?`,
    ui: {
      start: 'Empezar', consent: 'Acepto que mi conversación (voz y texto) se procese y se guarde para mejorar el servicio.',
      idle: 'Toca el micrófono', listening: 'Te escucho…', thinking: 'Pensando…', speaking: 'Hablando…',
      type: 'O escribe aquí', send: 'Enviar', handsfree: 'Manos libres',
      err: 'Algo falló. Intenta de nuevo o escribe tu mensaje.', limit: 'Llegaste al límite por ahora. Vuelve en un rato.',
      inapp: 'Abre esta página en Chrome o Safari para usar tu voz. Mientras tanto puedes escribir.',
      nomic: 'No pude usar el micrófono. Puedes escribir tu mensaje.',
    },
  },
  en: {
    label: 'English', speech: 'en-US', name: 'English',
    hello: `Hi, I'm the ${BRAND} assistant. Tell me, what business do you run and how can I help?`,
    back: (n: string, b?: string | null) => `Welcome back, ${n}! Shall we continue with ${b || 'your business'}?`,
    ui: {
      start: 'Start', consent: 'I agree that my conversation (voice and text) is processed and stored to improve the service.',
      idle: 'Tap the microphone', listening: "I'm listening…", thinking: 'Thinking…', speaking: 'Speaking…',
      type: 'Or type here', send: 'Send', handsfree: 'Hands-free',
      err: 'Something went wrong. Try again or type your message.', limit: "You've reached the limit for now. Come back later.",
      inapp: 'Open this page in Chrome or Safari to use your voice. Meanwhile, you can type.',
      nomic: "I couldn't use the microphone. You can type your message.",
    },
  },
  pt: {
    label: 'Português', speech: 'pt-BR', name: 'português',
    hello: `Olá, sou o assistente da ${BRAND}. Conte-me, qual é o seu negócio e como posso ajudar?`,
    back: (n: string, b?: string | null) => `Olá de novo, ${n}! Vamos continuar com ${b || 'o seu negócio'}?`,
    ui: {
      start: 'Começar', consent: 'Aceito que minha conversa (voz e texto) seja processada e guardada para melhorar o serviço.',
      idle: 'Toque no microfone', listening: 'Estou ouvindo…', thinking: 'Pensando…', speaking: 'Falando…',
      type: 'Ou digite aqui', send: 'Enviar', handsfree: 'Mãos livres',
      err: 'Algo falhou. Tente de novo ou digite sua mensagem.', limit: 'Você atingiu o limite por agora. Volte mais tarde.',
      inapp: 'Abra esta página no Chrome ou Safari para usar sua voz. Enquanto isso, você pode digitar.',
      nomic: 'Não consegui usar o microfone. Você pode digitar sua mensagem.',
    },
  },
} as const;

export type LangKey = keyof typeof LANGS;
