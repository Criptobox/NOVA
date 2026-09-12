import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { csvResponse, stamp, toCsv } from '@/lib/nova/csv';

export const dynamic = 'force-dynamic';

/* v010 — Historial de operaciones. ?format=csv → descarga Excel-compatible. */
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get('format');
  const take = Math.min(parseInt(req.nextUrl.searchParams.get('take') || '200', 10) || 200, 1000);
  const rows = await db.tradeLog.findMany({ orderBy: { createdAt: 'desc' }, take });

  if (format === 'csv') {
    const fmt = (d: Date) => d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });
    const csv = toCsv(
      ['fecha', 'par', 'lado', 'precio', 'cantidad', 'total_usdt', 'resultado_usdt', 'modo', 'razon', 'estado'],
      rows.map(t => [
        fmt(t.createdAt), t.symbol, t.side === 'BUY' ? 'compra' : 'venta',
        t.price, t.qty, t.quoteQty, t.result ?? '', t.mode, t.reason, t.status,
      ]),
    );
    return csvResponse(`nova-trading-${stamp()}.csv`, csv);
  }
  return NextResponse.json({
    ok: true,
    trades: rows.map(t => ({ ...t, createdAt: t.createdAt.toISOString() })),
  });
}
