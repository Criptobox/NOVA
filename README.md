# NOVA v014 — Agente WhatsApp + Cripto + Tienda + Trading (PWA)

NOVA es un agente inteligente que **atiende usuarios por WhatsApp** usando la **API oficial de Meta (Cloud API)** — la vía **100% gratis para responder a tus usuarios (mensajes de servicio) y sin riesgo de baneo** — con seguimiento de criptomonedas en vivo, **control por voz de tu tienda TiendaMax**, **trading automatizado en modo simulación**, alertas de precio, recordatorios, notas de voz, análisis de imágenes, **modo offline con comandos locales** y un **dashboard PWA instalable** con el cerebro neuronal de NOVA.

## Novedades v014 (sobre v013) — El panel te avisa si falta la base de datos

¿Ves el panel con apartados vacíos, guiones «—», «SIN DATOS» o secciones que no cargan? Eso pasa cuando **Vercel Postgres aún no está creada/conectada**: las APIs no tienen base y devuelven error en silencio. La v014 lo hace imposible de ignorar:

| # | Mejora | Detalle |
|---|--------|----------|
| 1 | **Aviso visual de BD no conectada** | Banda ámbar fija bajo la barra superior (en TODAS las vistas, claro y oscuro): «Base de datos no conectada» con los pasos exactos: Storage → Create Database → Postgres → Connect Project → Redeploy |
| 2 | **Diagnóstico automático** | Nuevo endpoint `/api/health`: comprueba la BD con `SELECT 1` al abrir el panel y cada 60 s. Cuando conectas la base y redespliegas, el aviso desaparece solo |
| 3 | **Sin falsas alarmas** | Si la BD responde, el aviso NO se muestra jamás: el panel queda exactamente igual que en v013 |

> 💡 El aviso es solo visual: NOVA sigue funcionando (simulador, cripto en vivo, voz) y todo se guarda en cuanto conectes la base y hagas Redeploy.

## Novedades v013 (sobre v012) — FIX: despliegues en Vercel que fallaban

Si tu despliegue en Vercel daba error `Module not found ... ./src/app/globals.css`, esta versión lo resuelve de raíz con 3 blindajes:

| # | Corrección | Detalle |
|---|-----------|----------|
| 1 | **Paquetes de build pasan a `dependencies`** | `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`, `typescript` y tipos de React ya no son devDependencies: se instalan SIEMPRE, aunque tu proyecto de Vercel tenga `NODE_ENV=production` (que hacía que npm los saltara y el build muriera con `Module not found` en `globals.css`) |
| 2 | **`postcss.config.mjs` ahora viaja en el paquete** | Faltaba en los zips anteriores: sin ese archivo Tailwind v4 no queda configurado en Vercel. Ya se copia siempre |
| 3 | **`package-lock.json` incluido** | Se genera al empaquetar: la instalación en Vercel es reproducible (mismas versiones exactas en cada despliegue) |
| 4 | **Extra** | `engines: node >= 20.9` declarado en `package.json` y comprobación de build en sala limpia (instalación sin devDependencies + `next build`) antes de publicar |

**Qué hacer si ya tenías el proyecto en GitHub:** sube/elige **TODOS** los archivos de este zip reemplazando los anteriores (sobre todo `package.json`, `postcss.config.mjs` y `package-lock.json`) y haz **Redeploy** en Vercel. No hace falta borrar nada de la base de datos: tus datos se conservan.

## Novedades v012 (sobre v011) — Panel rediseñado: cero huecos + modo claro y oscuro

