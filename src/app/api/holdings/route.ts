import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPrices, symOf, nameOf } from '@/lib/nova/prices';

export const dynamic = 'force-dynamic';

export async function GET() {
  const holds = await db.holding.findMany({ orderBy: { createdAt: 'asc' } });
  const { rows } = await getPrices();
  const withPrices = holds.map(h => {
    const r = rows.find(x => x.id === h.coinId);
    return { ...h, price: r?.price ?? null, chg: r?.chg ?? null, spark: r?.spark ?? [], value: r ? h.amt * r.price : null, image: r?.image || '' };
  });
  const total = withPrices.reduce((s, h) => s + (h.value || 0), 0);
  const chgUSD = withPrices.reduce((s, h) => s + (h.value || 0) * (h.chg || 0) / 100, 0);
  return NextResponse.json({ ok: true, holdings: withPrices, total, chgUSD });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const coinId = String(b?.coinId || '').trim().toLowerCase();
    if (!coinId) return NextResponse.json({ ok: false, error: 'falta coinId' }, { status: 400 });
    const amt = Number.isFinite(Number(b?.amt)) ? Number(b.amt) : 0;
    // v019 — sym/name pueden venir del buscador (cualquier moneda de
    // CoinGecko, no solo el catálogo curado); si no llegan, se derivan
    // del catálogo local o, en último caso, del propio id.
    const sym = typeof b?.sym === 'string' && b.sym.trim() ? b.sym.trim().slice(0, 12).toUpperCase() : symOf(coinId);
    const name = typeof b?.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 80) : nameOf(coinId);
    const h = await db.holding.upsert({
      where: { coinId },
      update: { amt },
      create: { coinId, sym, name, amt },
    });
    return NextResponse.json({ ok: true, holding: h });
  } catch {
    return NextResponse.json({ ok: false, error: 'datos inválidos' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const coinId = req.nextUrl.searchParams.get('coinId');
  if (!coinId) return NextResponse.json({ ok: false, error: 'falta coinId' }, { status: 400 });
  await db.holding.delete({ where: { coinId } }).catch(() => null);
  await db.priceAlert.deleteMany({ where: { coinId } });
  return NextResponse.json({ ok: true });
}
