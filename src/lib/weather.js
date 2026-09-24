/**
 * weather.js — Geolocalización + clima real y en vivo, sin API keys.
 *
 * Fuentes (ambas gratuitas, sin clave y con CORS abierto):
 *   · ipwho.is        → ciudad, país, lat/lon a partir de la IP
 *   · api.open-meteo  → temperatura, sensación, humedad, viento, código WMO y zona horaria
 *
 * Vocabulario visual: el mismo de los servicios meteorológicos oficiales
 * (WMO/AEMET): un símbolo por fenómeno — sol, nubes, bandas de niebla, gotas,
 * copos, relámpago — y una versión nocturna (luna + estrellas) cuando en la
 * ciudad del visitante es de noche.
 *
 * Si cualquier cosa falla, degrada con elegancia a un contexto por defecto: el
 * sitio NUNCA se queda sin saludo ni sin cielo. Mejor genérico que roto.
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

  // Mismos códigos en inglés y portugués: el panel y el saludo hablan el
  // idioma del visitante, no solo español.
  const CLIMA_EN = {
    0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
    45: 'fog', 48: 'freezing fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
    56: 'freezing drizzle', 57: 'heavy freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain',
    66: 'freezing rain', 67: 'heavy freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains',
    80: 'light showers', 81: 'showers', 82: 'heavy showers',
    85: 'snow showers', 86: 'heavy snow showers',
    95: 'thunderstorm', 96: 'thunderstorm with hail', 99: 'severe thunderstorm with hail',
  };

  const CLIMA_PT = {
    0: 'céu limpo', 1: 'céu quase limpo', 2: 'parcialmente nublado', 3: 'encoberto',
    45: 'neblina', 48: 'neblina com geada',
    51: 'garoa leve', 53: 'garoa', 55: 'garoa forte',
    56: 'garoa congelante', 57: 'garoa congelante forte',
    61: 'chuva leve', 63: 'chuva', 65: 'chuva forte',
    66: 'chuva congelante', 67: 'chuva congelante forte',
    71: 'neve leve', 73: 'neve', 75: 'neve forte', 77: 'grãos de neve',
    80: 'pancadas leves', 81: 'pancadas de chuva', 82: 'pancadas fortes',
    85: 'pancadas de neve', 86: 'pancadas de neve fortes',
    95: 'tempestade', 96: 'tempestade com granizo', 99: 'tempestade forte com granizo',
  };

  const VARIABLE = { es: 'cielo variable', en: 'variable sky', pt: 'céu variável' };

  function descripcion(code, lang) {
    const l = lang === 'en' ? CLIMA_EN : lang === 'pt' ? CLIMA_PT : CLIMA;
    return l[code] || VARIABLE[lang === 'en' ? 'en' : lang === 'pt' ? 'pt' : 'es'];
  }

  /**
   * WMO → fenómeno visual (el "símbolo meteorológico" de las páginas oficiales).
   * despejado · parcial · nublado · niebla · llovizna · lluvia · tormenta · nieve
   */
  function cieloDe(code) {
    const c = Number(code);
    if (c >= 95) return 'tormenta';                                     // 95, 96, 99
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'nieve';   // nevadas y granizo fino
    if (c === 45 || c === 48) return 'niebla';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'lluvia';
    if (c >= 51 && c <= 57) return 'llovizna';
    if (c === 3) return 'nublado';
    if (c === 1 || c === 2) return 'parcial';
    return 'despejado';                                                 // 0 y desconocidos
  }

  // La clave del "tip" del saludo: fenómeno primero (como un aviso del sitio
  // del tiempo), luego hora y temperatura. Breve y factual, nunca consejo médico.
  function tip(temp, code, esDeNoche) {
    const c = Number(code);
    if (c >= 95) return 'tormenta';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'nieve';
    if (c === 45 || c === 48) return 'niebla';
    if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'lluvia';
    if (c >= 51 && c <= 57) return 'llovizna';
    if (esDeNoche) return 'noche';
    if (temp >= 27) return 'calor';
    if (temp <= 10) return 'frio';
    if (c === 0) return 'despejado';
    if (c === 1 || c === 2) return 'parcial';
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
                '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
                '&timezone=auto';
    const r = await conTimeout(fetch(url), 4000);
    if (!r.ok) throw new Error('open-meteo ' + r.status);
    const j = await r.json();
    const c = (j && j.current) || {};
    return {
      temp: Math.round(c.temperature_2m ?? 20),
      aparente: c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null,
      humedad: c.relative_humidity_2m != null ? Math.round(c.relative_humidity_2m) : null,
      code: c.weather_code ?? 2,
      viento: Math.round(c.wind_speed_10m ?? 0),
      esDeDia: (c.is_day ?? 1) === 1,
      zonaHoraria: j.timezone || null,
      horaLocal: c.time ? String(c.time).slice(11, 16) : null,
    };
  }

  function horaDe(zonaHoraria) {
    try {
      return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zonaHoraria || undefined }).format(new Date());
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
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
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
      temp: 22, aparente: null, humedad: null, code: 2, clima: descripcion(2), viento: 0,
      zonaHoraria: null, hora: horaDe(null), saludo: saludoPor(horaDe(null)),
      esDeNoche: false, tipKey: 'nublado', dispositivo: dispositivo(),
      preciso: false, fuente: 'por defecto', actualizado: null,
    };
    try {
      if (forzado && forzado.lat != null && forzado.lon != null) {
        // ciudad forzada por URL: ya viene geocodificada, no se pisa con la IP
        base.ciudad = forzado.ciudad; base.pais = forzado.pais || null;
        base.lat = forzado.lat; base.lon = forzado.lon;
        base.fuente = 'geocoding'; base.preciso = true;
      } else {
        const g = await geoPorIP();
        if (g && g.ciudad) {
          base.ciudad = g.ciudad; base.pais = g.pais; base.lat = g.lat; base.lon = g.lon;
          base.fuente = g.fuente; base.preciso = true;
        }
      }
      if (base.lat != null) {
        const c = await clima(base.lat, base.lon);
        base.temp = c.temp; base.aparente = c.aparente; base.humedad = c.humedad;
        base.code = c.code; base.clima = descripcion(c.code);
        base.viento = c.viento; base.zonaHoraria = c.zonaHoraria;
        base.hora = c.horaLocal || horaDe(c.zonaHoraria);
        base.esDeNoche = !c.esDeDia;
        base.fuente += ' + open-meteo';
        base.actualizado = base.hora;
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
      temp: 22, aparente: null, humedad: null, code: 2, clima: descripcion(2), viento: 0,
      zonaHoraria: null, hora, saludo: saludoPor(hora),
      esDeNoche: parseInt(hora, 10) >= 20 || parseInt(hora, 10) < 5,
      tipKey: 'nublado', dispositivo: dispositivo(),
      preciso: false, fuente: 'referencia sin red', actualizado: null,
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

  /**
   * Actualización en vivo: re-consulta Open-Meteo con la ciudad ya resuelta y
   * refresca el contexto EN SU LUGAR. Si falla, devuelve null y el panel se
   * queda con lo último bueno (degrada, no se rompe).
   */
  async function refrescar(base) {
    if (!base || base.lat == null || base.lon == null) return null;
    try {
      const c = await clima(base.lat, base.lon);
      base.temp = c.temp; base.aparente = c.aparente; base.humedad = c.humedad;
      base.code = c.code; base.viento = c.viento;
      base.zonaHoraria = c.zonaHoraria || base.zonaHoraria;
      base.hora = horaDe(base.zonaHoraria);
      base.esDeNoche = !c.esDeDia;
      base.tipKey = tip(base.temp, base.code, base.esDeNoche);
      base.actualizado = base.hora;
      return base;
    } catch (e) { return null; }
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

  export { obtenerContexto, refrescar, descripcion, cieloDe, tip, saludoPor, horaDe, geocodar, CLIMA, CLIMA_EN, CLIMA_PT };
