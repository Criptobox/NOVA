/* ============================================================
   NOVA v010 — FASE 2 · Motor de análisis de mercado
   · Indicadores puros: SMA, EMA, RSI(14), MACD(12,26,9), volumen relativo.
   · getSignal(symbol): combina indicadores en un score ponderado →
     "comprar" / "vender" / "esperar" + confianza. Nunca es una
     decisión ciega: devuelve el desglose para que el dueño decida.
   · backtest(): reproduce la MISMA lógica sobre velas históricas
     (Binance) y calcula retorno, drawdown máximo y win rate.
   Aviso: esto no es asesoría financiera.
   ============================================================ */
import { klines, type Kline } from './exchange';

/* ---------- Indicadores (funciones puras) ---------- */

export function sma(values: number[], period: number): number[] {
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    out.push(i >= period - 1 ? sum / period : NaN);
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function rsi(values: number[], period = 14): number[] {
  const out: number[] = [NaN];
  let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= period) {
      gain += g; loss += l;
      if (i === period) {
        gain /= period; loss /= period;
        out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
      } else out.push(NaN);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out.push(loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    }
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signalP = 9): { line: number[]; hist: number[] } {
  const f = ema(values, fast), s = ema(values, slow);
  const line = values.map((_, i) => f[i] - s[i]);
  const sig = ema(line, signalP);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, hist };
}

export function relVolume(vols: number[], period = 20): number {
  const m = sma(vols, period);
  const last = vols[vols.length - 1];
  const avg = m[m.length - 1];
  return avg && !Number.isNaN(avg) ? last / avg : 1;
}

/* ---------- Señal combinada ---------- */

export type SignalAction = 'comprar' | 'vender' | 'esperar';

export interface Signal {
  symbol: string;
  action: SignalAction;
  score: number;          // −3 … +3
  confidence: number;     // 0…100 %
  price: number;          // último cierre
  breakdown: string[];    // desglose legible
  time: number;           // ts de la vela
}

export function signalFromKlines(symbol: string, kl: Kline[]): Signal {
  const closes = kl.map(k => k.c);
  const vols = kl.map(k => k.v);
  const price = closes[closes.length - 1];
  const e9 = ema(closes, 9), e21 = ema(closes, 21);
  const r = rsi(closes);
  const m = macd(closes);
  const rv = relVolume(vols);
  const last = kl[kl.length - 1];
  const i = closes.length - 1;

  let score = 0;
  const br: string[] = [];

  // 1) Tendencia (peso 1): precio sobre EMA21 y EMA9 sobre EMA21
  if (price > e21[i] && e9[i] > e21[i]) { score += 1; br.push('📈 Tendencia alcista (precio > EMA21, EMA9 > EMA21) +1'); }
  else if (price < e21[i] && e9[i] < e21[i]) { score -= 1; br.push('📉 Tendencia bajista (precio < EMA21, EMA9 < EMA21) −1'); }
  else br.push('➖ Tendencia lateral (sin cruce claro) 0');

  // 2) RSI (peso 1)
  const rNow = r[i] || 50;
  if (rNow <= 30) { score += 1; br.push(`🟢 RSI ${rNow.toFixed(0)} (sobrevendido) +1`); }
  else if (rNow >= 70) { score -= 1; br.push(`🔴 RSI ${rNow.toFixed(0)} (sobrecomprado) −1`); }
  else br.push(`⚪ RSI ${rNow.toFixed(0)} (zona neutra) 0`);

  // 3) MACD (peso 1): histograma y su dirección
  const h = m.hist[i], hPrev = m.hist[i - 1] || 0;
  if (h > 0 && h >= hPrev) { score += 1; br.push('💠 MACD positivo y subiendo +1'); }
  else if (h < 0 && h <= hPrev) { score -= 1; br.push('🔶 MACD negativo y bajando −1'); }
  else br.push('➖ MACD sin dirección clara 0');

  // 4) Volumen (peso 0.5): confirman la vela actual
  if (rv >= 1.5) {
    const bull = last.c >= last.o;
    score += bull ? 0.5 : -0.5;
    br.push(`📣 Volumen ${rv.toFixed(1)}× el promedio, vela ${bull ? 'alcista' : 'bajista'} ${bull ? '+' : '−'}0.5`);
  } else br.push(`💤 Volumen normal (${rv.toFixed(1)}×) 0`);

  const action: SignalAction = score >= 1.5 ? 'comprar' : score <= -1.5 ? 'vender' : 'esperar';
  const confidence = Math.min(95, Math.round(40 + Math.abs(score) * 18));
  return { symbol, action, score: +score.toFixed(1), confidence, price, breakdown: br, time: last.t };
}