| # | Mejora | Detalle |
|---|--------|----------|
| 1 | **Modo CLARO y modo OSCURO en todas las pantallas** | Nuevo botón ☀/☾ en la barra superior: alterna entre el tema espacial oscuro y el tema claro NOVA Light en escritorio Y móvil. Se guarda en el dispositivo (`localStorage · nova:theme`), la primera vez sigue la preferencia de tu sistema y se aplica antes de pintar (sin parpadeos). Todos los módulos (chat, tienda, trading, cripto, ajustes) están adaptados a los dos temas |
| 2 | **Inicio masonry: cero huecos, cero tarjetas solas** | El inicio ahora es un **masonry por columnas**: cada tarjeta ocupa su altura natural y las columnas se rellenan de arriba abajo (3 columnas en escritorio, 2 en tablet, 1 en móvil). Al no haber celdas fijas, NUNCA quedan huecos ni tarjetas flotando solas |
| 3 | **Fin del texto encimado en móvil** | Los chips del hero (Anti-spam, Modo horario, Notas de voz…) ya NO floten sobre el texto «En vigilancia»: ahora fluyen debajo del cerebro y empujan el contenido hacia abajo. Nada se pisa en ninguna pantalla |
| 4 | **Trading y Tienda apilados sin huecos** | Esas vistas usan ahora apilado vertical de tarjetas a lo ancho completo (stats en 4 columnas en escritorio, 2 en móvil): se acabó la tarjeta «Motor» o «Inventario» sola con huecos al lado |
| 5 | **Diseño más pro y moderno** | Cabeceras con **icono de color por módulo**, badges de estado (● ACTIVO / ● EN VIVO), baldosas de métricas con degradado cristal, «Flujo del agente» en 8 pasos numerados, hover con elevación sutil |
| 6 | **Formularios y detalles adaptados al tema** | Inputs, selects, switches, cajas de código y tokens usan variables de tema: se ven perfectos en claro y en oscuro. El color del navegador (theme-color) también acompaña al tema |

## Novedades v011 (sobre v010) — 100% GitHub + Vercel, sin servicios externos
| # | Mejora | Detalle |
|---|--------|---------|
| 1 | **Todo DENTRO de Vercel** | La base de datos es **Vercel Postgres**, se crea desde la propia pestaña Storage del panel de Vercel y se conecta sola (DATABASE_URL automática). Ya no hace falta crear cuenta en Neon — solo GitHub y Vercel |
| 2 | **Cron nativo de Vercel** | `vercel.json` trae el barrido diario de tareas (`crons`) con la ruta `/api/cron/tick`. Ya no hace falta cron-job.org: el cron lo ejecuta Vercel y se autentica solo con `CRON_SECRET` (cabecera Bearer automática) |
| 3 | **Ticks perezosos (lazy ticks)** | En serverless no hay proceso permanente: cada **mensaje de WhatsApp** (webhook) y cada **refresco del panel** (cada 60 s) empuja las tareas vencidas — recordatorios, alertas, resumen, trading y sniper se ejecutan al momento con uso normal de NOVA |
| 4 | **Tablas automáticas** | El build de Vercel ejecuta `prisma db push`: las 13 tablas se crean **solas** en el primer despliegue tras conectar la base de datos. Cero pasos de SQL (y `setup.sql` queda como plan B para pegar en la pestaña Query) |
| 5 | **Guía simplificada** | `DEPLOY-GUIA.md` reducida a **solo GitHub + Vercel**: 2 cuentas (GitHub y Vercel), 8 pasos y ninguna dependencia más. cron-job.org queda como sección OPCIONAL para recordatorios al minuto con el panel cerrado |

## Novedades v010 (sobre v009) — Módulo de trading + modo offline

