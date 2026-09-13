import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { NOVA_VERSION } from '@/components/nova/SwRegister';

export const dynamic = 'force-dynamic';

/* v015 — Diagnóstico de la base de datos con causa exacta.
   El panel lo consulta al abrir y cada 60 s y ajusta el aviso:
   · reason 'no_url'  → DATABASE_URL no llega a este despliegue (base sin conectar al proyecto)
   · reason 'bad_url' → DATABASE_URL existe pero es inválida (comillas / formato)
   · reason 'refused' → existe pero no responde (creada hace segundos, espera/Redeploy)
   · reason 'tables'  → BD conectada y responde, pero faltan tablas → falta Redeploy
   Nunca se expone el valor de DATABASE_URL, solo si está presente. */

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
  const urlSet = !!process.env.DATABASE_URL;
  let up = false;
  let tables = false;
  let reason: Reason = 'no_url';
  if (!urlSet) {
    reason = 'no_url';
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
        reason = 'tables';
      }
    }
  }
  return NextResponse.json(
    { ok: true, db: up, tables, url: urlSet ? 'set' : 'missing', reason, version: NOVA_VERSION },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
