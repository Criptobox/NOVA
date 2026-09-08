import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* v007 — Bitácora de movimientos de stock y ventas */
export async function GET() {
  const moves = await db.stockMove.findMany({ orderBy: { createdAt: 'desc' }, take: 60 });
  const ventas = await db.stockMove.aggregate({
    where: { kind: 'venta' },
    _count: { id: true },
    _sum: { total: true },
  });
  return NextResponse.json({
    ok: true,
    ventas: { count: ventas._count.id, total: +(ventas._sum.total || 0).toFixed(2) },
    moves: moves.map(m => ({
      id: m.id, extId: m.extId, nombre: m.nombre, kind: m.kind, delta: m.delta,
      before: m.before, after: m.after, qty: m.qty, unitPrice: m.unitPrice, total: m.total,
      currency: m.currency, note: m.note, source: m.source, sync: m.sync,
      commitUrl: m.commitUrl, createdAt: m.createdAt,
    })),
  });
}
