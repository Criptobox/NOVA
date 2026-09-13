// NOVA v016 — Cliente Prisma con AUTOCURACIÓN de la base de datos.
// · Acepta los nombres de variables de TODAS las integraciones de Vercel:
//   DATABASE_URL · POSTGRES_PRISMA_URL · POSTGRES_URL · DATABASE_URL_UNPOOLED
//   · POSTGRES_URL_NON_POOLING · DIRECT_URL  (Vercel Postgres clásico crea
//   POSTGRES_*; la plantilla Neon actual crea DATABASE_URL; Prisma solo mira
//   DATABASE_URL → si no está, la rellenamos aquí solos).
// · Normaliza la URL: quita comillas/espacios pegados al pegarla, añade
//   sslmode=require en remoto y pgbouncer=true en conexiones por pooler.
// · Crea las tablas SOLO en el primer uso (DDL idempotente) — el build de
//   Vercel ya NO toca la base de datos y el log de deploy queda limpio.
// · Siembra los ajustes base (Setting «nova» + TradingConfig «trading»).
import { PrismaClient } from '@prisma/client'
import { NOVA_DDL, NOVA_SEED, NOVA_DDL_ALWAYS } from './ddl'

export type DbInfo = {
  dialect: 'postgres' | 'sqlite' | 'none'
  urlVar: string | null // NOMBRE de la variable detectada (nunca su valor)
  host: string | null // solo host:puerto, sin credenciales
  pooled: boolean
}

