import { NextRequest, NextResponse } from 'next/server';
import { searchCoins } from '@/lib/nova/prices';

export const dynamic = 'force-dynamic';

/* v019 — Busca CUALQUIER moneda de CoinGecko por texto libre (símbolo o
   nombre): alimenta el buscador de "añadir moneda" y de alertas en el
   panel, ya no limitado al catálogo curado de 30. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') || '';
  if (q.trim().length < 2) return NextResponse.json({ ok: true, results: [] });
  const results = await searchCoins(q);
  return NextResponse.json({ ok: true, results });
}
