# 🚀 NOVA v013 — Despliegue SOLO con GitHub + Vercel (todo gratis)

> Esta guía usa **ÚNICAMENTE GitHub y Vercel**. GitHub guarda el código; Vercel ejecuta la aplicación **y también la base de datos** (Vercel Postgres, que se crea desde el propio panel de Vercel). No necesitas crear cuenta en ningún otro sitio. El modo offline de la PWA va incluido.

---

## 0) Cómo corre NOVA con solo GitHub + Vercel

| Pieza | Dónde vive | Qué hace | Coste |
|-------|-----------|----------|-------|
| Código | **GitHub** | Guarda tu repo; cada cambio = nueva versión desplegada | Gratis |
| Aplicación | **Vercel** | Ejecuta el servidor de NOVA (webhooks de WhatsApp, APIs, trading, panel PWA) con dominio `https://TU-APP.vercel.app` | Gratis (Hobby) |
| Base de datos | **Vercel Postgres** (pestaña Storage de tu proyecto) | Guarda conversaciones, inventario, cripto, trading… Se crea y conecta desde el MISMO panel | Gratis |
| Tareas programadas | **Vercel Cron** (incluido, ya configurado en `vercel.json`) + **ticks perezosos** | Barrido diario automático + ejecución de tareas con cada mensaje de WhatsApp y cada refresco del panel | Gratis |

⚠️ **Importante**: NO lo subas a **GitHub Pages** — Pages solo sirve archivos estáticos y NOVA es una aplicación de servidor (por eso antes veías el README/v002). Con **Vercel** sí corre todo.

💡 **Honestidad sobre los recordatorios**: en el plan gratis, el cron interno de Vercel hace un barrido **1 vez al día**. Por eso NOVA además ejecuta las tareas vencidas **con cada mensaje de WhatsApp que recibe** y **con cada refresco del panel** (cada 60 s mientras lo tienes abierto). En la práctica: si usas NOVA, todo sale al momento. Si quieres que un recordatorio de las "14:32" llegue a las 14:32 exactas con el panel cerrado y sin mensajes entrantes, puedes añadir un cron externo gratis (opcional) — **Paso 7**.

---

## 1) Crea las cuentas (3 min, todas gratis)

1. **github.com** → Sign up
2. **vercel.com** → Sign up **con GitHub** (recomendado: así Vercel ve tus repos)

## 2) Sube NOVA a GitHub (5 min)

1. En GitHub: botón **New repository** → nombre: `nova-agent` → **Private** → Create.
2. En la página del repo vacío pulsa **"uploading an existing file"** (subir archivos).
3. Arrastra **TODO el contenido** de esta carpeta (los archivos del zip: `src/`, `public/`, `prisma/`, `package.json`, `vercel.json`, `setup.sql`, etc. — **NO el zip en sí**).
4. **Commit changes** (botón verde). Espera a que termine de subir.

## 3) Importa el proyecto en Vercel (3 min)

1. En Vercel: **Add New… → Project** → localiza `nova-agent` → **Import**.
2. En "Configure Project" NO toques nada (el build ya está configurado en `vercel.json`) → pulsa **Deploy**.
3. El primer deploy puede quedar funcionando pero **sin datos** (falta la base de datos). Es normal — el Paso 4 lo arregla.

## 4) Crea la base de datos DENTRO de Vercel (3 min)

1. En tu proyecto de Vercel: pestaña **Storage** → **Create Database** → **Postgres (Neon)** → nombre `nova` → **Create & Continue**.
2. Cuando te ofrezca **Connect Project**, selecciona tu proyecto `nova-agent` y conecta — Vercel añade `DATABASE_URL` automáticamente (no se toca a mano).
3. Ve a **Deployments** → en el último deploy pulsa **⋯ → Redeploy** → confirm.
4. En este segundo deploy, el build ejecuta `prisma db push` y **crea las 13 tablas solas** (conversaciones, cripto, tienda TiendaMax y las 4 del trading). Ya no hay que pegar SQL.
   - **Plan B** (si prefieres crearlas a mano): Storage → tu base → pestaña **Query** → pega el contenido completo de `setup.sql` → **Run**. Es idempotente (lo puedes pegar dos veces sin romper nada).

## 5) Variables de entorno (2 min)

