import { NextResponse } from 'next/server';
import { tradingStatus } from '@/lib/nova/trading';
import { sniperStatus } from '@/lib/nova/sniper';

export const dynamic = 'force-dynamic';

/* v010 — Estado completo del módulo de trading para el panel */
export async function GET() {
  try {
    const [status, sniper] = await Promise.all([tradingStatus(), sniperStatus()]);
    return NextResponse.json({ ok: true, ...status, sniper });
  } catch (e) {
    console.error('[NOVA trading/status]', e);
    return NextResponse.json({ ok: false, error: 'no se pudo leer el estado del trading' }, { status: 500 });
  }
}