| # | Mejora | Detalle |
|---|--------|---------|
| 1 | **Módulo de trading automatizado** | Nueva vista *Trading*: motor con señales técnicas reales (tendencia EMA9/EMA21, RSI 14, MACD, volumen relativo) que opera con reglas de riesgo duras: tamaño máximo de posición, % de capital, **stop-loss obligatorio**, take-profit y límite de operaciones/hora |
| 2 | **Simulación por defecto 🧪** | Cada operación se registra con precios reales de Binance pero sin dinero (modo `sim`). Solo si pegas tus claves del exchange y apagas la simulación explícitamente pasas a testnet/real. Nada toca dinero real por accidente |
| 3 | **Conector Binance (Fase 1)** | `lib/nova/exchange.ts`: REST público (precios, klines, exchangeInfo) + endpoints firmados HMAC (balance, órdenes de mercado) con cola anti rate-limit y reintentos 429/418. **Testnet por defecto**. Sin WebSocket: en Vercel serverless se consulta por REST |
| 4 | **Análisis + backtest (Fase 2)** | `lib/nova/analysis.ts`: indicadores puros, `getSignal()` con score −3…+3 y confianza, y **backtester** que reproduce la estrategia sobre velas históricas (retorno, drawdown máximo, win rate y comparación con “comprar y mantener”) |
| 5 | **Motor de riesgo (Fase 3)** | `lib/nova/trading.ts`: SL/TP se revisan SIEMPRE antes que cualquier señal nueva; bitácora `TradeLog` con modo sim/testnet/real; aviso push + WhatsApp en cada operación real |
| 6 | **Sniper de nuevos listados (Fase 4, seguro)** | `lib/nova/sniper.ts`: detecta pares nuevos en Binance contra un baseline persistido, aplica checks anti-riesgo (quote estable, activo conocido, precio disponible) y registra **solo compras simuladas**. El sniping on-chain real (DEX, milisegundos) requiere un worker dedicado fuera de Vercel — queda fuera del alcance GitHub+Vercel por diseño |
| 7 | **Trading por voz/WhatsApp (Fase 5)** | «estado trading», «señal btc», «analiza eth», «activar/pausar trading», «compra btc» / «vende eth» (solo dueño, solo sim/testnet), «resumen operaciones», «evalúa el trading» + CSV de operaciones + push |
| 8 | **MODO OFFLINE con comandos locales** | La PWA abre sin conexión (SW v010). El panel guarda snapshots reales (precios, portafolio, inventario, operaciones, estado) y el **motor local** responde: «precio btc» con la última copia (te dice de cuándo), «stock bajo», «portafolio», «estado», «operaciones». Los cambios de stock y recordatorios se **apuntan en una outbox** y se **sincronizan solos al reconectar** (toast de confirmación). Nada inventado: cada dato offline lleva su antigüedad |
| 9 | **Seguridad del exchange** | Las API keys se cifran con **AES-256-GCM** (`NOVA_CRYPT_KEY`), nunca se guardan en claro ni salen al navegador (solo máscara `••••1234`) |
| 10 | **Credenciales + testnet** | Ajustes de conexión en la propia vista Trading; verificación de claves contra `/api/v3/account` al guardar; par de testnet `testnet.binance.vision` recomendado |

> ⚠️ **Aviso honesto**: el trading automatizado conlleva riesgo real de pérdida. Empieza en simulación, corre el backtest, compara con “comprar y mantener” y usa como máximo el tamaño de posición configurado. Esto no es asesoría financiera.

## Novedades v009 (sobre v008) — Listo para desplegar en Vercel

| # | Mejora | Detalle |
|---|--------|---------|
| 1 | **Endpoint /api/cron/tick** | Ejecuta alertas de precio, recordatorios vencidos y resumen diario bajo demanda, protegido por CRON_SECRET — las tareas programadas funcionan en serverless (Vercel) con un cron externo gratuito (cron-job.org cada 5 min) |
| 2 | **Tareas idempotentes** | El resumen diario se deduplica en base de datos: llamar al cron varias veces no duplica envíos; alertas y recordatorios ya eran de una sola ejecución |
| 3 | **Esquema PostgreSQL + setup.sql** | El paquete NOVA_Vercel trae el esquema Prisma en PostgreSQL (Neon o Vercel Postgres, gratis) y `setup.sql` para crear todas las tablas pegándolo en el editor SQL — sin instalar nada en tu PC |
| 4 | **Guía de despliegue completa** | DEPLOY-GUIA.md paso a paso en español: GitHub → Neon → Vercel → cron externo → WhatsApp → instalación de la PWA en el teléfono |

> Despliegue resumido (v011): 1) sube esta carpeta a un repo de GitHub · 2) impórtalo en Vercel · 3) crea **Vercel Postgres** en la pestaña Storage (se conecta y crea las tablas sola al redesplegar) · 4) añade `CRON_SECRET` y `NOVA_CRYPT_KEY` · 5) Redeploy. Solo GitHub + Vercel, todo gratis.

## Novedades v008 (sobre v007) — Actualización automática de la PWA

**El problema que resuelve**: con la PWA instalada (abierta desde el icono), el navegador no busca versiones nuevas del service worker porque no hay navegaciones — la app quedaba “clavada” en la versión vieja y los cambios no se veían sin borrar datos del sitio.

