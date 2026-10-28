# Sinaptia · Prospect Agent — Astro

**Un sitio que piensa desde el segundo 1.** Detecta la ciudad del visitante por IP, consulta
el clima real y lo saluda con algo como *"Buenas tardes. Llegas desde Bogotá, donde ahora son
las 14:32 y hay 24° con parcialmente nublado."* Un agente conversa con él, **corrige los
planteamientos mal hechos**, recauda los datos y entrega un **brief en PDF**. Todo estático:
se aloja gratis en GitHub Pages.

Construido sobre **Astro 5** (islas de vanilla JS, cero framework en el cliente, CSS inline
en el build).

---

## Groq, memoria en el móvil y copia del brief (octubre 2026)

Esta iteración conecta el sitio con **Groq** de verdad, sin obligarte a montar Supabase:

- **`GROQ_API_KEY` y listo.** `CONFIG.ia.endpoint` ahora es `/api/ia` por defecto; el proxy
  (`api/ia.js` / `infra/worker-ia.js`) usa Groq primero (`llama-3.3-70b-versatile`), xAI
  después y OpenAI como tercera opción. En GitHub Pages, `/api/ia` da 404 y el motor
  determinista sigue atendiendo: degrada, no se rompe.
- **Memoria temporal en el navegador** (`src/lib/memoriaSesion.js`): el hilo de la
  conversación vive en `localStorage` por idioma, con TTL de 12 h, tope de 40 turnos y borrado
  por “empezar de cero”. Se manda en cada turno, así Groq no pierde el hilo si el cliente
  recarga o bloquea el móvil. No sustituye la memoria de clientes: es el hilo de ESTA sesión.
- **Prompt maestro versionado** (`server/prompt-maestro.js`): identidad, idioma, transparencia,
  cero invenciones, una pregunta por turno, conversión a brief + llamada y defensa anti
  prompt-injection. El guion del motor sigue siendo la autoridad para correcciones y cifras.
- **PDF bilingüe con el proyecto** (`src/lib/brief.js` + `textosPdf.js`): datos, dolor,
  propuesta con fases, inversión, correcciones, lo que NO se automatiza y siguiente paso. Se
  descarga en el dispositivo y **se envía una copia** por `POST /api/proyecto` (Google Apps
  Script/Gmail, Resend, webhook o Supabase); si no hay canal, Web Share del PDF o WhatsApp
  (`wa.me`) con el resumen. El correo del dueño no se publica.
- **Landing `/en`** con copy nativo de negocios, chat propio, precios honestos y una sección
  de transparencia: Nexa es IA, el fundador no habla inglés fluido y usa IA; la videollamada
  se apoya en interpretación de IA en ambos sentidos.
- **`/interprete` con modo voz por turnos**: escuchar al cliente EN→ES, hablarle ES→EN,
  transcripción bilingüe y aviso honesto de que no es simultáneo.
- **Contacto público solo WhatsApp**: +52 983 406 6176 (`wa.me/529834066176`). El correo del
  dueño vive únicamente en Vercel (`LEAD_EMAIL`) o en las propiedades de Google Apps Script;
  no aparece en el HTML, el bundle, el PDF ni el JSON-LD.
- **Auditoría de mejoras**: `MEJORAS-2026-10.md` con hallazgos, arquitectura, cómo activarlo
  y lo que no se pudo verificar (clave real, email real, teléfono físico).
- **Variables limpias en Vercel**: `docs/VERCEL-ENV.md` (qué conservar y qué borrar de xAI/OpenAI).
  **Copia por Gmail**: `google-apps-script/README.md` y `google-apps-script/Code.gs`.

---

## El panel de contexto no es decorativo

Es una consola de diagnóstico viva:

- Arranca con **esqueleto animado** (shimmer), nunca con guiones muertos.
- El **cielo reacciona al clima real**: sol con rayos girando, nubes a la deriva, lluvia cayendo
  o estrellas titilando según el código WMO y si es de día o de noche en SU zona horaria.
- Las seis señales (ciudad, hora, zona, dispositivo, viento, sensación) se **encienden
  escalonadas** a medida que se resuelven.
- Muestra **fuentes y latencia** ("ipwho.is + open-meteo · 412 ms · hace 15s") y un badge
  `en vivo` o `modo referencia` si la geolocalización falló y degrada a la ciudad de respaldo.

