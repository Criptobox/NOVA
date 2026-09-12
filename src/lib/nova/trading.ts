/* ============================================================
   NOVA v010 — FASE 3 · Motor de ejecución con gestión de riesgo
   Reglas duras ANTES de cualquier orden:
   · Tamaño máximo de posición (maxPosQuote USDT)
   · % máximo del capital por operación
   · Stop-loss obligatorio y take-profit en cada operación
   · Límite de operaciones por hora
   Modo simulación por defecto (🧪): nada toca dinero real hasta que
   el dueño apaga la simulación explícitamente en el panel.
   Cada operación queda en TradeLog y, si es real/testnet, aviso push.
   ============================================================ */
import { db } from '@/lib/db';
import { marketOrder, tickerPrice, getCreds, type Creds } from './exchange';
import { getSignal, type Signal } from './analysis';
import { pushAll } from './push';

export interface TradingCfg {
  id: string; on: boolean; simMode: boolean; symbols: string;
  maxPosQuote: number; maxPctCapital: number; stopLossPct: number;
  takeProfitPct: number; maxTradesHour: number; sniperOn: boolean;
}

export async function getTradingCfg(): Promise<TradingCfg> {
  let c = await db.tradingConfig.findUnique({ where: { id: 'trading' } });
  if (!c) c = await db.tradingConfig.create({ data: { id: 'trading' } });
  return c;
}

export async function updateTradingCfg(patch: Partial<TradingCfg>): Promise<TradingCfg> {
  await getTradingCfg(); // asegura que exista
  return db.tradingConfig.update({ where: { id: 'trading' }, data: patch });
}

/** Modo efectivo de las operaciones según configuración y credenciales */
export async function effectiveMode(cfg: TradingCfg): Promise<'sim' | 'testnet' | 'real'> {
  if (cfg.simMode) return 'sim';
  const creds = await getCreds();
  if (!creds) return 'sim'; // sin claves verificadas no hay dinero real posible
  return creds.testnet ? 'testnet' : 'real';
}

const normSymbol = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
export const parseSymbols = (raw: string): string[] =>
  raw.split(',').map(normSymbol).filter(s => /^[A-Z0-9]{5,12}$/.test(s)).slice(0, 10);

/* ---------- Riesgo ---------- */

async function tradesLastHour(symbol: string): Promise<number> {
  const since = new Date(Date.now() - 3600 * 1000);
  return db.tradeLog.count({ where: { symbol, createdAt: { gte: since }, reason: { not: 'manual' } } });
}

/* ---------- Ejecutar operaciones ---------- */

export interface TradeDecision { executed: boolean; detail: string }

/** Abre una posición (simulación o exchange) tras pasar las reglas de riesgo */
async function openPosition(
  symbol: string, price: number, sig: Signal | null, mode: 'sim' | 'testnet' | 'real',
  cfg: TradingCfg, creds: Creds | null, reason: string
): Promise<TradeDecision> {
  // Regla 1: límite de operaciones por hora
  const lastHour = await tradesLastHour(symbol);
  if (lastHour >= cfg.maxTradesHour) {
    return { executed: false, detail: `Límite de ${cfg.maxTradesHour} operaciones/hora alcanzado en ${symbol}` };
  }
  // Regla 2: tamaño de posición = min(tamaño máximo, % del capital)
  let quote = cfg.maxPosQuote;
  if (mode !== 'sim' && creds) {
    try {
      const { getBalance } = await import('./exchange');
      const balances = await getBalance(creds);
      const usdt = balances.find(b => b.asset === 'USDT');
      const capital = (usdt?.free || 0) + (usdt?.locked || 0);
      if (capital <= 0) return { executed: false, detail: 'Sin USDT disponible en el exchange' };
      quote = Math.min(cfg.maxPosQuote, (capital * cfg.maxPctCapital) / 100);
      if (quote < 10) return { executed: false, detail: `Posición calculada (${quote.toFixed(2)} USDT) por debajo del mínimo de Binance (10 USDT)` };
    } catch (e) {
      return { executed: false, detail: `No pude leer el balance: ${e instanceof Error ? e.message : 'error'}` };
    }
  }
  const qty = quote / price;
  const signalTxt = sig ? `${sig.action} score ${sig.score} conf ${sig.confidence}%` : 'manual';

  if (mode === 'sim') {
    await db.tradeLog.create({
      data: { symbol, side: 'BUY', price, qty, quoteQty: quote, mode, signal: signalTxt, reason, status: 'open' },
    });
    return { executed: true, detail: `🧪 SIMULACIÓN · Compra ${symbol}: ${quote.toFixed(2)} USDT a ${price} (SL −${cfg.stopLossPct}% · TP +${cfg.takeProfitPct}%)` };
  }
  if (!creds) return { executed: false, detail: 'Sin credenciales de exchange' };
  try {
    const o = await marketOrder(symbol, 'BUY', 0, quote, creds);
    await db.tradeLog.create({
      data: {
        symbol, side: 'BUY', price: o.cummulativeQuoteQty > 0 && o.executedQty > 0 ? o.cummulativeQuoteQty / o.executedQty : price,
        qty: o.executedQty, quoteQty: o.cummulativeQuoteQty || quote, mode, signal: signalTxt, reason,
        status: 'open', orderId: String(o.orderId),
      },
    });
    void pushAll({
      title: `💰 Trading ${mode.toUpperCase()} · compra ejecutada`,
      body: `${symbol} por ${quote.toFixed(2)} USDT (${reason})`,
      url: '/#trading', tag: 'nova-trading',
    }).catch(() => { /* sin suscripciones */ });
    return { executed: true, detail: `Compra real (${mode}) de ${symbol}: ${o.executedQty} @ ${price}` };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'error';
    await db.tradeLog.create({ data: { symbol, side: 'BUY', price, qty: 0, quoteQty: quote, mode, signal: signalTxt, reason, status: 'error' } });
    return { executed: false, detail: `La orden falló: ${err}` };
  }
}