| # | Mejora | Detalle |
|---|--------|---------|
| 1 | **Auto-actualización real** | El panel busca versiones nuevas al abrir, al volver a la app (visibilitychange) y cada 30 min. Cuando detecta una, el nuevo SW se activa (skipWaiting) y **la página se recarga sola una vez** — sin refresco manual | ✅ |
| 2 | **Aviso de versión aplicada** | Tras recargar aparece un toast: “NOVA se actualizó a la v008 ✓” | ✅ |
| 3 | **Versión visible siempre** | La versión aparece en la barra superior (“NOVA v008”) y en el pie (“PWA v008 · actualización automática”) para verificar de un vistazo qué versión estás viendo | ✅ |
| 4 | **Limpieza de cachés viejas** | Al activarse la nueva versión se borran todas las cachés anteriores (nova-v001…v007) | ✅ |

> **Si tu PWA sigue en v007 o anterior**: ábrela y haz **una recarga manual** (desliza para refrescar, o menú del navegador → Recargar; en Chrome escritorio Ctrl+Shift+R). Esa única recarga trae el sw v008 — a partir de ahí todo se actualiza solo para siempre.

## Novedades v007 (sobre v006) — Control de tienda TiendaMax por voz

NOVA ahora gestiona el inventario real de **tiendamax.org**. La tienda vive en GitHub Pages y su base de datos es `productos.json`; el propio panel admin de TiendaMax guarda cambios con la GitHub Contents API. NOVA usa el **mismo mecanismo**:

| # | Función | Detalle |
|---|---------|---------|
| 1 | **Lectura del catálogo real** (sin token): 138 productos con stock y precios reales de tiendamax.org. Sin conexión → última copia guardada, nunca datos inventados | ✅ |
| 2 | **Escritura real con token de GitHub**: "reponer 10 batería must" → commit en `productos.json` del repo → la tienda se regenera en ~1 min. Igual que el admin oficial (GET sha → PUT) | ✅ |
| 3 | **Comandos de voz en español**: consultas ("stock de X", "stock bajo", "agotados", "catálogo") para todos; escrituras ("reponer N…", "elimina N…", "venta de N… a precio", "deja el stock de… en N") reservadas al número del dueño | ✅ |
| 4 | **Registro de ventas**: "venta de 2 baterías a 300" → descuenta stock y anota la venta (2 × $300 = $600) en el libro de ventas; si no hay stock suficiente lo dice y no registra ventas fantasma; si pides más de lo que hay, vende lo disponible y lo aclara | ✅ |
| 5 | **Modo simulación honesto** (por defecto): ensaya los comandos sin tocar la tienda; cada respuesta y cada movimiento quedan etiquetados "🧪 Simulación". Al pegar el token y apagar la simulación, todo sube de verdad | ✅ |
| 6 | **Vista Tienda en el panel**: inventario en vivo (productos, unidades, valor, stock bajo, agotados, ventas), buscador, botones rápidos +1/+5/+10/−1 y formulario de venta con precio real, bitácora de movimientos con estado de sincronización (⬆ GitHub / ◍ simulación) | ✅ |
| 7 | **Avisos "volvió el stock"**: cuando una reposición saca un producto del agotado, NOVA dispara el workflow oficial `flush-push-queue.yml` de TiendaMax para avisar a los suscriptores (mejor esfuerzo) | ✅ |
| 8 | **CSV de tienda**: inventario, movimientos y libro de ventas exportables a Excel (BOM + `;` + CRLF) | ✅ |
| 9 | **Ajustes → Conexión tienda**: usuario, repo, rama, archivo, token (probar conexión), interruptor de simulación y umbral de stock bajo. La búsqueda difusa entiende nombres parciales, sin acentos ni emojis, y pregunta cuando hay varios candidatos | ✅ |

**Cómo activar la escritura real**: Ajustes → Conexión tienda (GitHub · TiendaMax) → pega el mismo usuario/token que usa tu panel admin de TiendaMax (permiso **Contents: write**) → Probar conexión → apaga el Modo simulación. Listo: cada comando de voz se sube al repo y tu tienda se actualiza.

