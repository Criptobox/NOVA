import { NextResponse } from 'next/server';
import { getPrices } from '@/lib/nova/prices';

export const dynamic = 'force-dynamic';

/* Precios en vivo para el dashboard (catálogo completo). SOLO datos reales:
   live=false → sin conexión y sin caché (rows viene vacío, nada inventado). */
export async function GET() {
  const { rows, ts, live } = await getPrices();
  return NextResponse.json({ ok: true, ts, live: live && rows.length > 0, rows });
}