Fuentes gratuitas y sin clave, consultadas **en el navegador del visitante**: `ipwho.is` /
`ipapi.co` para IP y `api.open-meteo.com` para clima y zona horaria.

---

## Estructura

```
sinaptia/                      ← esta carpeta ES el repositorio
├── astro.config.mjs           base configurable (ASTRO_BASE para Pages)
├── public/                    favicon + auditoria.html (página estática)
├── scripts/postbuild.mjs      URLs relativas + bundle inlineado → dist autónomo
├── src/
│   ├── config.js              ← LO ÚNICO QUE EDITAS PARA PERSONALIZAR
│   ├── layouts/  components/  páginas y secciones (incluye /en y Transparencia)
│   ├── lib/                   skill.js (cerebro) · engine.js · weather.js
│   │                          memoriaSesion.js (hilo temporal) · conversacion.js
│   │                          brief.js + textosPdf.js (PDF bilingüe) · proyecto.js
│   │                          ia.js (contrato + guardas) · interprete.js
│   ├── scripts/main.js        arranque: contexto, cielo, saludo, agente, memoria, PDF
│   └── styles/global.css
├── server/                    prompt-maestro.js · llm.js (Groq/xAI/OpenAI) · grok.js
│                              agente.js · resumen.js · memoria-sesion.js · json.js
│                              nucleo.js (Supabase REST) · langs.js · schema.sql
├── infra/worker-ia.js         proxy de IA (Cloudflare Worker) que guarda las claves
├── api/ia.js                  función Vercel del proxy (mismo cerebro que el Worker)
├── api/proyecto.js            copia del brief al dueño (Resend/webhook/Supabase)
├── api/voz/                   ★ backend real (fusión A+B): session · chat (streaming)
│                              end (resumen al colgar) · cron (rescate) · panel (analítica)
├── test/                      ~500 tests: motor · PDF · voz · BD · IA · prompt · Groq
│                              memoria · brief · proyecto · web · backend · sitio · /en
└── docs-internos/             TU PLAYBOOK DE NEGOCIO — ignorado por git, nunca se publica
```

---

## Correr y probar

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # astro build + postbuild → dist/ portable
npm run test:all     # ~500 tests, incluida integración del BUILD con red real
```

La suite `test/site.test.js` carga `dist/index.html` tal cual sale de Astro en un DOM con red
verdadera y recorre el flujo completo hasta el PDF. Es la que encontró los bugs reales
(entre ellos que `new Blob([stringBinario])` codifica UTF-8 y rompía acentos y xref).

`test/extras.test.js` prueba las páginas nuevas: `/en` (copy, transparencia, chat en inglés),
`/interprete` (modo voz por turnos) y los textos de privacidad/términos/sitemap.

`test/prompt.test.js` y `test/llm.test.js` verifican el prompt maestro y el cliente Groq sin
red: URL, modelo, cabeceras, streaming SSE, JSON tolerante y errores. `test/memoria-sesion.test.js`
verifica el TTL y los topes de la memoria del navegador. `test/proyecto.test.js` verifica la
copia al dueño (Resend, webhook, sin destino). `test/brief.test.js` verifica el PDF bilingüe y
que no prometa plazos.

`test/backend.test.js` prueba el cerebro del servidor sin red ni claves: un Supabase en
memoria (PostgREST simulado) y un Grok falso que habla SSE. Cubre matching fuerte/débil
de clientes, rate limit, normalización de historial, pipeline de resumen y las cinco rutas.

---

## Publicar en GitHub Pages

```bash
git init && git add -A && git commit -m "Sinaptia: sitio + agente de diagnóstico"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sinaptia.git
git push -u origin main
```

Y una sola vez en GitHub: **Settings → Pages → Source: GitHub Actions**.

A partir de ahí no tocas nada: el workflow `.github/workflows/deploy.yml` compila el sitio en
cada push a `main` (con la base correcta para la subruta del repo) y lo publica solo.
No hace falta commitear `dist/` —que está ignorado— ni dejar la raíz del repo servible.

Si prefieres Pages "desde una rama" en lugar de Actions, la alternativa es subir el contenido
de `dist/` a una rama `gh-pages`; pero con el workflow no hay paso manual que olvidar.

Con dominio propio: añade tu dominio en Pages y quita el `ASTRO_BASE` del workflow
(deja `base: '/'` en `astro.config.mjs`).

> **`docs-internos/` nunca se publica.** Está en `.gitignore`, así que tu playbook de negocio
> (estrategia, precios internos, plantillas legales, borradores) viaja con el repo en local
> sin llegar jamás a GitHub. Si clonas en una máquina nueva, copia esa carpeta a mano.

## Dirección visual: claro, empático, con dos momentos oscuros

Fondo blanco azulado (`#F7FAFD`), tinta casi negra para leer (`#0E1B2A`) y azul como acento
que acompaña (`#1D6FE0`). El blanco/negro/azul que proponías funciona así: el "negro" no es
puro sino tinta azulada (lee profesional sin golpear), y el oscuro verdadero se reserva para
**dos momentos deliberados**: la sala de llamada (foco absoluto) y el CTA final (contraste).
Todo lo demás es luz: tarjetas blancas, bordes suaves, sombras bajas.

