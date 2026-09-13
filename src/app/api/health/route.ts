import { NextResponse } from 'next/server';
import { db, ensureDb, dbInfo } from '@/lib/db';
import { NOVA_VERSION } from '@/components/nova/SwRegister';

export const dynamic = 'force-dynamic';

/* v016 — Diagnóstico de la base de datos con causa exacta + AUTOCURACIÓN.
   Si la BD responde pero faltan tablas, se crean AQUÍ MISMO (DDL idempotente):
   ya no dependen del build de Vercel → basta abrir el panel.
   reason:
   · ok      → todo listo (autoFix=true si las tablas se crearon en esta llamada)
   · no_url  → Vercel no pasó NINGUNA variable de conexión al despliegue
   · bad_url → la URL existe pero es inválida (comillas/formato/autenticación)
   · refused → la URL existe pero el servidor no responde (o BD inexistente)
   · tables  → BD responde pero las tablas no se pudieron crear (permisos)
   Nunca se exponen valores: solo el NOMBRE de la variable y el host. */

type Reason = 'ok' | 'no_url' | 'bad_url' | 'refused' | 'tables';

function classify(e: unknown): Reason {
  const msg = String((e as { message?: string })?.message || e || '');
  const code = String((e as { code?: string })?.code || '');
  const all = msg + ' ' + code;
  /* P1012 = URL/protocolo/schema inválido; P1000 = autenticación → bad_url.
     P1001 (no se alcanza el servidor), P1003 (la BD no existe), timeouts… → refused */
  if (/P1012|must start with|protocol|P1000|Authentication failed/i.test(all)) return 'bad_url';
  return 'refused';
}

export async function GET() {
  const info = dbInfo;
  let up = false;
  let tables = false;
  let autoFix = false;
  let reason: Reason = 'refused';

  if (info.dialect === 'none') {
    reason = 'no_url';
  } else if (info.dialect === 'sqlite') {
    // Desarrollo local con SQLite: mismo chequeo, sin DDL
    try {
      await db.$queryRaw`SELECT 1 FROM "Setting" LIMIT 1`;
      up = true; tables = true; reason = 'ok';
    } catch (e) {
      reason = classify(e);
    }
  } else {
    try {
      await db.$queryRaw`SELECT 1`;
      up = true;
    } catch (e) {
      reason = classify(e);
    }
    if (up) {
      try {
        await db.$queryRaw`SELECT 1 FROM "Setting" LIMIT 1`;
        tables = true;
        reason = 'ok';
      } catch {
        // v016 — autocuración: crear tablas al vuelo y volver a comprobar
        const r = await ensureDb(true);
        if (r.ok) {
          try {
            await db.$queryRaw`SELECT 1 FROM "Setting" LIMIT 1`;
            tables = true; autoFix = true; reason = 'ok';
          } catch { reason = 'tables'; }
        } else {
          reason = 'tables';
        }
      }
    }
  }

  return NextResponse.json(
    {
      ok: true,
      db: up,
      tables,
      autoFix,
      url: info.dialect === 'none' ? 'missing' : 'set',
      envVar: info.urlVar,
      host: info.host,
      reason,
      version: NOVA_VERSION,
      adminProtected: !!process.env.ADMIN_PASSWORD, // v018: ¿el panel exige contraseña?
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
