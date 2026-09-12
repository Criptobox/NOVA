import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { updateTradingCfg, getTradingCfg, parseSymbols, tradingStatus } from '@/lib/nova/trading';
import { seal, mask, unseal } from '@/lib/nova/seal';
import { testCreds } from '@/lib/nova/exchange';

export const dynamic = 'force-dynamic';

/* v010 — Ajustes del módulo de trading (config, símbolos, riesgo, credenciales).
   Las claves del exchange llegan por POST, se cifran con AES-256-GCM y
   NUNCA se devuelven en claro (solo máscara). */

interface Body {
  on?: boolean;
  simMode?: boolean;
  symbols?: string;
  maxPosQuote?: number;
  maxPctCapital?: number;
  stopLossPct?: number;
  takeProfitPct?: number;
  maxTradesHour?: number;
  sniperOn?: boolean;
  apiKey?: string;      // si viene vacío no se toca
  apiSecret?: string;
  testnet?: boolean;
  credsOn?: boolean;    // activar/desactivar credenciales
}

export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as Body;

    // --- Config general ---
    const patch: Record<string, unknown> = {};
    if (typeof b.on === 'boolean') patch.on = b.on;
    if (typeof b.simMode === 'boolean') patch.simMode = b.simMode;
    if (typeof b.sniperOn === 'boolean') patch.sniperOn = b.sniperOn;
    if (typeof b.symbols === 'string') {
      const syms = parseSymbols(b.symbols);
      if (!syms.length) return NextResponse.json({ ok: false, error: 'Ningún símbolo válido (formato: BTCUSDT, ETHUSDT…)' }, { status: 400 });
      patch.symbols = syms.join(',');
    }
    const num = (v: unknown, min: number, max: number) =>
      typeof v === 'number' && v >= min && v <= max ? v : undefined;
    const pos = num(b.maxPosQuote, 10, 100000); if (pos !== undefined) patch.maxPosQuote = pos;
    const pct = num(b.maxPctCapital, 0.5, 100); if (pct !== undefined) patch.maxPctCapital = pct;
    const sl = num(b.stopLossPct, 0.5, 50); if (sl !== undefined) patch.stopLossPct = sl;
    const tp = num(b.takeProfitPct, 0.5, 200); if (tp !== undefined) patch.takeProfitPct = tp;
    const mt = num(b.maxTradesHour, 1, 20); if (mt !== undefined) patch.maxTradesHour = mt;

    if (Object.keys(patch).length) await updateTradingCfg(patch);

    // --- Credenciales del exchange ---
    let credMsg = '';
    if (typeof b.apiKey === 'string' && b.apiKey.trim() && typeof b.apiSecret === 'string' && b.apiSecret.trim()) {
      const count = await db.exchangeCredentials.count();
      if (count > 0) {
        await db.exchangeCredentials.updateMany({
          data: { apiKeyEnc: seal(b.apiKey.trim()), apiSecEnc: seal(b.apiSecret.trim()), testnet: b.testnet !== false, on: true },
        });
      } else {
        await db.exchangeCredentials.create({
          data: { apiKeyEnc: seal(b.apiKey.trim()), apiSecEnc: seal(b.apiSecret.trim()), testnet: b.testnet !== false, on: true },
        });
      }
      credMsg = 'Credenciales guardadas y cifradas ✓';
    }
    if (typeof b.credsOn === 'boolean') {
      await db.exchangeCredentials.updateMany({ data: { on: b.credsOn } });
      if (!b.credsOn) credMsg = 'Credenciales desactivadas: el trading queda en simulación.';
    }

    const cfg = await getTradingCfg();
    let test: { ok: boolean; error?: string } | null = null;
    const anyCreds = await db.exchangeCredentials.findFirst({ where: { on: true } });
    if (anyCreds && b.testnet !== undefined && b.apiKey && b.apiSecret) {
      test = await testCreds({ apiKey: unseal(anyCreds.apiKeyEnc), apiSecret: unseal(anyCreds.apiSecEnc), testnet: anyCreds.testnet, on: true });
    }
    const st = await tradingStatus();
    return NextResponse.json({
      ok: true, cfg: st.cfg, mode: st.mode, credsOn: st.credsOn,
      keyMask: anyCreds ? mask(unseal(anyCreds.apiKeyEnc)) : '',
      test, credMsg,
    });
  } catch (e) {
    console.error('[NOVA trading/settings]', e);
    return NextResponse.json({ ok: false, error: 'no se pudieron guardar los ajustes' }, { status: 500 });
  }
}