/** Cierra la posición abierta de un símbolo (venta total) */
async function closePosition(
  symbol: string, price: number, mode: 'sim' | 'testnet' | 'real',
  cfg: TradingCfg, creds: Creds | null, reason: string
): Promise<TradeDecision> {
  const open = await db.tradeLog.findFirst({
    where: { symbol, side: 'BUY', status: 'open', mode },
    orderBy: { createdAt: 'asc' },
  });
  if (!open) return { executed: false, detail: `No hay posición abierta en ${symbol} (${mode})` };
  const pnl = (price - open.price) * open.qty;

  if (mode === 'sim') {
    await db.tradeLog.create({
      data: { symbol, side: 'SELL', price, qty: open.qty, quoteQty: open.qty * price, result: pnl, mode, signal: reason, reason, status: 'filled', pairId: open.id },
    });
    await db.tradeLog.update({ where: { id: open.id }, data: { status: 'closed' } });
    const pct = ((price - open.price) / open.price) * 100;
    return { executed: true, detail: `🧪 SIMULACIÓN · Venta ${symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${pct.toFixed(2)}%) · ${reason}` };
  }
  if (!creds) return { executed: false, detail: 'Sin credenciales de exchange' };
  try {
    const o = await marketOrder(symbol, 'SELL', open.qty, open.qty * price, creds);
    await db.tradeLog.create({
      data: { symbol, side: 'SELL', price: o.executedQty > 0 ? o.cummulativeQuoteQty / o.executedQty : price, qty: o.executedQty, quoteQty: o.cummulativeQuoteQty, result: pnl, mode, signal: reason, reason, status: 'filled', pairId: open.id, orderId: String(o.orderId) },
    });
    await db.tradeLog.update({ where: { id: open.id }, data: { status: 'closed' } });
    void pushAll({
      title: `💰 Trading ${mode.toUpperCase()} · venta ejecutada`,
      body: `${symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT (${reason})`,
      url: '/#trading', tag: 'nova-trading',
    }).catch(() => { /* noop */ });
    return { executed: true, detail: `Venta real (${mode}) de ${symbol}: PnL ${pnl.toFixed(2)} USDT` };
  } catch (e) {
    const err = e instanceof Error ? e.message : 'error';
    await db.tradeLog.create({ data: { symbol, side: 'SELL', price, qty: open.qty, quoteQty: 0, result: null, mode, signal: reason, reason, status: 'error', pairId: open.id } });
    return { executed: false, detail: `La venta falló: ${err}` };
  }
}