## Novedades v006 (sobre v005)

| # | Función | Estado |
|---|---------|--------|
| 1 | **Cerebro neuronal 🧠**: la esfera se convirtió en un cerebro vivo — silueta con red neuronal interna, neuronas satélite alrededor y sinapsis con impulsos viajeros. El color de la actividad cambia con el estado del agente (vigilancia · detectando · escuchando · procesando · respondiendo · ejecutando) | ✅ |
| 2 | **Exportar a CSV**: botones en Inicio, Conversaciones, Criptos y Métricas — conversaciones, portafolio, actividad 14 d, intenciones, alertas y recordatorios. Compatible con Excel (BOM + `;` + CRLF), solo datos reales de la base | ✅ |
| 3 | **Avisos push reales al pedir un humano**: Web Push estándar (VAPID) sin servicios externos — cuando alguien escribe "humano", el dueño recibe la notificación aunque el panel esté cerrado; además hay toast en el panel y aviso de respaldo local | ✅ |
| 4 | **Fuera la tarjeta "Estados de la esfera"**: eliminada por poca utilidad; en su lugar quedó la tarjeta **Datos y avisos** (exportar CSV + configurar avisos) | ✅ |
| 5 | **Rediseño tipográfico y de iconos**: tipografías Space Grotesk (títulos/números, tabulares) + Inter (texto) vía next/font, iconos SVG de trazo propios en navegación y botones, botones y chips con estados hover/active pulidos y copy mejorado en todo el panel | ✅ |

## Novedades v005 (sobre v004)

| # | Función | Estado |
|---|---------|--------|
| 1 | **Solo datos reales**: eliminado el generador de precios “demo”. Si CoinGecko no responde y no hay caché, el panel muestra “SIN DATOS” y el bot responde que no puede consultar el mercado — **nunca más precios inventados** | ✅ |
| 2 | **Dictado continuo 🎙**: el micro ya no se apaga solo. Modo continuous con auto-reinicio tras silencios, texto parcial en vivo y **cada frase final se envía como comando** (modo despierta-por-voz) | ✅ |
| 3 | **Modo teléfono con estilo NOVA Light**: en móvil (≤700 px) el dashboard adopta el estilo de la referencia — fondo crema, tarjetas blancas redondeadas, acento azul #2d6cdf, **nav inferior flotante tipo app**, chips y botones píldora. El escritorio conserva el tema espacial | ✅ |

## Novedades v004 (sobre v003)

| # | Función | Estado |
|---|---------|--------|
| 1 | **Responder como humano desde el panel**: escribe en *Conversaciones* y sale por WhatsApp como Dueño; el bot queda en pausa para ese contacto (se reactiva con un clic o cuando el usuario escribe "continuar") | ✅ |
| 2 | **Botones y listas interactivas de WhatsApp**: "hola" y "ayuda" muestran menús tocables (gratis en la ventana 24 h); el simulador los reproduce y los clics ejecutan el comando | ✅ |
| 4 | **Métricas del agente**: nueva vista con mensajes por día (14 d), intenciones más usadas, tiempo medio de respuesta, contactos activos y escalados | ✅ |
| 8 | **Conversor de divisas**: "100 usd a mxn", "50 euros a dolares"… con tasas en vivo (open.er-api.com + respaldo frankfurter.app/BCE, gratis y sin API key) | ✅ |

## Novedades v003 (sobre v002)

| # | Función | Estado |
|---|---------|--------|
| 2 | Comandos cripto por chat: `precio btc`, `top 10`, `portafolio`, `resumen cripto` | ✅ |
| 3 | Notas de voz: transcripción automática con IA (ASR) y respuesta | ✅ |
| 4 | Imágenes: el agente las analiza y responde (visión IA) | ✅ |
| 5 | Escalado a humano: el usuario escribe "humano" y se avisa al dueño | ✅ |
| 6 | Dashboard PWA: esfera, cripto en vivo, conversaciones, ajustes, instalable | ✅ |
| 7 | Mensajes programados: recordatorios + resumen diario de cripto | ✅ |
| 9 | Anti-spam: límite de mensajes por usuario/minuto (configurable) | ✅ |
| 10 | Modo horario: 24/7 o horario de atención con aviso automático | ✅ |
| — | WhatsApp vía **Cloud API oficial** (gratis y sin riesgo, no Baileys) | ✅ |

