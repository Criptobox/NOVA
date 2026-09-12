import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { NOVA_VERSION } from '@/components/nova/SwRegister';

export const dynamic = 'force-dynamic';

/* v014 — Diagnóstico: ¿la base de datos responde?
   El panel lo consulta al abrir y cada 60 s. Si la BD no está conectada
   (p. ej. Vercel Postgres aún sin crear/conectar) muestra un aviso con los
   pasos exactos en vez de dejar los apartados vacíos sin explicación. */
export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  return NextResponse.json({ ok: true, db: dbOk, version: NOVA_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
}
