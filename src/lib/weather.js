/**
 * weather.js — Geolocalización + clima real, sin API keys.
 *
 * Fuentes (ambas gratuitas, sin clave y con CORS abierto):
 *   · ipwho.is        → ciudad, país, lat/lon a partir de la IP
 *   · api.open-meteo  → temperatura, código de clima y zona horaria local
 *
 * Si cualquiera falla, degrada con elegancia a un contexto por defecto: el sitio
 * NUNCA se queda sin saludo. Mejor un saludo genérico que un saludo roto.
 */

  // Códigos WMO de Open-Meteo → descripción en español
  const CLIMA = {
    0: 'cielo despejado', 1: 'cielo mayormente despejado', 2: 'parcialmente nublado', 3: 'nublado',
    45: 'niebla', 48: 'niebla con escarcha',
    51: 'llovizna ligera', 53: 'llovizna', 55: 'llovizna intensa',
    56: 'llovizna helada', 57: 'llovizna helada intensa',
    61: 'lluvia ligera', 63: 'lluvia', 65: 'lluvia intensa',
    66: 'lluvia helada', 67: 'lluvia helada intensa',
    71: 'nevada ligera', 73: 'nevada', 75: 'nevada intensa', 77: 'granizo fino',
    80: 'chubascos ligeros', 81: 'chubascos', 82: 'chubascos fuertes',
    85: 'nevadas intermitentes', 86: 'nevadas fuertes',
    95: 'tormenta', 96: 'tormenta con granizo', 99: 'tormenta con granizo fuerte',
  };

  function descripcion(code) { return CLIMA[code] || 'cielo variable'; }

  // El "tip" humano que hace que el saludo se sienta inteligente y cercano
  function tip(temp, code, esDeNoche) {
    if (esDeNoche) return 'noche';
    if (code >= 95) return 'lluvia';
    if (code >= 51 && code <= 82) return 'lluvia';
    if (code === 45 || code === 48) return 'nublado';
    if (temp >= 27) return 'calor';
    if (temp <= 10) return 'frio';
    if (code <= 1) return 'despejado';
    return 'nublado';
  }

  async function conTimeout(prom, ms) {
    return Promise.race([
      prom,
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
    ]);
  }

  async function geoPorIP() {
    const intentos = [
      async () => {
        const r = await fetch('https://ipwho.is/');
        if (!r.ok) throw new Error('ipwhois ' + r.status);
        const j = await r.json();
        if (!j.success && j.success !== undefined) throw new Error('ipwhois sin éxito');
        return { ciudad: j.city, pais: j.country, lat: j.latitude, lon: j.longitude, fuente: 'ipwho.is' };
      },
      async () => {
        const r = await fetch('https://ipapi.co/json/');
        if (!r.ok) throw new Error('ipapi ' + r.status);
        const j = await r.json();
        return { ciudad: j.city, pais: j.country_name, lat: j.latitude, lon: j.longitude, fuente: 'ipapi.co' };
      },
    ];
    for (const fn of intentos) {
      try { return await conTimeout(fn(), 4000); } catch (e) { /* siguiente */ }
    }
    return null;
  }

  async function clima(lat, lon) {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon +
                '&current_weather=true&timezone=auto';
    const r = await conTimeout(fetch(url), 4000);
    if (!r.ok) throw new Error('open-meteo ' + r.status);
    const j = await r.json();
    const cw = j.current_weather || {};
    return {
      temp: Math.round(cw.temperature ?? 20),
      code: cw.weathercode ?? 2,
      viento: Math.round(cw.windspeed ?? 0),
      esDeDia: cw.is_day === 1,
      zonaHoraria: j.timezone || null,
      horaLocal: (j.current_weather && j.current_weather.time) ? j.current_weather.time.slice(11, 16) : null,
    };
  }

  function horaDe(zonaHoraria) {
    try {
      return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zonaHoraria }).format(new Date());
    } catch (e) {
      const d = new Date();
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    }
  }

  function saludoPor(hora) {
    const h = parseInt(String(hora).slice(0, 2), 10);
    if (h >= 5 && h < 12) return 'Buenos días';
    if (h >= 12 && h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function dispositivo() {
    const ua = navigator.userAgent || '';
    if (/Mobi|Android|iPhone/i.test(ua)) return 'móvil';
    if (/Tablet|iPad/i.test(ua)) return 'tablet';
    return 'escritorio';
  }

  /**
   * Contexto completo del visitante. Nunca rechaza: si algo falla, degrada.
   * @param {object} [forzado] valores por defecto de config (ciudad fallback)
   */
  async function cadena(forzado) {
    const base = {
      ciudad: (forzado && forzado.ciudad) || 'tu ciudad',
      pais: null, lat: null, lon: null,
      temp: 22, code: 2, clima: descripcion(2), viento: 0,
      zonaHoraria: null, hora: horaDe(null), saludo: saludoPor(horaDe(null)),
      esDeNoche: false, tipKey: 'nublado', dispositivo: dispositivo(),
      preciso: false, fuente: 'por defecto',
    };
    try {
      const g = await geoPorIP();
      if (g && g.ciudad) {
        base.ciudad = g.ciudad; base.pais = g.pais; base.lat = g.lat; base.lon = g.lon;
        base.fuente = g.fuente; base.preciso = true;
      }
      if (base.lat != null) {
        const c = await clima(base.lat, base.lon);
        base.temp = c.temp; base.code = c.code; base.clima = descripcion(c.code);
        base.viento = c.viento; base.zonaHoraria = c.zonaHoraria;
        base.hora = c.horaLocal || horaDe(c.zonaHoraria);
        base.esDeNoche = !c.esDeDia;
        base.fuente += ' + open-meteo';
      }
    } catch (e) { /* degrada silencioso */ }
    base.saludo = saludoPor(base.hora);
    base.esDeNoche = base.esDeNoche || parseInt(base.hora, 10) >= 20 || parseInt(base.hora, 10) < 5;
    base.tipKey = tip(base.temp, base.code, base.esDeNoche);
    return base;
  }

  /** Respaldo inmediato y sin red: si todo falla, el hero sigue teniendo cielo y ciudad. */
  function porRespaldo(forzado) {
    const nombre = (forzado && forzado.ciudad) || 'Bogotá';
    const hora = horaDe(null);
    return {
      ciudad: nombre, pais: null, lat: null, lon: null,
      temp: 22, code: 2, clima: descripcion(2), viento: 0,
      zonaHoraria: null, hora, saludo: saludoPor(hora),
      esDeNoche: parseInt(hora, 10) >= 20 || parseInt(hora, 10) < 5,
      tipKey: 'nublado', dispositivo: dispositivo(),
      preciso: false, fuente: 'referencia sin red',
    };
  }

  const DEMORA_MAX = 5000;   // el hero no espera más de 5 s por nadie

  /** Contexto con deadline: nadie se queda mirando "resolviendo…". */
  async function obtenerContexto(forzado) {
    return Promise.race([
      cadena(forzado),
      new Promise((res) => setTimeout(() => res(porRespaldo(forzado)), DEMORA_MAX)),
    ]);
  }

  /** Geocodifica un nombre de ciudad vía Open-Meteo Geocoding (sin clave). */
  async function geocodar(nombre) {
    const url = 'https://geocoding-api.open-meteo.com/v1/search?count=1&language=es&format=json&name=' +
                encodeURIComponent(nombre);
    const r = await conTimeout(fetch(url), 4000);
    if (!r.ok) throw new Error('geocoding ' + r.status);
    const j = await r.json();
    const g = j && j.results && j.results[0];
    if (!g) throw new Error('sin resultados para ' + nombre);
    return { ciudad: g.name, pais: g.country, lat: g.latitude, lon: g.longitude };
  }

  export { obtenerContexto, descripcion, tip, saludoPor, geocodar, CLIMA };
