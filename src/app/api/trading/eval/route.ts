import { NextResponse } from 'next/server';
import { runTradingTick } from '@/lib/nova/trading';
import { scanNewListings } from '@/lib/nova/sniper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* v010 — Evalúa ahora: ciclo manual del motor (señales + SL/TP + sniper). */
export async function POST() {
  try {
    const t = await runTradingTick();
    const s = await scanNewListings();
    return NextResponse.json({ ok: true, ...t, sniper: s.nuevos.length, sniperError: s.error });
  } catch (e) {
    console.error('[NOVA trading/eval]', e);
    return NextResponse.json({ ok: false, error: 'fallo al evaluar' }, { status: 500 });
  }
}
export async function GET() { return POST(); }
