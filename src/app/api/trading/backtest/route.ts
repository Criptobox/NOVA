import { NextRequest, NextResponse } from 'next/server';
import { backtest } from '@/lib/nova/analysis';
import { getTradingCfg } from '@/lib/nova/trading';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* v010 — Backtest de la estrategia sobre velas históricas reales.
   POST { symbol: "BTCUSDT", days: 30 } → métricas (retorno, drawdown, win rate). */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const symbol = String(b?.symbol || 'BTCUSDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!/^[A-Z0-9]{5,12}$/.test(symbol)) return NextResponse.json({ ok: false, error: 'símbolo inválido' }, { status: 400 });
    const days = Math.min(Math.max(parseInt(String(b?.days || 30), 10) || 30, 7), 45);
    const cfg = await getTradingCfg();
    const r = await backtest(symbol, days, cfg.stopLossPct, cfg.takeProfitPct);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[NOVA trading/backtest]', e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'backtest fallido' }, { status: 500 });
  }
}
