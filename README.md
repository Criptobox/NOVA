# NOVA — Agente Personal de Voz · PWA v002

Tu mockup convertido en una **PWA real**: instalable, funciona sin conexión, con voz (Web Speech API), datos persistentes en tu dispositivo y actualizaciones automáticas.

## 📁 Estructura del paquete

```
NOVA_PWA/
├── index.html          → Aplicación (SPA con 11 vistas)
├── styles.css          → Sistema de diseño (temas, responsive, animaciones)
├── app.js              → Núcleo: voz, estados, router, instalación, ajustes
├── views.js            → Vistas dinámicas + motor de intenciones local
├── crypto.js           → Seguimiento cripto: precios, portafolio, alertas
├── sw.js               → Service Worker (offline + actualizaciones)
├── manifest.json       → Manifiesto PWA (íconos, atajos, colores)
├── offline.html        → Página de respaldo sin conexión
├── icons/              → Íconos 192/512, maskable, apple-touch y favicon
└── README.md           → Este archivo
```

## 🚀 Probar en local (2 minutos)

Un service worker **requiere HTTPS o localhost**. Opciones:

**Opción A — Python (viene en tu computadora):**
```bash
cd NOVA_PWA
python -m http.server 8080
# abre http://localhost:8080
```

**Opción B — Node.js:**
```bash
npx serve NOVA_PWA
```

> ⚠️ Si abres `index.html` con doble clic (file://) la app funciona pero sin modo offline ni instalación.

## 📲 Instalar como app

- **Android (Chrome):** botón verde “⬇ Instalar app” en la barra superior, o menú ⋮ → “Instalar aplicación”.
- **iPhone/iPad (Safari):** botón Compartir → “Añadir a pantalla de inicio”.
- **Windows/Mac (Chrome/Edge):** ícono de instalación en la barra de direcciones, o el botón “Instalar app”.

## 🌍 Publicar gratis (elige una)

| Servicio | Cómo |
|----------|------|
| **Netlify Drop** | Entra a app.netlify.com/drop y arrastra la carpeta. URL HTTPS instantánea. |
| **Vercel** | `npx vercel` dentro de la carpeta. |
| **GitHub Pages** | Sube la carpeta a un repo → Settings → Pages. |
| **Firebase Hosting** | `firebase init hosting` → `firebase deploy`. |

Al publicar una nueva versión: **sube los archivos con otro nombre de caché en `sw.js`** (ej. `nova-v003`) — los usuarios verán el aviso “Nueva versión disponible” automáticamente.

## 🎙 Comandos de voz (motor local)

- “¿Cómo van las ventas?” · “¿Qué tareas tengo pendientes?” · “¿Qué tengo hoy en la agenda?”
- “**Agrega tarea** comprar empaque” · “**Recuerda que** mi cliente pide factura”
- “**Abre** calendario / tareas / tiendamax / criptos…” · “Cambia al tema aurora”
- “**Precio de bitcoin**” · “¿**Cómo van mis criptos**?” · “¿Cuánto vale ethereum?”
- “Qué hora es” · “Cuéntame un chiste” · “Ayuda”

El reconocimiento de voz (Web Speech API) funciona en **Chrome, Edge y Safari**; requiere internet para transcribir. La voz de NOVA (síntesis) funciona también offline en la mayoría de sistemas.

## ⚙️ Ajustes

Menú ⚙ (barra superior): wake word editable, voz del sistema, velocidad, personalidad (profesional/casual/creativa/técnica), tema, exportar respaldo JSON y borrar datos.

## 📝 Notas de la versión v002

- **Nuevo: Cripto seguimiento** — precios en vivo vía CoinGecko (público, sin claves API), portafolio local con valor total y cambio 24 h, sparklines de 7 días, mejores/peores del día, añadir/quitar hasta 30 monedas del catálogo y **alertas de precio** con toast y notificación.
- **Nuevo: comandos de voz cripto** — “precio de bitcoin”, “¿cómo van mis criptos?”, “abre criptos”.
- **Nuevo: tarjeta cripto en Inicio** — valor de tu portafolio y top 3 del día.
- **Esfera rediseñada** — nueva nebulosa interior giratoria, aurora cónica, 2 satélites en órbita, partículas de energía, brillo de cristal y **color por estado** (verde escuchando, violeta pensando, cian hablando, ámbar ejecutando) + efecto de inclinación 3D con el puntero.
- **Corregido** — faltaban 4 animaciones CSS en v001 (`breathe`, `wave`, `spin`, `bars`): la esfera no respiraba, los anillos no latían y el animador de voz estaba estático. Ahora todo anima.

## 📝 Notas de la versión v001

- 10 vistas funcionales: Inicio, Conversación, Memoria, Calendario, Tareas, Automatizaciones, Archivos, Tiendamax, Navegador, Plugins.
- Datos persistentes en `localStorage` (semilla de demo incluida; puedes borrarla en ⚙ → “Borrar todos los datos”).
- Modo Wake Word **experimental** (escucha continua; para producción se recomienda Porcupine/TinyML — ver guía PDF).
- Análisis de archivos 100% local (colores dominantes, brillo, conteo de palabras).
- El clima y los pedidos de Tiendamax siguen siendo datos demo hasta conectar backend.
