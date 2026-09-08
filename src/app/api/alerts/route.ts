import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPrices } from '@/lib/nova/prices';

export const dynamic = 'force-dynamic';

export async function GET() {
  const alerts = await db.priceAlert.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  const { rows } = await getPrices();
  return NextResponse.json({
    ok: true,
    alerts: alerts.map(a => {
      const r = rows.find(x => x.id === a.coinId);
      return { ...a, currentPrice: r?.price ?? null, chg: r?.chg ?? null };
    }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const coinId = String(b?.coinId || '');
    const dir = b?.dir === 'below' ? 'below' : 'above';
    const price = Number(b?.price);
    if (!coinId || !(price > 0)) return NextResponse.json({ ok: false, error: 'coinId y price son obligatorios' }, { status: 400 });
    const sym = String(b?.sym || coinId.slice(0, 3).toUpperCase());
    const a = await db.priceAlert.create({ data: { coinId, sym, dir, price, createdBy: b?.createdBy || null } });
    return NextResponse.json({ ok: true, alert: a });
  } catch {
    return NextResponse.json({ ok: false, error: 'datos inválidos' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const id = String(b?.id || '');
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });
    const a = await db.priceAlert.update({
      where: { id },
      data: { fired: false, on: true, firedAt: null },
    });
    return NextResponse.json({ ok: true, alert: a });
  } catch {
    return NextResponse.json({ ok: false, error: 'no se pudo rearmar' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });
  await db.priceAlert.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
