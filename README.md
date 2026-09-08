# NOVA v007 — Agente WhatsApp + Cripto + Tienda (PWA)

NOVA es un agente inteligente que **atiende usuarios por WhatsApp** usando la **API oficial de Meta (Cloud API)** — la vía **100% gratis para responder a tus usuarios (mensajes de servicio) y sin riesgo de baneo** — con seguimiento de criptomonedas en vivo, **control por voz de tu tienda TiendaMax**, alertas de precio, recordatorios, notas de voz, análisis de imágenes y un **dashboard PWA instalable** con el cerebro neuronal de NOVA.

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
        └─ Recordatorios programados      └─ Todo registrado en SQLite
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
humano / operador                → escalado a persona real
hola / ayuda                     → menú interactivo con botones y listas
continuar                        → vuelve con el bot tras el modo humano
(cualquier otra cosa)            → conversación natural con IA
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
    page.tsx                  # Dashboard NOVA (esfera, vistas, PWA)
    api/
      webhook/whatsapp/       # Webhook oficial Cloud API (GET verify + POST eventos)
      bot/simulate/           # Simulador del motor
      human-reply/            # v004: responder como humano desde el panel
      metrics/                # v004: métricas del agente
      contacts/ messages/     # Conversaciones (PATCH: pausar/reactivar bot)
      alerts/ holdings/       # Alertas de precio y portafolio
      scheduled/ settings/    # Programados y ajustes
      crypto/prices/ stats/   # Precios y resumen
  components/nova/            # Esfera, vistas del dashboard (+ MetricsView)
  lib/nova/
    engine.ts                 # MOTOR: intenciones, menús, pausa-humano, métricas
    ai.ts                     # GLM (chat) + ASR (voz) + VLM (imágenes)
    fx.ts                     # v004: conversor de divisas (er-api + frankfurter)
    prices.ts                 # CoinGecko + catálogo + formato (solo datos reales)
    guard.ts                  # Anti-spam + modo horario
    notify.ts                 # Entrega (texto/interactivos) + intent/latencia
    scheduler.ts              # Cron: alertas, recordatorios, resumen diario
    whatsapp.ts               # Adaptador Cloud API (texto + botones/listas)
    settings.ts               # Ajustes y personalidades
prisma/schema.prisma          # Contactos (+botPaused), mensajes (+intent/latency)
public/                       # manifest.webmanifest, sw.js (nova-v005), iconos NOVA
```

## Historial de versiones

- **v001** — PWA base NOVA (10 vistas, voz, temas, offline).
- **v002** — Seguimiento cripto + esfera rediseñada (aurora, satélites, estados).
- **v003** — Agente WhatsApp Cloud API + motor IA + dashboard PWA con BD real.
- **v004** — Respuesta humana desde el panel (pausa de bot), menús interactivos de WhatsApp, vista de métricas y conversor de divisas.
- **v005** (esta) — Datos 100% reales (adiós al modo demo), dictado continuo por voz con auto-reinicio y modo teléfono claro estilo NOVA Light.
