import { NextResponse } from 'next/server';
import { updateTradingCfg, tradingStatusText } from '@/lib/nova/trading';

export const dynamic = 'force-dynamic';

/* v010 — Pausar el módulo de trading (deja de evaluar señales; las
   posiciones abiertas y su stop-loss se conservan hasta reactivarlo). */
export async function POST() {
  try {
    const cfg = await updateTradingCfg({ on: false });
    const txt = await tradingStatusText();
    return NextResponse.json({ ok: true, cfg, txt });
  } catch (e) {
    console.error('[NOVA trading/pause]', e);
    return NextResponse.json({ ok: false, error: 'no se pudo pausar el trading' }, { status: 500 });
  }
}
