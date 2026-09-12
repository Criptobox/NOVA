/* ============================================================
   NOVA v010 — FASE 4 · Sniper de nuevos listados (versión Vercel)
   Alcance honesto y seguro:
   · Detecta pares NUEVOS en Binance comparando exchangeInfo contra
     la tabla SniperWatch (persistida en BD, funciona en serverless).
   · Checks anti-riesgo básicos antes de considerar la compra.
   · SOLO SIMULACIÓN: registra una compra simulada en TradeLog y
     avisa por push/WhatsApp. El sniping real on-chain (DEX,
     milisegundos, PairCreated) necesita un worker aparte fuera de
     Vercel — queda fuera del alcance GitHub+Vercel por diseño.
   ============================================================ */
import { db } from '@/lib/db';
import { exchangeInfo, tickerPrice } from './exchange';
import { getTradingCfg } from './trading';
import { pushAll } from './push';
import { getSettings, waCreds } from './settings';

const SAFE_QUOTES = ['USDT', 'USDC', 'FDUSD'];
const KNOWN_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'DOT', 'TRX', 'LINK', 'LTC',
  'SHIB', 'BCH', 'UNI', 'XLM', 'AVAX', 'XMR', 'ATOM', 'NEAR', 'APT', 'ARB', 'OP',
  'ICP', 'HBAR', 'FIL', 'DAI', 'PEPE', 'TON', 'USDT', 'USDC', 'FDUSD', 'TUSD', 'EUR', 'TRY', 'BRL', 'ARS',
]);

export interface SniperFinding {
  symbol: string;
  base: string;
  quote: string;
  price: number | null;
  checks: string[];
  ok: boolean;
  simulated: boolean;
}

/** Escanea el exchange buscando pares que NO conocíamos. Idempotente. */
export async function scanNewListings(): Promise<{ scanned: number; nuevos: SniperFinding[]; error?: string }> {
  const cfg = await getTradingCfg();
  let listed: Awaited<ReturnType<typeof exchangeInfo>>;
  try {
    listed = await exchangeInfo();
  } catch (e) {
    return { scanned: 0, nuevos: [], error: e instanceof Error ? e.message : 'sin conexión con el exchange' };
  }
  const knownRows = await db.sniperWatch.findMany();
  const known = new Set(knownRows.map(w => w.symbol));
  const fresh = listed.filter(s => !known.has(s.symbol));
  if (fresh.length) {
    // Baseline en un solo lote (primera pasada registra cientos: sin avisos)
    try {
      await db.sniperWatch.createMany({
        data: fresh.map(s => ({ symbol: s.symbol, base: s.base, quote: s.quote, handled: false })),
      });
    } catch { /* carrera entre dos escaneos simultáneos: se ignora */ }
  }
  if (!cfg.sniperOn) return { scanned: listed.length, nuevos: [] };
  // Solo alerta si ya existía un baseline (no avisamos 500 veces el primer día)
  if (!knownRows.length) return { scanned: listed.length, nuevos: [], error: 'baseline inicial creado: a partir de ahora aviso de listados nuevos' };
  const nuevos: SniperFinding[] = [];

  for (const s of fresh) {
    const checks: string[] = [];
    let ok = true;
    if (SAFE_QUOTES.includes(s.quote)) checks.push(`✅ Cotiza contra ${s.quote} (stablecoin)`);
    else { ok = false; checks.push(`⚠️ Cotiza contra ${s.quote}: fuera del área segura`); }
    if (KNOWN_BASES.has(s.base)) checks.push('✅ Activo ya conocido en el catálogo (riesgo bajo)');
    else { checks.push('🆕 Activo recién listado: riesgo alto por defecto'); ok = false; }

    let price: number | null = null;
    try { price = await tickerPrice(s.symbol); } catch { /* opcional */ }
    if (!price) { ok = false; checks.push('⚠️ Sin precio disponible'); }

    const f: SniperFinding = { symbol: s.symbol, base: s.base, quote: s.quote, price, checks, ok, simulated: true };
    nuevos.push(f);

    // Registro simulado de la compra (nunca dinero real en Vercel)
    if (ok && price) {
      await db.tradeLog.create({
        data: {
          symbol: s.symbol, side: 'BUY', price, qty: cfg.maxPosQuote / price, quoteQty: cfg.maxPosQuote,
          mode: 'sim', signal: 'sniper', reason: 'sniper: nuevo listado', status: 'open',
        },
      });
      f.simulated = true;
      checks.push('🧪 Compra SIMULADA registrada (el dinero real está bloqueado en el sniper)');
    }
    await db.sniperWatch.update({ where: { symbol: s.symbol }, data: { handled: true, note: ok ? 'simulado' : 'descartado por checks' } });

    // Avisos: push al panel + WhatsApp al dueño si está configurado
    void pushAll({
      title: '🎯 Nuevo listado detectado',
      body: `${s.symbol}${price ? ` @ ${price}` : ''} — ${ok ? 'compra simulada registrada' : 'descartado por checks anti-riesgo'}`,
      url: '/#trading', tag: 'nova-sniper',
    }).catch(() => { /* noop */ });
    try {
      const sSet = await getSettings();
      const { token, phoneId } = waCreds(sSet);
      if (token && phoneId && sSet.ownerWa) {
        const { sendWaText } = await import('./whatsapp');
        void sendWaText(sSet.ownerWa, `🎯 *Nuevo listado en Binance*: ${s.symbol}${price ? ` @ ${price} USD` : ''}\n${checks.join('\n')}\n${ok ? '🧪 He registrado una compra SIMULADA. El sniping real no está disponible en GitHub+Vercel (requiere worker dedicado).' : 'No opero: no pasa los checks anti-riesgo.'}`, sSet).catch(() => { /* noop */ });
      }
    } catch { /* noop */ }
  }
  return { scanned: listed.length, nuevos };
}

export async function sniperStatus(): Promise<{ on: boolean; tracked: number; recent: { symbol: string; base: string; quote: string; firstSeen: string; handled: boolean; note: string }[] }> {
  const cfg = await getTradingCfg();
  const [tracked, recent] = await Promise.all([
    db.sniperWatch.count(),
    db.sniperWatch.findMany({ orderBy: { firstSeen: 'desc' }, take: 10 }),
  ]);
  return {
    on: cfg.sniperOn,
    tracked,
    recent: recent.map(r => ({ symbol: r.symbol, base: r.base, quote: r.quote, firstSeen: r.firstSeen.toISOString(), handled: r.handled, note: r.note })),
  };
}