## Arquitectura

```
Usuario → WhatsApp → Cloud API (webhook) → Motor NOVA → Respuesta gratuita
                                          │
        ┌─────────────────────────────────┤
        ├─ Anti-spam (msg/min)            ├─ Cripto (CoinGecko, caché 60s)
        ├─ Modo horario (24/7 u horario)  ├─ IA conversacional (GLM)
        ├─ Notas de voz (ASR)             ├─ Imágenes (visión IA)
        ├─ Escalado a humano → dueño      ├─ Alertas de precio (cron 60s)
        ├─ Recordatorios programados      ├─ Tienda TiendaMax (GitHub Contents API)
        ├─ Trading: señales + riesgo      ├─ Sniper de nuevos listados (sim)
        └─ Todo registrado en la base     └─ PWA offline: snapshots + outbox
                   Dashboard PWA (esfera NOVA + gestión completa)
```

## Comandos que entiende el agente

```
precio btc · precio ethereum     → precio en vivo + tu posición
top 10                           → mejores y peores del día
portafolio                       → valor total y desglose
resumen cripto                   → resumen del mercado
alerta eth >= 4000               → crea alerta (avisa por WhatsApp)
alertas · borrar alerta 2        → gestionar alertas
100 usd a mxn                    → conversión de divisas en vivo
50 euros a dolares · 200 gbp a eur
cuanto son 100 dolares en pesos mexicanos
recordar llamar a Ana a las 15:00
recordar gym a las 7 am mañana
recordar tomar agua a las 9 todos los dias
stock de batería must            → existencias de tiendamax.org
reponer 10 batería must          → suma stock (dueño)
venta de 2 batería a 300         → registra venta (dueño)
estado trading                   → motor, modo y posiciones (v010)
señal btc · analiza eth          → señal técnica con score (v010)
activar trading · pausar trading → motor del trading (dueño, v010)
compra btc · vende eth           → orden manual sim/testnet (dueño, v010)
resumen operaciones              → últimas operaciones y PnL (v010)
humano / operador                → escalado a persona real
hola / ayuda                     → menú interactivo con botones y listas
continuar                        → vuelve con el bot tras el modo humano
(cualquier otra cosa)            → conversación natural con IA

OFFLINE (sin conexión, motor local v010):
precio btc · portafolio · stock bajo · estado · operaciones
reponer/elimina/venta … y recordar … → se apuntan y se sincronizan solos
```

## Puesta en marcha

```bash
bun install
bun run db:push      # crea la base de datos SQLite
bun run dev          # http://localhost:3000
```

Sin configurar nada, NOVA arranca en **modo simulador**: prueba el agente completo desde el dashboard (vista *Agente*).

## Conectar WhatsApp real (gratis y sin riesgo)

1. Crea una app gratuita en **developers.facebook.com** → añade el producto **WhatsApp**.
2. Copia el **Token de acceso** (permanente) y el **Phone Number ID**.
3. Pégalo en el dashboard → **Ajustes → Conexión WhatsApp** y guarda.
4. En Meta → WhatsApp → **Configuración → Webhook**:
   - URL del callback: `https://TU-DOMINIO/api/webhook/whatsapp`
   - Verify token: el que aparezca en Ajustes (por defecto `nova-verify`)
5. Suscríbete al campo **messages**. Listo: NOVA responde sola.

> Responder a usuarios que escriben primero es **gratis** (mensajes de servicio, sin límite). Solo se paga si el bot inicia conversaciones con plantillas de marketing. Al ser la vía oficial, **no hay riesgo de baneo**.

