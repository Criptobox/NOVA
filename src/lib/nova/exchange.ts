/* ============================================================
   NOVA v010 — FASE 1 · Conector del exchange (Binance REST)
   · Endpoints públicos (precios, klines, exchangeInfo): sin claves.
   · Endpoints firmados (balance, órdenes): HMAC SHA256, claves del
     usuario descifradas de la BD. Testnet por defecto.
   · Rate limit: cola secuencial + reintentos con retroceso en 429/418.
   · Sin WebSocket: en Vercel serverless los sockets persistentes no
     sobreviven; el precio se consulta por REST (suficiente a 1 h).
   ============================================================ */
import { db } from '@/lib/db';
import { unseal } from './seal';
import crypto from 'node:crypto';

export const BINANCE_PROD = 'https://api.binance.com';
export const BINANCE_TEST = 'https://testnet.binance.vision';

export interface Creds {
  apiKey: string;
  apiSecret: string;
  testnet: boolean;
  on: boolean;
}

/** Lee las credenciales activas de la BD y las descifra */
export async function getCreds(): Promise<Creds | null> {
  const row = await db.exchangeCredentials.findFirst({
    where: { on: true, exchange: 'binance' },
    orderBy: { updatedAt: 'desc' },
  });
  if (!row) return null;
  const apiKey = unseal(row.apiKeyEnc);
  const apiSecret = unseal(row.apiSecEnc);
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret, testnet: row.testnet, on: row.on };
}

const base = (testnet: boolean) => (testnet ? BINANCE_TEST : BINANCE_PROD);

/* ---------- Cola de peticiones con control de ritmo ---------- */
const g = globalThis as unknown as {
  __novaBnQueue?: Promise<unknown>;
  __novaBnLast?: number;
};
const MIN_GAP_MS = 120; // ~8 req/s máx, muy por debajo del límite de Binance

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const prev = g.__novaBnQueue || Promise.resolve();
  const next = prev.then(async () => {
    const gap = Date.now() - (g.__novaBnLast || 0);
    if (gap < MIN_GAP_MS) await new Promise(r => setTimeout(r, MIN_GAP_MS - gap));
    try {
      return await job();
    } finally {
      g.__novaBnLast = Date.now();
    }
  });
  g.__novaBnQueue = next.catch(() => { /* la cadena no se rompe */ });
  return next as Promise<T>;
}

async function req<T>(url: string, opts: RequestInit = {}, retries = 2): Promise<T> {
  const res = await fetch(url, { ...opts, cache: 'no-store' });
  if ((res.status === 429 || res.status === 418) && retries > 0) {
    const wait = parseInt(res.headers.get('retry-after') || '0', 10) || (3 - retries) * 2 + 2;
    await new Promise(r => setTimeout(r, wait * 1000));
    return req<T>(url, opts, retries - 1);
  }
  const text = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const msg =
      (data as { msg?: string })?.msg ||
      (typeof data === 'string' ? data.slice(0, 140) : `HTTP ${res.status}`);
    throw new Error(`Binance ${res.status}: ${msg}`);
  }
  return data as T;
}

/* ---------- Públicos (sin firma) ---------- */

export async function tickerPrice(symbol: string): Promise<number | null> {
  try {
    const d = await enqueue(() => req<{ price: string }>(`${BINANCE_PROD}/api/v3/ticker/price?symbol=${symbol}`));
    return parseFloat(d.price) || null;
  } catch {
    return null;
  }
}

export interface Kline { t: number; o: number; h: number; l: number; c: number; v: number }

