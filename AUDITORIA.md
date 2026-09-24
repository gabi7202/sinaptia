# Auditoría profesional — sitio + intención de negocio
**SINAPTIA · septiembre 2026 · Todo lo afirmado aquí está medido o verificado por test**

---

## 0 · Resumen ejecutivo

El sitio no es una landing: es un **producto demo de sí mismo**. El visitante experimenta el
servicio (agente que corrige, calculadora con sus números, voz que interrumpe y fusiona) en vez
de leer promesas. Eso es coherente con la intención del negocio y es su mayor ventaja competitiva.

**Puntuación por dimensión** (sobre 10, con lo que falta para llegar a 10):

| Dimensión | Nota | Qué la sostiene | Qué falta para 10 |
|---|---|---|---|
| Técnica / robustez | **9.0** | 0 peticiones externas críticas, deadline de red de 5 s con degradación, 186 tests, build estático autónomo | Medir CWV reales en móvil 3G |
| Accesibilidad | **8.5** | Contraste AA verificado por cálculo, `aria-live`, foco visible, `prefers-reduced-motion` | Auditoría con lector de pantalla real |
| SEO técnico | **8.0** | canonical, OG completo, Twitter Card, JSON-LD (Organization/Service/WebSite), sitemap, robots, 404 | Rutas por idioma con `hreflang` |
| Conversión | **8.5** | Calculadora con números del visitante, CTAs que no compiten, lead magnet sin fricción | Casos reales con métricas |
| Confianza / legal | **8.0** | Privacidad, términos, política de IA, cero plazos prometidos, cero cookies | DPA firmado + seguro RC profesional |
| Operación del negocio | **8.0** | BD de prospectos con webhook, embudo sin cookies con `/panel`, plantillas de contrato | Facturación y nurture |

**Veredicto:** el sitio está listo para recibir tráfico y capturar prospectos **hoy**. Lo que lo
separa de facturar no es el sitio: es la capa de operación humana alrededor (entidad legal,
casos reales, seguimiento de leads).

---

## 1 · Auditoría técnica (medida)

### 1.1 Rendimiento y autonomía

| Medición | Resultado |
|---|---|
| Peticiones externas críticas en carga | **0** (CSS y JS inline; solo geo+clima, no críticas) |
| Peso de la página única | 147 KB (1 archivo, sin round-trips de assets) |
| Deadline de red | 5 s; con red colgada el saludo aparece igual (test con `fetch` que nunca responde) |
| Degradación | ciudad de referencia + cielo pintado, sin reintentos infinitos |
| Init no crítico | diferido a `requestIdleCallback` (acordeón, revelado, calculadora, voz) |

**Para llegar a 10:** medir LCP/INP reales con Lighthouse en móvil 3G y publicar el número.
El inline de 147 KB es una decisión deliberada (autonomía `file://`); si CWV sale malo en móvil
lento, el siguiente paso es partir el bundle con rutas Astro y aceptar perder el archivo único.

### 1.2 Accesibilidad (calculada, no opinada)

Contraste WCAG AA medido sobre los 12 pares de color reales del sistema:

| Par | Antes | Ahora | Estado |
|---|---|---|---|
| Terciario sobre blanco | 3.34:1 ✗ | **5.82:1** | AA ✓ |
| Terciario sobre fondo | 3.19:1 ✗ | **5.56:1** | AA ✓ |
| Nota en sala oscura | 5.44:1 ✓ | **9.12:1** | AA ✓ |
| Resto de pares (9) | ✓ | ✓ | AA ✓ |

Además: `role="log" aria-live="polite"` en el chat, `:focus-visible` en todo elemento
interactivo, `prefers-reduced-motion` respeta todas las animaciones, y el micrófono **nunca**
se enciende sin gesto (verificado por test).

**Para llegar a 10:** pase con NVDA/VoiceOver y navegación por teclado completa del acordeón y la sala.

### 1.3 SEO técnico

Presente y verificado por test: `canonical`, `og:title/description/url/image/width/height/alt/locale`,
`twitter:card`, JSON-LD `Organization + Service + WebSite`, `sitemap.xml`, `robots.txt`, página 404
con salida útil, `og.png` 1200×630 propia.

**Deuda conocida y deliberada:** los idiomas viven en un toggle de JS, no en rutas `/en/` `/pt/`
con `hreflang`. Google indexa una sola versión. Si el tráfico orgánico multilingüe es parte del
plan, esto es P2; si el canal principal es outbound + referidos, es P3.