/** Evalúa un símbolo: gestiona SL/TP de posiciones abiertas y actúa según la señal */
export async function evaluateSymbol(symbolRaw: string, opts: { manual?: boolean } = {}): Promise<TradeDecision> {
  const cfg = await getTradingCfg();
  const symbol = normSymbol(symbolRaw);
  const mode = await effectiveMode(cfg);
  const creds = mode === 'sim' ? null : await getCreds();
  const price = await tickerPrice(symbol);
  if (!price) return { executed: false, detail: `No pude obtener el precio de ${symbol} ahora mismo` };

  // 1) Gestionar posiciones abiertas: stop-loss y take-profit SIEMPRE primero
  const open = await db.tradeLog.findFirst({ where: { symbol, side: 'BUY', status: 'open', mode }, orderBy: { createdAt: 'asc' } });
  if (open) {
    const sl = open.price * (1 - cfg.stopLossPct / 100);
    const tp = open.price * (1 + cfg.takeProfitPct / 100);
    if (price <= sl) return closePosition(symbol, price, mode, cfg, creds, 'stop-loss');
    if (price >= tp) return closePosition(symbol, price, mode, cfg, creds, 'take-profit');
  }

  // 2) Señal técnica
  const sig = await getSignal(symbol);
  if (!sig) return { executed: false, detail: `Sin señal disponible para ${symbol} (sin conexión con el mercado)` };
  const sigLine = `${symbol}: ${sig.action.toUpperCase()} (score ${sig.score}, confianza ${sig.confidence}%) · precio ${price}`;

  if (sig.action === 'comprar' && !open) {
    const r = await openPosition(symbol, price, sig, mode, cfg, creds, 'señal');
    return { executed: r.executed, detail: `${sigLine}\n${r.detail}` };
  }
  if (sig.action === 'vender' && open) {
    const r = await closePosition(symbol, price, mode, cfg, creds, 'señal de venta');
    return { executed: r.executed, detail: `${sigLine}\n${r.detail}` };
  }
  return { executed: false, detail: `${sigLine} · sin acción (${open ? 'ya hay posición abierta' : 'la señal no alcanza el umbral'})` };
}

/** Orden manual desde WhatsApp o el panel (solo sim/testnet por seguridad) */
export async function manualOrder(symbolRaw: string, side: 'BUY' | 'SELL'): Promise<TradeDecision> {
  const cfg = await getTradingCfg();
  const mode = await effectiveMode(cfg);
  const symbol = normSymbol(symbolRaw);
  if (mode === 'real') {
    return { executed: false, detail: '🔒 Por seguridad, las órdenes manuales solo funcionan en simulación o testnet. Activa testnet o simulación para operar a mano.' };
  }
  if (!cfg.on) return { executed: false, detail: 'El módulo de trading está pausado. Actívalo con "activar trading" o en el panel → Trading.' };
  const creds = mode === 'testnet' ? await getCreds() : null;
  const price = await tickerPrice(symbol);
  if (!price) return { executed: false, detail: `Sin precio de ${symbol} ahora mismo` };
  if (side === 'BUY') {
    const open = await db.tradeLog.findFirst({ where: { symbol, side: 'BUY', status: 'open', mode } });
    if (open) return { executed: false, detail: `Ya hay una posición abierta en ${symbol}` };
    return openPosition(symbol, price, null, mode, cfg, creds, 'manual');
  }
  return closePosition(symbol, price, mode, cfg, creds, 'manual');
}

/** Ciclo del cron: evalúa todos los símbolos vigilados */
export async function runTradingTick(): Promise<{ evaluados: number; operaciones: string[] }> {
  const cfg = await getTradingCfg();
  if (!cfg.on) return { evaluados: 0, operaciones: [] };
  const symbols = parseSymbols(cfg.symbols);
  const operaciones: string[] = [];
  let evaluados = 0;
  for (const s of symbols) {
    try {
      const r = await evaluateSymbol(s);
      evaluados++;
      if (r.executed) operaciones.push(r.detail);
    } catch (e) {
      console.error(`[NOVA trading] ${s}:`, e);
    }
  }
  return { evaluados, operaciones };
}

/* ---------- Resúmenes ---------- */

