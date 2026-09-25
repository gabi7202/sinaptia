/**
 * langs.js — Textos del agente en servidor (ES/EN/PT).
 *
 * Fusión A+B: la marca deja de ser el placeholder 'Tu Empresa' de la
 * implementación B y pasa a ser Sinaptia/Nexa (decisión de marca de A).
 * Los locales de voz (es-MX/en-US/pt-BR) vienen de B y los conserva A.
 *
 * Solo se usa en servidor: el saludo y el recall los genera el backend y el
 * cliente los habla tal cual. Los textos de UI del cliente viven en i18n.js.
 */

export const MARCA = 'Sinaptia';
export const AGENTE = 'Nexa';
/** La humana detrás de la marca: el agente la nombra en los guiones aprobados
 *  (consultoría, descuentos, viabilidad). Cambia aquí y cambia en todo el prompt. */
export const HUMANO = 'Gabi';

export const LANGS = {
  es: {
    label: 'Español', speech: 'es-MX', name: 'español',
    hello: `Hola, soy ${AGENTE}, la asistente de voz de ${MARCA}. Cuéntame, ¿qué negocio tienes y en qué te puedo ayudar?`,
    back: (n, b) => `¡Hola de nuevo, ${n}! ¿Seguimos con lo de ${b || 'tu negocio'}?`,
  },
  en: {
    label: 'English', speech: 'en-US', name: 'English',
    hello: `Hi, I'm ${AGENTE}, the voice assistant of ${MARCA}. Tell me, what business do you run and how can I help?`,
    back: (n, b) => `Welcome back, ${n}! Shall we continue with ${b || 'your business'}?`,
  },
  pt: {
    label: 'Português', speech: 'pt-BR', name: 'português',
    hello: `Olá, sou a ${AGENTE}, a assistente de voz da ${MARCA}. Conte-me, qual é o seu negócio e como posso ajudar?`,
    back: (n, b) => `Olá de novo, ${n}! Vamos continuar com ${b || 'o seu negócio'}?`,
  },
};

export const CONSENT_VERSION = 'v1';