Alternativa por variables de entorno: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`.

## Estructura

```
src/
  app/
    page.tsx                  # Dashboard NOVA (esfera, vistas, PWA, offline pill)
    api/
      webhook/whatsapp/       # Webhook oficial Cloud API (GET verify + POST eventos)
      bot/simulate/           # Simulador del motor
      human-reply/            # v004: responder como humano desde el panel
      metrics/                # v004: métricas del agente
      contacts/ messages/     # Conversaciones (PATCH: pausar/reactivar bot)
      alerts/ holdings/       # Alertas de precio y portafolio
      scheduled/ settings/    # Programados y ajustes
      crypto/prices/ stats/   # Precios y resumen
      cron/tick/              # v009: ciclo de tareas para cron externo (CRON_SECRET)
      trading/                # v010: status·settings·activate·pause·history·eval·backtest·signals·sniper
  components/nova/            # Esfera, vistas del dashboard (+ TradingView v010)
  lib/nova/
    engine.ts                 # MOTOR: intenciones, menús, pausa-humano, métricas, trading
    ai.ts                     # GLM (chat) + ASR (voz) + VLM (imágenes)
    fx.ts                     # v004: conversor de divisas (er-api + frankfurter)
    prices.ts                 # CoinGecko + catálogo + formato (solo datos reales)
    guard.ts                  # Anti-spam + modo horario
    notify.ts                 # Entrega (texto/interactivos) + intent/latencia
    scheduler.ts              # Cron: alertas, recordatorios, resumen, trading, sniper
    whatsapp.ts               # Adaptador Cloud API (texto + botones/listas)
    settings.ts               # Ajustes y personalidades
    exchange.ts               # v010: conector Binance REST (público + HMAC) + rate limit
    analysis.ts               # v010: RSI/EMA/MACD/volumen + señales + backtest
    trading.ts                # v010: motor de riesgo, posiciones, TradeLog, tick
    sniper.ts                 # v010: nuevos listados con checks anti-riesgo (sim)
    seal.ts                   # v010: AES-256-GCM para API keys del exchange
    lazyTick.ts               # v011: tick perezoso (empuja tareas con cada mensaje/refresco)
    offline.ts                # v010 (cliente): snapshots, outbox y motor local offline
    shop.ts csv.ts push.ts    # Tienda TiendaMax, CSV Excel, Web Push VAPID
prisma/schema.prisma          # + TradingConfig, ExchangeCredentials, TradeLog, SniperWatch (v010)
public/                       # manifest.webmanifest, sw.js (nova-v011), iconos NOVA
```

## Historial de versiones

- **v001** — PWA base NOVA (10 vistas, voz, temas, offline).
- **v002** — Seguimiento cripto + esfera rediseñada (aurora, satélites, estados).
- **v003** — Agente WhatsApp Cloud API + motor IA + dashboard PWA con BD real.
- **v004** — Respuesta humana desde el panel (pausa de bot), menús interactivos de WhatsApp, vista de métricas y conversor de divisas.
- **v005** — Datos 100% reales (adiós al modo demo), dictado continuo por voz con auto-reinicio y modo teléfono claro estilo NOVA Light.
- **v006** — Cerebro neuronal, CSV Excel, Web Push real al pedir humano.
- **v007** — Tienda TiendaMax por voz (stock real, ventas, reposiciones, GitHub).
- **v008** — Auto-actualización de la PWA + anti-caché del SW.
- **v009** — Listo para GitHub + Vercel (endpoint cron idempotente, esquema Postgres, guía completa).
- **v010** — Trading automatizado (simulación por defecto, señales, riesgo, backtest, sniper) + modo offline con comandos locales y outbox.
- **v011** — 100% GitHub + Vercel (Vercel Postgres integrado, cron nativo en vercel.json, ticks perezosos, tablas automáticas en el build).
- **v012** — Panel rediseñado: masonry sin huecos, tarjetas que se acoplan a la pantalla, diseño pro (iconos por módulo, badges de estado, pasos numerados), modo claro y oscuro con botón en la barra superior.
- **v013** — FIX de despliegues en Vercel: paquetes de build en `dependencies`, `postcss.config.mjs` y `package-lock.json` incluidos en el paquete. Adiós al `Module not found` en `globals.css`.
- **v014** (esta) — Autodiagnóstico: si falta la base de datos en Vercel, el panel muestra un aviso ámbar con los pasos exactos (Storage → Connect → Redeploy) en vez de quedar vacío sin explicación. Endpoint `/api/health` con recheck cada 60 s.