/** Señal en vivo para un par (velas 1 h) */
export async function getSignal(symbol: string): Promise<Signal | null> {
  try {
    const kl = await klines(symbol, '1h', 210);
    if (kl.length < 40) return null;
    return signalFromKlines(symbol, kl);
  } catch {
    return null;
  }
}

/* ---------- Backtester ---------- */

export interface BacktestResult {
  symbol: string;
  days: number;
  bars: number;
  trades: number;
  wins: number;
  winRate: number;      // %
  returnPct: number;    // % total sobre el capital usado
  maxDrawdownPct: number;
  buyHoldPct: number;   // % si solo se hubiera comprado y mantenido
  note: string;
}

/** Simula la estrategia sobre velas históricas (1 h). SL/TP intra-vela. */
export async function backtest(symbol: string, days = 30, slPct = 2, tpPct = 4): Promise<BacktestResult> {
  const barsWanted = Math.min(1000, days * 24 + 30);
  const kl = await klines(symbol, '1h', barsWanted);
  if (kl.length < 60) throw new Error('Sin velas suficientes para el backtest');
  const closes = kl.map(k => k.c);
  const vols = kl.map(k => k.v);
  const e9a = ema(closes, 9), e21a = ema(closes, 21);
  const ra = rsi(closes);
  const m = macd(closes);
  const va = sma(vols, 20);

  let capital = 100, inPos = false, entry = 0, qty = 0;
  let trades = 0, wins = 0;
  let peak = capital, maxDd = 0;
  const startPrice = closes[30];
  const warm = 30;

  for (let i = warm; i < kl.length; i++) {
    const c = closes[i];
    if (inPos) {
      const sl = entry * (1 - slPct / 100), tp = entry * (1 + tpPct / 100);
      // SL/TP intra-vela (primero el peor caso por prudencia)
      const hitSl = kl[i].l <= sl, hitTp = kl[i].h >= tp;
      if (hitSl || hitTp) {
        const exit = hitSl ? sl : tp;
        capital = qty * exit;
        if (exit > entry) wins++;
        trades++; inPos = false;
      }
    }
    if (!inPos) {
      const rNow = ra[i] || 50;
      let s = 0;
      if (c > e21a[i] && e9a[i] > e21a[i]) s += 1;
      else if (c < e21a[i] && e9a[i] < e21a[i]) s -= 1;
      if (rNow <= 30) s += 1; else if (rNow >= 70) s -= 1;
      if (m.hist[i] > 0 && m.hist[i] >= (m.hist[i - 1] || 0)) s += 1;
      else if (m.hist[i] < 0 && m.hist[i] <= (m.hist[i - 1] || 0)) s -= 1;
      const rv = va[i] ? vols[i] / va[i] : 1;
      if (rv >= 1.5) s += kl[i].c >= kl[i].o ? 0.5 : -0.5;
      if (s >= 1.5) { inPos = true; entry = c; qty = capital / entry; }
    }
    peak = Math.max(peak, inPos ? qty * c : capital);
    maxDd = Math.max(maxDd, ((peak - (inPos ? qty * c : capital)) / peak) * 100);
  }
  if (inPos) { capital = qty * closes[closes.length - 1]; trades++; if (closes[closes.length - 1] > entry) wins++; }
  const buyHold = ((closes[closes.length - 1] - startPrice) / startPrice) * 100;
  return {
    symbol, days, bars: kl.length - warm,
    trades, wins,
    winRate: trades ? Math.round((wins / trades) * 100) : 0,
    returnPct: +(((capital - 100) / 100) * 100).toFixed(2),
    maxDrawdownPct: +maxDd.toFixed(2),
    buyHoldPct: +buyHold.toFixed(2),
    note: 'Backtest histórico con velas de 1 h (Binance). Rendimiento pasado no garantiza resultados futuros.',
  };
}