function limpiar(v: string): string {
  return v.trim().replace(/^["'`]+|["'`]+$/g, '')
}

/* Añade los parámetros que Vercel/Neon exigen y a veces no traen:
   · sslmode=require en cualquier host remoto (Prisma no conecta sin SSL)
   · pgbouncer=true cuando la conexión pasa por un pooler (puerto 6543 o
     host «…pooler…») — sin él, Prisma choca con PgBouncer. */
function normalizar(url: string): string {
  const m = /^(postgres(?:ql)?:\/\/[^@/]*@)([^/?]+)(\/[^?]*)?(\?.*)?$/i.exec(url)
  if (!m) return url
  const host = m[2]
  const q = m[4] || ''
  const extra: string[] = []
  const esRemota = !/^(localhost|127\.0\.0\.1|\[::1\])/i.test(host)
  if (esRemota && !/sslmode=/i.test(q)) extra.push('sslmode=require')
  if ((/:6543/.test(host) || /pooler/i.test(host)) && !/pgbouncer=/i.test(q)) extra.push('pgbouncer=true')
  if (!extra.length) return url
  return m[1] + host + (m[3] || '') + (q ? q + '&' + extra.join('&') : '?' + extra.join('&'))
}

/* Orden de búsqueda: primero las que ya trae el proyecto, luego las que crea
   cada integración de Vercel (POSTGRES_* = Vercel Postgres/Supabase;
   DATABASE_URL / DATABASE_URL_UNPOOLED = plantilla Neon actual). */
const CANDIDATAS = [
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL',
  'DATABASE_URL_UNPOOLED',
  'POSTGRES_URL_NON_POOLING',
  'DIRECT_URL',
] as const

function resolver(): { url: string; urlVar: string } | null {
  for (const nombre of CANDIDATAS) {
    const cruda = process.env[nombre]
    if (!cruda) continue
    const v = limpiar(cruda)
    if (!/^postgres(?:ql)?:\/\//i.test(v)) continue // file: (SQLite de desarrollo) u otra cosa
    return { url: normalizar(v), urlVar: nombre }
  }
  return null
}

const resuelta = resolver()

/* Varias copias del módulo pueden evaluarse en el mismo proceso (Next bundling).
   La primera resuelve y asigna process.env.DATABASE_URL; las siguientes verían
   ya asignada esa variable y reportarían mal el NOMBRE original. Lo congelamos
   en globalThis para que el diagnóstico diga siempre la variable real. */
const gNombres = globalThis as unknown as { novaUrlVar?: string }
if (resuelta) {
  if (gNombres.novaUrlVar) resuelta.urlVar = gNombres.novaUrlVar
  else gNombres.novaUrlVar = resuelta.urlVar
}

export const dbInfo: DbInfo = (() => {
  if (!resuelta) {
    const dev = process.env.DATABASE_URL?.trim().startsWith('file:') ? 'sqlite' : 'none'
    return { dialect: dev, urlVar: dev === 'sqlite' ? 'DATABASE_URL' : null, host: null, pooled: false }
  }
  let host: string | null = null
  try {
    const u = new URL(resuelta.url)
    host = `${u.hostname}${u.port ? ':' + u.port : ''}`
  } catch { host = null }
  return {
    dialect: 'postgres',
    urlVar: resuelta.urlVar,
    host,
    pooled: /pooler/i.test(resuelta.url) || /pgbouncer=true/i.test(resuelta.url) || /:6543/.test(resuelta.url),
  }
})()

/* Si Prisma espera DATABASE_URL y Vercel solo creó POSTGRES_URL (u otro
   nombre), la rellenamos solos — el usuario no toca nada. */
if (resuelta && process.env.DATABASE_URL !== resuelta.url) {
  process.env.DATABASE_URL = resuelta.url
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  novaListo?: boolean
  novaInflight?: Promise<{ ok: boolean; error?: string }>
  novaCooldown?: number
}

const plain = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'],
})
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = plain

type EnsureRes = { ok: boolean; error?: string }

/* Crea tablas + ajustes base UNA vez por instancia (idempotente).
   · force=true → re-intenta aunque ya se hubiera hecho (lo usa /api/health)
   · Si la BD no responde, deja un enfriamiento de 10 s para no martillar. */
export async function ensureDb(force = false): Promise<EnsureRes> {
  if (dbInfo.dialect !== 'postgres') return { ok: true } // SQLite local: ya está lista
  if (force) {
    globalForPrisma.novaListo = false
    globalForPrisma.novaCooldown = 0
  }
  if (globalForPrisma.novaListo) return { ok: true }
  if (globalForPrisma.novaInflight) return globalForPrisma.novaInflight
  if (Date.now() < (globalForPrisma.novaCooldown || 0)) return { ok: false, error: 'cooldown' }
  globalForPrisma.novaInflight = (async (): Promise<EnsureRes> => {
    try {
      await plain.$queryRaw`SELECT 1` // prueba de conectividad (un solo intento)
    } catch (e) {
      globalForPrisma.novaCooldown = Date.now() + 10000
      return { ok: false, error: String((e as Error)?.message || e).slice(0, 200) }
    }
    let yaHayTablas = false
    try {
      await plain.$queryRaw`SELECT 1 FROM "Setting" LIMIT 1`
      yaHayTablas = true
    } catch { /* tablas ausentes → crearlas */ }
    if (!yaHayTablas) {
      for (const sql of NOVA_DDL) {
        try {
          await plain.$executeRawUnsafe(sql)
        } catch (e) {
          const m = String((e as Error)?.message || e)
          if (!/already exists|duplicate/i.test(m)) {
            globalForPrisma.novaCooldown = Date.now() + 10000
            return { ok: false, error: m.slice(0, 200) }
          }
        }
      }
      for (const sql of NOVA_SEED) {
        try {
          await plain.$executeRawUnsafe(sql)
        } catch (e) {
          const m = String((e as Error)?.message || e)
          if (!/duplicate/i.test(m)) {
            globalForPrisma.novaCooldown = Date.now() + 10000
            return { ok: false, error: m.slice(0, 200) }
          }
        }
      }
    }
    // v018 — migraciones aditivas: corren siempre (tabla nueva o ya existente)
    // para que una instalación viva reciba columnas nuevas sin perder datos.
    for (const sql of NOVA_DDL_ALWAYS) {
      try {
        await plain.$executeRawUnsafe(sql)
      } catch (e) {
        console.error('[NOVA ddl] migración aditiva falló:', String((e as Error)?.message || e).slice(0, 200))
      }
    }
    globalForPrisma.novaListo = true
    return { ok: true }
  })().finally(() => {
    globalForPrisma.novaInflight = undefined
  })
  return globalForPrisma.novaInflight
}

/* Extensión: TODA operación de modelo espera a que las tablas existan.
   Así ninguna API «llega antes» que la creación automática, pase lo que
   pase en el deploy. Las consultas crudas ($queryRaw) no pasan por aquí:
   las pocas que hay (health) llaman a ensureDb() explícitamente. */
export const db = plain.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        await ensureDb()
        return query(args)
      },
    },
  },
}) as unknown as PrismaClient