Project → **Settings → Environment Variables**. Añade SIN comillas (valen para Production, Preview y Development):

| Variable | Valor |
|----------|-------|
| `CRON_SECRET` | **Recomendada** — inventa una frase larga única. El Cron de Vercel la usa automáticamente (cabecera Bearer) y así solo tú puedes llamar al cron |
| `NOVA_CRYPT_KEY` | **Recomendada** — otra frase larga. Cifra con AES-256-GCM las API keys del exchange |
| `WHATSAPP_TOKEN` | Opcional aquí (o desde el panel: Ajustes) |
| `WHATSAPP_PHONE_ID` | Opcional aquí (o desde el panel: Ajustes) |
| `WHATSAPP_VERIFY_TOKEN` | Opcional aquí (o desde el panel: Ajustes) |

> `DATABASE_URL` NO se añade a mano: la creó Vercel Postgres en el Paso 4.

→ Después de guardarlas, haz **Redeploy** (Deployments → ⋯ → Redeploy) para que se apliquen.

## 6) Conecta WhatsApp (5 min, opcional — sin esto funciona el simulador)

1. Abre tu panel: `https://TU-APP.vercel.app` → **Ajustes** → pega `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` y `WHATSAPP_VERIFY_TOKEN` (o déjalos en las variables de entorno).
2. En Meta for Developers → WhatsApp → **Configuration** → Callback URL: `https://TU-APP.vercel.app/api/webhook/whatsapp` · Verify token: el mismo `WHATSAPP_VERIFY_TOKEN` → **Verify and save**.
3. Suscribe el campo **messages**. Envía un mensaje de prueba a tu número → NOVA responde solo.

## 7) OPCIONAL — recordatorios con precisión de minuto

Solo si quieres que recordatorios/alertas salgan a la hora exacta **aunque no uses NOVA en horas**:

1. Crea cuenta gratis en **cron-job.org**.
2. Crea un cron: cada 5 minutos → GET → `https://TU-APP.vercel.app/api/cron/tick?token=TU_CRON_SECRET`.
3. Listo. (Sin este paso, Vercel Cron + ticks perezosos ya cubren el uso normal.)

## 8) Instala la PWA en tu teléfono (2 min)

1. Abre `https://TU-APP.vercel.app` en Chrome del móvil.
2. Menú ⋮ → **"Añadir a pantalla de inicio"** (Instalar app).
3. Si antes instalaste la versión vieja de GitHub Pages: **borra ese icono** e instala desde la URL nueva de Vercel. El **modo offline** ya funciona: abre la app sin internet y verás el banner ámbar con los comandos locales disponibles.

---

## Actualizaciones futuras

- Cambia archivos en el repo de GitHub (upload o edición web) → Vercel **redespliega solo** y la PWA se actualiza sola (el service worker avisa con un toast "NOVA vXXX lista").
- No hay nada que borrar a mano: la base de datos y las variables persisten entre versiones.

## Problemas frecuentes

| Síntoma | Causa y solución |
|---------|------------------|
| Build falla: `Module not found ... ./src/app/globals.css` (o `tw-animate-css`) | Tu repo tiene archivos de una versión antigua. Sube **TODOS** los archivos de este zip reemplazando los anteriores (clave: `package.json`, `package-lock.json`, `postcss.config.mjs`) y **Redeploy**. Si en Vercel → Settings → Environment Variables existe `NODE_ENV=production`, puedes dejarla: esta versión instala los paquetes de build igualmente |
| Build falla: "Environment variable not found: DATABASE_URL" | Falta el Paso 4: crea el Postgres en Storage, conéctalo al proyecto y **Redeploy** |
| La app abre pero las APIs dan error 500 | Faltan las tablas: repite el Paso 4 (Redeploy) o pega `setup.sql` en la pestaña Query |
| No llegan recordatorios a la hora exacta | Normal en el plan gratis si nadie abre nada: añade el Paso 7 (opcional) |
| El webhook de Meta da error de verificación | `WHATSAPP_VERIFY_TOKEN` debe ser IDÉNTICO en Meta y en Vercel/panel |
| Sigo viendo el README o "v002" | Estás abriendo GitHub Pages — usa `https://TU-APP.vercel.app` |
| Cambié algo en GitHub y no se ve | Espera el redespliegue (pestaña Deployments) y recarga; la PWA avisa con el toast de actualización |