export async function klines(symbol: string, interval = '1h', limit = 200): Promise<Kline[]> {
  const d = await enqueue(() =>
    req<unknown[][]>(`${BINANCE_PROD}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
  );
  return d.map((k) => ({
    t: Number(k[0]), o: parseFloat(String(k[1])), h: parseFloat(String(k[2])),
    l: parseFloat(String(k[3])), c: parseFloat(String(k[4])), v: parseFloat(String(k[5])),
  }));
}

export interface ListedSymbol { symbol: string; base: string; quote: string; status: string }

export async function exchangeInfo(): Promise<ListedSymbol[]> {
  const d = await enqueue(() =>
    req<{ symbols: Array<{ symbol: string; baseAsset: string; quoteAsset: string; status: string }> }>(
      `${BINANCE_PROD}/api/v3/exchangeInfo?permissions=SPOT`
    )
  );
  return (d.symbols || [])
    .filter(s => s.status === 'TRADING' && ['USDT', 'USDC', 'BTC', 'FDUSD'].includes(s.quoteAsset))
    .map(s => ({ symbol: s.symbol, base: s.baseAsset, quote: s.quoteAsset, status: s.status }));
}

/* ---------- Firmados (HMAC SHA256) ---------- */

function sign(query: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}

async function signed<T>(path: string, params: Record<string, string | number>, creds: Creds, method = 'GET'): Promise<T> {
  const qs = new URLSearchParams({
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    timestamp: String(Date.now()),
    recvWindow: '8000',
  }).toString();
  const signature = sign(qs, creds.apiSecret);
  const url = `${base(creds.testnet)}${path}?${qs}&signature=${signature}`;
  return enqueue(() =>
    req<T>(url, {
      method,
      headers: { 'X-MBX-APIKEY': creds.apiKey },
    })
  );
}

export interface Balance { asset: string; free: number; locked: number }

export async function getBalance(creds: Creds): Promise<Balance[]> {
  const d = await signed<{ balances: Array<{ asset: string; free: string; locked: string }> }>(
    '/api/v3/account', {}, creds
  );
  return (d.balances || [])
    .map(b => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked) }))
    .filter(b => b.free > 0 || b.locked > 0);
}

export interface OrderResult {
  symbol: string; orderId: number; side: string; type: string;
  price: number; executedQty: number; cummulativeQuoteQty: number; status: string;
}

/* Orden de mercado. side: BUY (gasta quoteOrderQty) | SELL (vende quantity) */
export async function marketOrder(
  symbol: string, side: 'BUY' | 'SELL', qty: number, quoteQty: number, creds: Creds
): Promise<OrderResult> {
  const params: Record<string, string | number> =
    side === 'BUY'
      ? { symbol, side, type: 'MARKET', quoteOrderQty: quoteQty.toFixed(2) }
      : { symbol, side, type: 'MARKET', quantity: qty };
  const d = await signed<OrderResult & { fills?: Array<{ price: string; qty: string }> }>(
    '/api/v3/order', params, creds, 'POST'
  );
  return {
    symbol: d.symbol, orderId: d.orderId, side: d.side, type: d.type,
    price: parseFloat(String(d.price)) || 0,
    executedQty: parseFloat(String(d.executedQty)),
    cummulativeQuoteQty: parseFloat(String(d.cummulativeQuoteQty)),
    status: d.status,
  };
}

export async function cancelOrder(symbol: string, orderId: number, creds: Creds): Promise<void> {
  await signed('/api/v3/order', { symbol, orderId }, creds, 'DELETE');
}

export async function orderStatus(symbol: string, orderId: number, creds: Creds): Promise<OrderResult> {
  const d = await signed<OrderResult>('/api/v3/order', { symbol, orderId }, creds);
  return {
    symbol: d.symbol, orderId: d.orderId, side: d.side, type: d.type,
    price: d.price, executedQty: d.executedQty, cummulativeQuoteQty: d.cummulativeQuoteQty, status: d.status,
  };
}

/* Verifica que las claves funcionan (para el botón "probar conexión") */
export async function testCreds(creds: Creds): Promise<{ ok: boolean; error?: string; balances?: Balance[] }> {
  try {
    const balances = await getBalance(creds);
    return { ok: true, balances };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