El cielo del panel de contexto sigue siendo lo único que cambia de color con el clima real —
sobre fondo claro se ve más vivo, no menos.

## Crecimiento: para emprendedores y startups, terminado en dinero

Fuera las "demos de referencia". En su lugar, una sección para quien necesita **atender a más
clientes sin multiplicar la nómina**: tres palancas (capacidad sin nómina, velocidad que cierra,
tu tiempo vuelto venta) y una **calculadora viva** donde el visitante pone sus propios números
—consultas al mes, valor de venta, % que queda sin respuesta a tiempo, horas repetitivas, costo
hora— y ve al instante cuánto dinero deja en la mesa al año, con los supuestos conservadores
escritos en pantalla para que los discuta.

El botón "Quiero recuperar ese dinero" abre el chat **sembrando la conversación con su propia
cifra** ("estoy dejando en la mesa $83.115 al año…"), y el registro queda en la base de datos.
El dinero no aparece por magia: aparece cuando dejas de perderlo.

La ciudad del panel de contexto ahora vive en una pastilla blanca con texto azul: legible sobre
cualquier cielo, de día o de noche.

## Llamada contextual: aparece cuando una acción le da sentido

Fuera el botón fijo del header. La llamada ahora se **gana su lugar**:

| Disparador | Invitación |
|---|---|
| El agente llega a la propuesta en el chat | "Lo que acabo de armarte tiene detalles que se entienden mejor hablados. ¿2 minutos de voz…?" |
| Abres una situación del acordeón | "¿Prefieres escucharlo? En 2 minutos de voz te cuento qué haríamos en tu caso…" |
| Generas el PDF | "Tu brief está listo. ¿Lo revisamos juntos en una llamada de 10 minutos?" |
| Escaneas el QR o entras con `?voz=1` | La sala se abre sola y espera tu toque |

Cada invitación se muestra **una sola vez**, se puede cerrar con "ahora no", y al aceptarla
aparece el botón flotante para reabrir la sala. Nadie ve un micrófono sin contexto: primero
entiende para qué sirve, luego lo usa.

## Prospecto en inglés sin hablar inglés (`/en` + `/interprete`)

El sitio tiene una **landing propia en inglés** (`/en`) con el mismo agente Nexa en `en-US`,
copy nativo de negocios, rangos honestos y transparencia. No es una traducción del HTML: es una
página pensada para el prospecto que decide en inglés.

Para que TÚ operes esa conversación en español existe `/interprete`:

- **Escrito**: Español→Inglés para escribirle, Inglés→Español para leerlo, y un botón que
  resume en español la conversación guardada. Con `ia.endpoint` configurado la traducción es
  instantánea; sin él, un clic abre Google Translate con el texto cargado.
- **Voz para videollamada**: interpretación por turnos. “Escuchar al cliente” transcribe en
  inglés, traduce al español y te lo dice; “Hablarle” hace el camino inverso. La página avisa
  de que no es simultáneo y guarda la transcripción bilingüe en pantalla.
- El prompt maestro incluye la transparencia: Nexa es IA, el fundador usa IA para el inglés y
  la videollamada se apoya en interpretación de IA en ambos sentidos.