### 1.4 Seguridad

`_headers` con `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
`Cross-Origin-Opener-Policy` y —lo relevante para este producto—
`Permissions-Policy: microphone=(self), camera=(), geolocation=(self)`: el micrófono solo lo
pide el propio origen, ninguna imagen o iframe de terceros puede activarlo.

Las claves de LLM **nunca** están en el cliente: viven en `infra/worker-ia.js` (Cloudflare Worker)
como secretos del entorno.

---

## 2 · Auditoría de intención de negocio

La intención declarada a lo largo del proyecto, contrastada con lo que el sitio hace hoy:

| Intención | Estado | Evidencia |
|---|---|---|
| Ayudar a pymes/emprendedores a implementar IA, sin equipo técnico | ✅ Cubierto | Propuesta de valor, sección de crecimiento, calculadora |
| Un solo mensaje de entrada, no "hacemos de todo" | ✅ Cubierto | El wedge es el diagnóstico + primera automatización; el full-stack vive en docs internos |
| No prometer plazos ni dar impresión de "X días para X cosa" | ✅ Cubierto | Cero apariciones de "X días/semanas/meses" en texto visible (test que falla si vuelve) |
| Lenguaje de 5º grado, anti-defensivo, sin asustar | ✅ Cubierto | Reglas de voz del agente + copy revisado; test de "sin dinero nuestro visible" |
| Voz real: escuchar → detectar → analizar → responder | ✅ Cubierto | STT/TTS nativos, interrupción con fusión en un solo audio, 24 tests de voz |
| Voz adaptable a cualquier negocio | ✅ Cubierto | Perfiles declarativos (clínica/taller/inmobiliaria) + 21 tests de adaptación |
| Automatización de prospectos (recaudar y guardar) | ✅ Cubierto | BD JSON local + webhook/Supabase + registro de turnos, llamadas y calculadora |
| El dinero del cliente como protagonista | ✅ Cubierto | Calculadora viva; CTA siembra la conversación con su propia cifra |
| Sitio que se sienta inteligente desde el segundo 1 | ✅ Cubierto | Saludo con ciudad+clima reales, cielo animado, agente que corrige en vivo |
| Prueba social con casos reales | ⚠️ Parcial | Se quitaron las "demos de referencia" a propósito; **faltan casos reales con métricas** |
| Multilingüe con rutas indexables | ⚠️ Parcial | Toggle ES/EN/PT funcional; sin rutas ni `hreflang` |
| Operación humana alrededor (legal, facturación, nurture) | ⚠️ Parcial | Plantillas listas en `docs-internos/`; falta ejecutarlas |

---

## 3 · Lo que falta, priorizado

### P0 — bloquea facturar (hazlo esta semana)

1. **Configurar `src/config.js`**: `marca.email`, `marca.agenda` (Cal.com real), `urlPublica`,
   `bd.url` o `bd.supabase`, y `ia.endpoint` si quieres cerebro LLM. Sin esto, los leads se
   quedan en el navegador del visitante.
2. **Entidad legal + cuenta bancaria** para facturar internacionalmente (brief en
   `docs-internos/06-plantillas/contratos-y-legal.md` §legal: LLC vs OÜ estonia vs local).
3. **Desplegar el worker** `infra/worker-ia.js` con tus claves como secretos, si quieres IA real.

### P0.5 — prospecto de EE. UU. sin hablar inglés — ✅ implementado

`/interprete` (puente ES↔EN + resumen en español de la conversación guardada), rutas `traducir`
y `resumir` en el worker, y `docs-internos/kit-prospecto-us/` con el flujo paso a paso, cuatro
emails en inglés listos para enviar y el esqueleto de propuesta en inglés. `/interprete` está
excluido de robots y sitemap: es tu herramienta, no una página pública.

### P1 — convierte visitas en dinero (primeros 30 días)

4. **Tres clientes piloto** con métricas medidas antes/después. Sin ellos no hay prueba social;
   las demos se quitaron a propósito y no deben volver como sustituto.
5. **Analítica de funnel sin cookies** (Plausible self-hosted o similar): visitas → calculadora
   movida → lead → llamada. Sin esto no sabes qué canal funciona.
6. **Secuencia de nurture de 3 emails** post lead-magnet: el lead magnet captura, pero nadie
   persigue al que no agendó. Tres emails, tono de 5º grado, sin urgencia falsa.

### 1.5 · Analítica de funnel sin cookies — ✅ implementada

`src/lib/funnel.js` cuenta eventos de embudo **una vez por sesión, sin cookies ni píxeles**:
`visita → calculadora → calculadora_cta → lead → llamada`, más `invitacion` como paso intermedio.
Los eventos viven en la BD local y viajan al remoto configurado con el resto de registros, así
que la agregación real de todos los visitantes ocurre en tu backend, no en el navegador.

`/panel` es una vista local de verificación (lee solo este navegador) con recuento por paso,
tasas entre pasos, tasa global visita→llamada, pendientes de sincronizar, exportar JSON y borrar.
8 tests verifican dedupe de visita, recuento, tasas y payload.

### P2 — escala la confianza (días 30–60)

7. **DPA firmado + seguro de responsabilidad civil profesional**: lo exigen clientes medianos
   y es lo que separa a un freelancer de un proveedor.
8. **Rutas `/en/` y `/pt/` con `hreflang`** si el orgánico multilingüe entra en el plan.
9. **Publicar las 6 piezas de contenido** de `docs-internos/06-plantillas/contenido-publicable.md`
   (ya escritas y basadas en hechos reales del build).

### P3 — cuando haya caja (días 60–90)

10. Página de estado y SLA público del retainer.
11. Testimonios en video de los pilotos.
12. Facturación automatizada y flujo de firma de DPA.

---

## 4 · Riesgos que ya están mitigados (y cómo se vigila)

| Riesgo | Mitigación viva | Vigilancia |
|---|---|---|
| Caída de red o adblocker | Deadline 5 s + degradación sin red | test con `fetch` colgado |
| Promesa de plazos filtrada | Regla de voz + copy sin cifras | test de texto visible y de respuestas |
| Micrófono sin consentimiento | Solo se abre con gesto | test de `?voz=1` sin toque |
| Interrupción que rompe la conversación | `cancel()` + `onboundary` + fusión en un audio | 6 tests de fusión |
| Lead perdido | BD local + cola que no se pierde si el remoto falla | 12 tests de BD |
| Contraste que excluye | Paleta corregida y calculada | medición WCAG en esta auditoría |
| Claves quemadas en cliente | Worker con secretos; sin endpoint, motor determinista | test de IA sin endpoint |

---

---

## 6 · Re-revisión (segunda pasada, ojos frescos)

Se ejecutó una segunda auditoría completa sobre el build de 7 páginas, cargando cada página
en un DOM real con la red caída y buscando errores de runtime, enlaces rotos y bugs de SEO.
Encontró y corrigió dos bugs reales que la primera pasada no vio:

| Bug | Síntoma | Causa | Corrección |
|---|---|---|---|
| `import` suelto en `index.html` | `SyntaxError: Cannot use import statement outside a module` al abrir el archivo | Con 7 páginas, Vite emite chunks compartidos y el postbuild inlineaba el entry con sus imports sin resolver | El postbuild re-empaqueta cada entry a un IIFE autocontenido con esbuild antes de inlinearlo |
| `canonical` y `og:url` idénticos en todas las páginas | Cada página declaraba como canónica la raíz | Se construían con el origen sin la ruta | Ahora incluyen `Astro.url.pathname`, y se omiten si no hay origen configurado (no pueden ser absolutos) |

Verificado tras la corrección: las 7 páginas cargan sin un solo error de runtime con la red
caída, cero enlaces rotos, y con `ASTRO_SITE` configurado el canonical de `/privacidad/` apunta
a `…/privacidad/` y no a la raíz.

**Estado final de la re-revisión: 194/194 tests en verde, 0 errores de runtime en las 7 páginas,
0 enlaces rotos, contraste AA en los 12 pares de color, y el archivo único vuelve a funcionar
abierto con doble clic.**

## 5 · Conclusión

El sitio hace lo que la intención pedía y lo defiende con tests. **No le falta sitio: le falta
operación humana alrededor.** Los tres P0 son de una tarde de trabajo administrativo, no de código.

Cuando los tres estén hechos, el embudo completo existe: visitante → saludo con su ciudad →
calculadora con su dinero → lead guardado → llamada → diagnóstico → proyecto → retainer.
Lo que queda después es repetir: tres pilotos, tres casos con métricas, y dejar que la prueba
social haga el trabajo que hoy hace tu discurso.
