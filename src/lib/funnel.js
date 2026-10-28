/**
 * funnel.js — Analítica de embudo sin cookies ni consentimiento.
 *
 * No rastrea personas: cuenta eventos de embudo, una vez por sesión, sin cookies,
 * sin píxeles de terceros y sin datos personales. Los eventos viven en la BD
 * local (localStorage) y viajan al remoto configurado (webhook/Supabase) con el
 * resto de registros, así que el embudo real se agrega en tu backend, no aquí.
 *
 * Pasos del embudo:
 *   visita → calculadora → calculadora_cta → lead → llamada
 *   (+ invitacion mostrada como paso intermedio opcional)
 *
 * Por qué sin cookies: no identifican al visitante entre sesiones, así que no hay
 * perfilado que consentir. Es analítica de producto, no de persona.
 */

export const PASOS = ['visita', 'calculadora', 'calculadora_cta', 'lead', 'llamada'];

const CLAVE_SESION = 'sinaptia:visita';

export class Funnel {
  constructor(bd) {
    this.bd = bd;
  }

  /** Marca un paso. 'visita' solo cuenta una vez por sesión. */
  marcar(paso, extra = {}) {
    if (paso === 'visita') {
      try {
        if (sessionStorage.getItem(CLAVE_SESION)) return null;
        sessionStorage.setItem(CLAVE_SESION, '1');
      } catch (e) { /* sin sessionStorage: cuenta igual, sin dedupe */ }
    }
    return this.bd.registrar('funnel:' + paso, { paso, ...extra });
  }

  /** Recuento por paso desde los registros locales. */
  recuento() {
    const out = {};
    for (const p of PASOS) out[p] = this.bd.porEvento('funnel:' + p).length;
    out.invitacion = this.bd.porEvento('funnel:invitacion').length;
    return out;
  }

  /** Tasas de conversión entre pasos consecutivos. */
  tasas() {
    const c = this.recuento();
    const tasas = [];
    for (let i = 1; i < PASOS.length; i++) {
      const prev = c[PASOS[i - 1]];
      tasas.push({
        de: PASOS[i - 1],
        a: PASOS[i],
        tasa: prev ? c[PASOS[i]] / prev : 0,
      });
    }
    return tasas;
  }

  /** Línea resumen para el panel: visitas → llamadas y tasa global. */
  resumen() {
    const c = this.recuento();
    return {
      ...c,
      tasaGlobal: c.visita ? c.llamada / c.visita : 0,
      pendientes: this.bd.pendiente,
    };
  }
}