export interface TradingStatus {
  cfg: TradingCfg;
  mode: 'sim' | 'testnet' | 'real';
  credsOn: boolean;
  open: { symbol: string; entry: number; qty: number; quote: number; price: number | null; pnl: number | null; since: string }[];
  today: { trades: number; pnl: number };
  totals: { trades: number; pnl: number };
  lastTrades: { id: string; symbol: string; side: string; price: number; quoteQty: number; result: number | null; mode: string; reason: string; status: string; createdAt: string }[];
}

export async function tradingStatus(): Promise<TradingStatus> {
  const cfg = await getTradingCfg();
  const creds = await getCreds();
  const mode = await effectiveMode(cfg);
  const openRows = await db.tradeLog.findMany({ where: { side: 'BUY', status: 'open' }, orderBy: { createdAt: 'desc' } });
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [todayTrades, totalsAgg, last] = await Promise.all([
    db.tradeLog.findMany({ where: { createdAt: { gte: startOfDay }, side: 'SELL' } }),
    db.tradeLog.aggregate({ where: { side: 'SELL', result: { not: null } }, _sum: { result: true }, _count: true }),
    db.tradeLog.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const open = await Promise.all(openRows.map(async (o) => {
    const price = await tickerPrice(o.symbol);
    const pnl = price ? (price - o.price) * o.qty : null;
    return { symbol: o.symbol, entry: o.price, qty: o.qty, quote: o.quoteQty, price, pnl, since: o.createdAt.toISOString() };
  }));
  return {
    cfg, mode, credsOn: !!creds,
    open,
    today: { trades: todayTrades.length, pnl: +(todayTrades.reduce((a, t) => a + (t.result || 0), 0)).toFixed(2) },
    totals: { trades: totalsAgg._count, pnl: +(totalsAgg._sum.result || 0).toFixed(2) },
    lastTrades: last.map(t => ({
      id: t.id, symbol: t.symbol, side: t.side, price: t.price, quoteQty: t.quoteQty,
      result: t.result, mode: t.mode, reason: t.reason, status: t.status, createdAt: t.createdAt.toISOString(),
    })),
  };
}

export async function tradesSummaryText(): Promise<string> {
  const st = await tradingStatus();
  const lines = st.lastTrades.slice(0, 5).map(t =>
    `${t.side === 'BUY' ? '🟢 Compra' : '🔴 Venta'} ${t.symbol} · ${t.quoteQty.toFixed(2)} USDT @ ${t.price}${t.result !== null ? ` · PnL ${t.result >= 0 ? '+' : ''}${t.result.toFixed(2)}` : ''} · ${t.mode === 'sim' ? '🧪 sim' : t.mode}`
  );
  return `📊 *Resumen de operaciones*\n${st.totals.trades ? `Acumulado: ${st.totals.pnl >= 0 ? '+' : ''}${st.totals.pnl.toFixed(2)} USDT en ${st.totals.trades} ventas cerradas\n` : ''}${lines.join('\n') || 'Todavía no hay operaciones registradas.'}`;
}

export async function tradingStatusText(): Promise<string> {
  const cfg = await getTradingCfg();
  const mode = await effectiveMode(cfg);
  const st = await tradingStatus();
  const openLines = st.open.map(o =>
    `• ${o.symbol}: entrada ${o.entry} → ahora ${o.price ?? '?'} (${o.pnl !== null ? `${o.pnl >= 0 ? '+' : ''}${o.pnl.toFixed(2)} USDT` : 'sin precio'})`
  );
  return [
    `🤖 *Módulo de trading* — ${cfg.on ? '✅ ACTIVO' : '⏸ PAUSADO'}`,
    `Modo: ${mode === 'sim' ? '🧪 Simulación (sin dinero real)' : mode === 'testnet' ? '🧪 Testnet (fondos ficticios)' : '💰 REAL'}`,
    `Pares: ${cfg.symbols}`,
    `Riesgo: máx ${cfg.maxPosQuote} USDT/posición · SL −${cfg.stopLossPct}% · TP +${cfg.takeProfitPct}% · máx ${cfg.maxTradesHour} ops/h`,
    openLines.length ? `\n📉 Posiciones abiertas:\n${openLines.join('\n')}` : '\nSin posiciones abiertas.',
    `\nHoy: ${st.today.trades} ventas · PnL ${st.today.pnl >= 0 ? '+' : ''}${st.today.pnl.toFixed(2)} USDT`,
    `⚠️ Esto no es asesoría financiera. Empieza siempre en simulación.`,
  ].join('\n');
}

export type { Signal };
