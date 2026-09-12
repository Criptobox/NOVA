import { NextRequest, NextResponse } from 'next/server';
import { getSignal } from '@/lib/nova/analysis';

export const dynamic = 'force-dynamic';

/* v010 — Señales técnicas en vivo (solo lectura, NO ejecuta operaciones) */
export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get('symbols') || 'BTCUSDT,ETHUSDT,SOLUSDT').toUpperCase();
  const symbols = raw.split(',').map(s => s.trim().replace(/[^A-Z0-9]/g, '')).filter(s => /^[A-Z0-9]{5,12}$/.test(s)).slice(0, 6);
  const signals = await Promise.all(symbols.map(async s => {
    const sig = await getSignal(s);
    return sig ? { ...sig, symbol: s } : { symbol: s, action: null, score: null, confidence: null, price: null, breakdown: [], time: 0 };
  }));
  return NextResponse.json({ ok: true, signals });
}