En `docs-internos/kit-prospecto-us/` está el flujo completo paso a paso, cuatro emails en
inglés listos para copiar (con notas en español de qué hace cada uno) y el esqueleto de
propuesta en inglés con las cláusulas que salvan tu flujo de caja.

## Analítica de embudo sin cookies (`src/lib/funnel.js` + `/panel`)

Eventos de embudo contados una vez por sesión, sin cookies ni píxeles:
`visita → calculadora → calculadora_cta → lead → llamada` (+ `invitacion`). Viven en la BD local
y viajan al remoto configurado, así que la agregación real de todos los visitantes ocurre en tu
backend. `/panel` es la vista local de verificación: recuento por paso, tasas, tasa global,
pendientes de sincronizar, exportar y borrar.

## Interrupciones: fusión en un solo audio (`voz.js` + `worker-ia.js`)

Cuando el cliente interrumpe a la IA a mitad de frase, el flujo es de **estado**, no de audio:

1. `onboundary` va guardando hasta dónde alcanzó a hablar (`spokenSoFar`), palabra por palabra.
2. Al interrumpir, `cancel()` — **nunca `pause()`/`resume()`**, que es notoriamente poco confiable
   entre navegadores (Chrome lo rompe en textos largos).
3. Se manda al backend `respuesta_incompleta` + `respuesta_ya_dicha` + `interrupcion_cliente`.
4. El backend devuelve **una sola `respuesta_fusionada`** con el prompt explícito:
   *"Ibas diciendo: '…'. El cliente te interrumpió con: '…'. Genera una única respuesta hablada
   que continúe naturalmente incorporando lo que pidió, sin repetir literalmente lo ya dicho ni
   decir frases como 'como mencionaba antes'."*
5. Esa respuesta se habla como **un solo audio nuevo**, no dos pegados.

Sin backend configurado, hay fusión determinista: el motor responde la interrupción y retoma el
hilo sin repetir lo dicho. Hay tests que verifican el payload de fusión y que el audio fusionado
es uno solo.

> **Privacidad del reconocimiento de voz:** `SpeechRecognition` es nativo del navegador, pero en
> Chrome de escritorio el audio se procesa en los servidores de Google (no es integración tuya,
> pero tampoco es 100% on-device). En Safari sí es local. Si un cliente exige procesamiento
> estrictamente local, ofrécele Safari o deja la voz desactivada y usa el chat.

## El asistente de voz: decisiones abiertas (`docs-internos/debate-voz.md`)

Cuatro decisiones con trade-offs y recomendación: voz gratuita vs neuronal (recomendado híbrido:
neuronal para el saludo, navegador para el resto), identidad de voz (femenina por defecto con
toggle), turno automático vs pulsar (recomendado turno automático con endpointing de 1,8 s, aún
no construido) y barge-in real vs botón (recomendado quedarse con el botón: la fusión ya da el
80% del beneficio con el 10% del riesgo). En esta ronda quedó implementada la selección de voz
por calidad y género, y el habla por frases con pausas naturales y cola cancelable.

## Voz adaptable a cualquier negocio (`src/lib/negocio.js`)

La misma capa de voz —escuchar → detectar → analizar → responder— sirve para cualquier
negocio cambiando **un objeto de perfil**: nombre, saludo, servicios, FAQ, regla de cita y
regla de derivación a humano. Incluye tres perfiles de ejemplo (clínica dental, taller
mecánico, inmobiliaria) y se activan con `?negocio=clinica|taller|inmobiliaria`.

Por qué un perfil declarativo y no un prompt gigante: es auditable, testeable y no alucina.
Cada respuesta sale de datos del negocio, nunca de la imaginación de un modelo. Cuando
conectes el LLM del worker, el perfil sigue siendo la fuente de verdad y el modelo solo pone
el lenguaje. Para adaptar un negocio nuevo: copia un perfil, cambia sus datos, listo.

La sección del QR ahora le habla **al cliente que escanea**, no al dueño del sitio: "¿Escribir?
Mejor habla." Y le ofrece escuchar el demo adaptado a su sector antes de decidir nada.

## Regla de oro: cero plazos prometidos

