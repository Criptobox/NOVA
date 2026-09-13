import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getPrices, symOf, nameOf } from '@/lib/nova/prices';

export const dynamic = 'force-dynamic';

export async function GET() {
  const holds = await db.holding.findMany({ orderBy: { createdAt: 'asc' } });
  const { rows } = await getPrices();
  const withPrices = holds.map(h => {
    const r = rows.find(x => x.id === h.coinId);
    const price = r?.price ?? null;
    const value = r ? h.amt * r.price : null;
    // v020 — costo promedio de compra: si no se ha registrado (avgCost=0)
    // no se calcula ganancia (null), nunca se inventa un costo
    const costBasis = h.avgCost > 0 ? h.amt * h.avgCost : null;
    const pnl = costBasis != null && value != null ? value - costBasis : null;
    const pnlPct = h.avgCost > 0 && price != null ? ((price - h.avgCost) / h.avgCost) * 100 : null;
    return { ...h, price, chg: r?.chg ?? null, spark: r?.spark ?? [], value, image: r?.image || '', costBasis, pnl, pnlPct };
  });
  const total = withPrices.reduce((s, h) => s + (h.value || 0), 0);
  const chgUSD = withPrices.reduce((s, h) => s + (h.value || 0) * (h.chg || 0) / 100, 0);
  const withCost = withPrices.filter(h => h.costBasis != null && h.pnl != null);
  const totalCost = withCost.reduce((s, h) => s + (h.costBasis || 0), 0);
  const totalPnl = withCost.length ? withCost.reduce((s, h) => s + (h.pnl || 0), 0) : null;
  const totalPnlPct = totalCost > 0 && totalPnl != null ? (totalPnl / totalCost) * 100 : null;
  return NextResponse.json({ ok: true, holdings: withPrices, total, chgUSD, totalCost, totalPnl, totalPnlPct });
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
    // v020 — costo promedio de compra (USD/unidad): solo se toca si viene
    // en el body y es un número válido; así editar solo la cantidad no
    // borra el costo ya guardado.
    const avgCostIn = Number(b?.avgCost);
    const hasAvgCost = b?.avgCost !== undefined && b?.avgCost !== null && b?.avgCost !== '' && Number.isFinite(avgCostIn) && avgCostIn >= 0;
    const update: Record<string, number> = { amt };
    if (hasAvgCost) update.avgCost = avgCostIn;
    const h = await db.holding.upsert({
      where: { coinId },
      update,
      create: { coinId, sym, name, amt, avgCost: hasAvgCost ? avgCostIn : 0 },
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
