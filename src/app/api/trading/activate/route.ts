import { NextRequest, NextResponse } from 'next/server';
import { getSettings } from '@/lib/nova/settings';
import { updateTradingCfg, tradingStatusText } from '@/lib/nova/trading';
import { deliverTo, notifyOwner } from '@/lib/nova/notify';

export const dynamic = 'force-dynamic';

/* v010 — Activar el módulo de trading (desde el panel o WhatsApp).
   Siempre arranca con la simulación intacta; el modo se gestiona aparte. */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const cfg = await updateTradingCfg({ on: true });
    const txt = await tradingStatusText();
    // Aviso al dueño por WhatsApp si la petición viene del panel
    if (b?.notify) {
      const s = await getSettings();
      if (s.ownerWa) await deliverTo(s, s.ownerWa, 'Dueño (tú)', `🤖 Trading ACTIVADO desde el panel.\n\n${txt}`, { kind: 'note' });
      else await notifyOwner(s, txt, 'note').catch(() => { /* noop */ });
    }
    return NextResponse.json({ ok: true, cfg, txt });
  } catch (e) {
    console.error('[NOVA trading/activate]', e);
    return NextResponse.json({ ok: false, error: 'no se pudo activar el trading' }, { status: 500 });
  }
}