Ninguna superficie面向 al cliente dice "X días para X situación". Ni el sitio, ni el agente,
ni el PDF, ni la og:image, ni el JSON-LD. El tiempo se menciona solo como *fase* ("la primera
fase", "al cerrar cada fase") o como proceso ("el ritmo sale de revisar tu operación juntos").

Por qué: un plazo publicado es una promesa que un proceso ajeno puede romper, y cada plazo
incumplido cuesta más confianza de la que gana la promesa. Los objetivos de duración viven en
`docs-internos/` como metas de operación internas, nunca como compromiso público.

Hay un test que falla si cualquier "X días / semanas / meses / minutos" vuelve al texto visible
de la página, y otro que falla si el agente lo dice en una respuesta.

## Despliegue (`DEPLOY.md`)

Repo git-listo con commit inicial. Recomendación: **Vercel** (Astro sin configuración, funciones
serverless gratis para `/api/ia`, previews por rama, SSL automático con dominio propio).
Firebase queda como alternativa si vives en Google, con el cerebro en el Cloudflare Worker.
`vercel.json` y `firebase.json` ya están escritos; las claves viven como secretos del entorno,
nunca en el repo (verificado: ninguna clave hardcoded).

## Robustez y SEO (respondiendo a la revisión externa)

| Punto señalado | Qué se hizo |
|---|---|
| `<h1>` vacío sin JS | Ahora lleva texto estático real ("IA que trabaja por tu empresa desde el primer día.") que el tipeo sustituye. SEO y visitantes sin JS cubiertos. |
| CTA de agenda roto si no configuras Cal.com | El CTA final detecta el placeholder y en su lugar renderiza "Agendar hablando con Nexa", que siembra la conversación. Con `marca.agenda` configurada, vuelve al enlace real. |
| Hero dependiente de dos llamadas externas | Deadline de 5 s: si la cadena IP+clima se cuelga, degrada a un respaldo **inmediato y sin red** (ciudad de referencia + cielo pintado). Nadie se queda mirando "resolviendo…". |
| Muchos CTAs compitiendo | Mapa documentado en `main.js`: un solo destino de fondo (el agente) con primera frase distinta según el momento, más la agenda externa solo si está configurada. Cada CTA aparece en un momento distinto del viaje, no juntos. |
| Sin canonical / og:image / og:url / Twitter Card | Añadidos, con `public/og.png` 1200×630 generada en marca (sin servicios externos). |
| Sin datos estructurados | JSON-LD con `Organization` + `Service` (con oferta del diagnóstico) + `WebSite`, e `inLanguage` es/en/pt. |
| ~72 KB de JS inline en el primer render | Lo no crítico (acordeón, revelado, calculadora, wiring de voz e invitación) se inicializa en `requestIdleCallback`. El bundle sigue siendo uno solo a propósito: es lo que permite abrir el `dist/index.html` con doble clic y publicar sin servidor. Mide CWV reales con Lighthouse antes de invertir en ads. |
| Idiomas por toggle, sin rutas ni hreflang | Consciente y deliberado: el agente es una app conversacional, no contenido editorial. Si el tráfico orgánico multilingüe importa, el siguiente paso es rutas `/en/` y `/pt/` con `hreflang` — no está hecho aún. |

Cada uno de estos puntos tiene un test que falla si regresa.

## Base de datos, IA real y llamada sin distracciones

### Base de datos (`src/lib/bd.js`)

Todo deja un registro JSON: cada turno de chat o voz (con canal, idioma, patrón detectado,
confianza, respuesta y el guion estructurado), cada lead, cada PDF y cada inicio/fin de llamada.

Tres niveles, de menor a mayor:
1. **Memoria** y **localStorage** (tope 500 registros) — siempre activos, sin configurar nada.
2. **Remoto genérico**: `bd.url` en `config.js` → POST por lotes cada 20 s y al cerrar.
3. **Supabase**: `bd.supabase = {url, key, tabla}` → inserción vía REST con tu apikey.

El visitante puede exportar todo (`bd.exportar()`) o borrarlo (`bd.borrar()`). Si el remoto
falla, la cola no se pierde: se reintenta en el siguiente ciclo.

### IA real como cerebro (`src/lib/ia.js` + `server/llm.js` + `server/prompt-maestro.js`)

El sitio es estático, así que las claves viven en el **proxy** (`api/ia.js` en Vercel o
`infra/worker-ia.js` en Cloudflare). Sin proxy configurado, el motor determinista sigue
atendiendo: degrada, no se rompe.

**Proveedor:** Groq primero (`GROQ_API_KEY`, modelo `llama-3.3-70b-versatile`), xAI/Grok
después, OpenAI al final. El prompt maestro está versionado y lo comparten chat, voz,
resumen y traducción.

El modelo **no lee el sitio**: recibe el *guion estructurado* que produce el motor
(intención, etapa, corrección, propuesta, siguiente pregunta, lead acumulado), la **memoria
temporal del navegador** y las reglas del prompt maestro. Devuelve un JSON con contrato
(`respuesta`, `intencion`, `confianza`, `datos`, `paso`, `siguiente_accion`, `objecion`,
`idioma_detectado`). `src/lib/ia.js` lo extrae con tolerancia (backticks, prosa), lo normaliza,
rechaza plazos/garantías/cifras inventadas y, si algo no cumple, responde el motor.
Las correcciones siguen siendo autoridad: si el cliente pide algo mal planteado, la corrección
va primero la responda quien la responda.

### Memoria temporal del hilo (`src/lib/memoriaSesion.js`)

Groq no guarda estado entre peticiones. Para que no pierda el hilo en el móvil:

- clave `sinaptia:sesion:<idioma>:v1` en `localStorage`, **TTL 12 h** desde el último turno;
- tope de 40 turnos y 600 caracteres por turno (cuota del móvil);
- se envía como `<memoria_sesion>` en cada llamada al proxy;
- al recargar, el motor **reproduce** los turnos del usuario para recuperar su estado y el
  chat retoma con “Continuamos donde quedaste…”, sin volver a preguntar lo ya respondido;
- “empezar de cero” la borra. No es la memoria de clientes (`memoria.js`): es el hilo de
  ESTA sesión.

### Llamada simple: escuchar → detectar → analizar → responder

Al abrir la llamada ya no hay recitado del sitio ni del clima: **una línea y directo al motivo**
("Hola, soy Nexa. Dime en una frase qué necesitas y te llevo directo."). Cada turno muestra en
pantalla el patrón detectado (`patrón: necesidad: cotizaciones`) mientras la voz responde con
máximo dos ideas. Lo largo se lee en el chat; lo hablado va al grano.

## Conversación por voz (llamada real)

El botón **Llamar** de la barra abre una llamada de voz de ida y vuelta:

```
habla la persona → SpeechRecognition (voz→texto, nativo del navegador)
               → engine.responder()   (razonamiento local, milisegundos)
               → speechSynthesis      (texto→voz, nativo)
               → al terminar, vuelve a escuchar sola
```

- **Sin claves y sin backend:** usa el reconocimiento y la síntesis de voz del propio
  sistema operativo. Funciona en GitHub Pages tal cual y no cuesta nada por llamada.
- **Latencia:** al terminar tu frase, la respuesta empieza a sonar en ~0,3–1,5 s, porque el
  razonamiento es local e instantáneo y el TTS arranca en cuanto hay texto.
- **Conversacional de verdad:** bucle de escucha automática, *barge-in* (si hablas encima,
  la IA se calla y te escucha), y estados visibles en el orbe: escuchándote / pensando / hablando.
- **Controles:** pausar escucha, silenciar la voz de la IA (sigue por texto) y colgar.
- **Privacidad:** el audio se procesa en tu navegador y en los servicios de voz del sistema
  operativo; nada de lo dicho se envía a nuestro servidor. El sitio lo dice en pantalla.
- **Degradación:** si el navegador no reconoce voz (Firefox), avisa y el chat de texto sigue
  funcionando. Si falta síntesis, las respuestas se muestran escritas.
- La llamada usa **el mismo agente** que el chat: el lead, las correcciones y el PDF se
  acumulan igual. Si la conversación cierra, el botón de PDF aparece en el chat.

Configurable en `src/config.js → voz`: idioma/acento (`es-ES`, `es-MX`…), voz preferida,
velocidad, tono y si el bucle de escucha está activo.

Soporte: Chrome, Edge y Safari (escritorio y móvil). Firefox no implementa reconocimiento
de voz web: ahí la llamada degrada a texto con aviso.

## Backend real (opcional): Groq + Supabase — la fusión A+B

La página `/voz` puede conectarse a un cerebro conversacional de verdad (rutas
`api/voz/*` + núcleo en `server/`, todo **sin dependencias nuevas**: fetch plano contra
PostgREST y la API SSE de Groq/xAI). Se activa con `PUBLIC_IA_VOZ=/api/voz` en el build
(guía completa: `DEPLOY.md §6`, schema en `server/schema.sql`, variables en `.env.ejemplo`).

**Sin Supabase también funciona.** Si no hay DB, `session` devuelve una sesión efímera
`efimero-…` y `chat` usa la memoria temporal del navegador: Groq responde igual y nada se
persiste. Es lo que permite probar con solo `GROQ_API_KEY`.

Qué gana `/voz` cuando activas el backend completo:

- **Groq en streaming**: la primera frase suena antes de que el modelo termine de
  escribir (`voz.js` encola frases que llegan por red; el barge-in las cancela igual).
- **Memoria de clientes en servidor**: cookie httpOnly `vid` + tabla `leads` con matching
  **fuerte** (teléfono / email / nombre+negocio → "¡Hola de nuevo, José!") y **débil**
  (solo nombre → el agente pide confirmar SIN revelar qué tiene guardado). Multidispositivo
  y privacy-aware, con tool use real (`buscar_cliente`).
- **Consentimiento explícito y versionado** antes de grabar nada; sin aceptar, la
  conversación sigue en modo local (nada viaja al servidor).
- **Conversación → lead estructurado** al colgar (`/api/voz/end`): Grok extrae intención,
  urgencia, **frases textuales**, objeciones, herramientas actuales y siguiente paso.
- **Cron de rescate** (diario): resume llamadas cortadas por batería o crash (>20 min).
- **Higiene de producción**: rate limit 60 mensajes/hora/visitante, UUID estrictos,
  mismo origen, system prompt anti prompt-injection y regla *cero plazos* heredada de A.
- **`/panel` con analítica real**: totales, intenciones, urgencias, objeciones y frases
  textuales de TODAS las conversaciones (protegido con `PANEL_SECRET`, que se pide al
  vuelo y nunca se hornea en el sitio).

Y lo más importante: **degrada, no se rompe**. Con `ia.voz` vacío, `/voz` no llama a
`/api/voz` (lo verifica `site.test.js`) y usa `/api/ia` o el motor local; con el backend
caído, `/voz` avisa y sigue sin cortar la llamada.

## Brief en PDF + copia para el dueño

- `src/lib/brief.js` construye el PDF en el idioma del visitante con: datos, dolor, propuesta
  con fases, rango de inversión, correcciones, lo que NO se automatiza y siguiente paso.
  Se descarga en el dispositivo; el visitante nunca se queda sin su documento.
- `POST /api/proyecto` recibe el proyecto (y el PDF en base64) y lo entrega por el primer canal
  configurado: **Google Apps Script + Gmail** (recomendado, sin dominio verificado), **Resend**
  (email con adjunto), `PROYECTO_WEBHOOK` (n8n/Make/Zapier) o **Supabase** (`proyectos`). Si no
  hay canal, responde `enviado:false` sin romper nada.
- En el chat aparecen tres acciones: **enviar copia**, **compartir PDF** (Web Share nativo en
  móvil con el archivo real) y **WhatsApp** (`wa.me` con el resumen). El lead queda también en
  localStorage y en la base de datos local. El correo del dueño nunca entra al bundle.
- `api/proyecto.js` valida origen, consentimiento, tamaño y base64; escapa el HTML y no loguea
  datos personales. El asunto y el adjunto se llaman **Cliente Sinaptia** para identificarlos rápido.

## Inglés primero, sin fingir

- **`/en`** es una landing propia en inglés de negocios, no una traducción automática: promesa,
  problemas, servicios, proceso, rangos honestos, FAQ y chat.
- **Transparencia** en `/` (`Transparencia.astro`) y en `/en`: Nexa es IA; el fundador no habla
  inglés fluido y usa IA; la videollamada se apoya en interpretación de IA en ambos sentidos.
  Se dice antes de que el prospecto lo pregunte. El prompt maestro lo repite en cada turno.
- **`/interprete`** añade modo voz por turnos para la videollamada: EN→ES y ES→EN con
  transcripción bilingüe, elección de voz y aviso de que no es simultáneo.
- `hreflang` ES/EN, `og:locale`, sitemap y enlaces cruzados. El selector de idioma del agente
  sigue reiniciando la conversación en el idioma nuevo (y ahora sin dejar el saludo viejo).

## Voz multilingüe y QR "escanea y habla"

**Tres idiomas completos** (es / en / pt-BR) con selector en la barra y detección automática
por `navigator.language`. Cada paquete trae su propio saludo, sus correcciones, sus propuestas
y **sus propios patrones de detección** — "automatizar todo" y "automate everything" no se
parecen en nada, así que cada idioma trae sus regex. Cambiar de idioma reinicia la
conversación en el idioma nuevo, incluida la voz (STT y TTS cambian de acento con el paquete).

**El QR** se genera en el build (paquete `qrcode`, SVG inline, cero runtime externo) y codifica
tu URL pública con `?voz=1`. Al escanearlo:

1. El móvil abre el sitio directo en la pantalla de llamada.
2. Aparece un botón grande **"Toca para hablar"** — el micrófono siempre exige un gesto humano,
   nunca se abre solo (y hay un test que lo vigila).
3. Al tocar, el agente saluda hablado en el idioma del dispositivo y la conversación sigue sola.

Configura `urlPublica` en `src/config.js` para que el QR apunte a tu dominio real; sin ella,
el QR usa `Astro.site` + base y la sección lo avisa.

## Automatización de prospectos

En `src/config.js`:

```js
webhookUrl: 'https://tu-n8n.tudominio.com/webhook/prospecto',
```

Cuando el visitante acepta el PDF se envía un `POST` JSON con contexto (ciudad, clima, hora,
dispositivo), lead completo, correcciones aplicadas y propuesta elegida. Con `null`, el lead
queda en `localStorage` y en el PDF: nada se pierde.

Destinos sugeridos: Formspree (email sin montar nada) → Make/Zapier ( Sheets + Slack ) →
n8n self-hosted (enriquecer + CRM + tarea de seguimiento). Ese es el serio.

---

## Editar el cerebro

Todo lo que el agente dice vive en `src/lib/skill.js`: `identidad`, `saludo` (con los tips por
clima), `correcciones` (cuándo salta, qué dice, por qué se registra para el PDF),
`descubrimiento`, `conocimiento`, `propuestas` y `cierre`.

Para añadir una corrección: copia un bloque, cambia `id`, el regex de `cuando`, el texto de
`decir`, la razón de `porque` y la pregunta de `retoma`. El motor la antepone una sola vez y
la deja registrada para el PDF.

**Regla:** una corrección nunca debe sonar a regaño. El visitante te cuenta su idea; tú la
mejoras. Si no se puede decir con respeto, no la agregues.

---

## Límites conocidos (deliberados)

- **El motor determinista sigue siendo la red de seguridad.** Groq enriquece el lenguaje, pero
  si falta la clave, el proxy falla o el JSON no cumple el contrato, responde el motor. Cero
  alucinaciones garantizadas en la degradación; el modelo nunca es la única fuente de verdad.
- **La memoria del navegador es temporal y local.** 12 h y 40 turnos; si el visitante borra los
  datos del sitio, se pierde el hilo. Para memoria multidispositivo hace falta Supabase.
- **La interpretación de voz es por turnos**, no simultánea. Es una decisión honesta: la
  simultánea real requiere audio mezclado y latencia que un navegador no garantiza.
- **Geo por IP a veces falla** o acierta solo el país: por eso existen `ciudadRespaldo`,
  el badge `modo referencia` y `?ciudad=Madrid` para forzar ciudad en demos y pruebas.
- **PDF de texto, no maquetado fino.** Es un brief limpio y profesional. Si necesitas marca
  pesada, genera un DOCX en tu backend con el mismo payload del webhook.
- **No hay prueba social ni casos reales** en el sitio: no se inventan. Cuando tengas permiso
  escrito de un cliente, esa es la mejora de conversión con más retorno.
