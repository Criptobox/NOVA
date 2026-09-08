/* ============================================================
   NOVA v005 — catálogo y precios cripto (servidor)
   · Catálogo curado de 30 monedas (CoinGecko)
   · Precios en vivo con caché de 60 s — SOLO DATOS REALES:
     si CoinGecko falla y no hay caché se devuelve rows=[] y
     live=false (nada de precios inventados).
   · Portafolio, mejores/peores 24 h, resumen diario
   ============================================================ */

export const CATALOG: [string, string, string][] = [
  ['bitcoin', 'BTC', 'Bitcoin'], ['ethereum', 'ETH', 'Ethereum'], ['tether', 'USDT', 'Tether'],
  ['usd-coin', 'USDC', 'USD Coin'], ['binancecoin', 'BNB', 'BNB'], ['solana', 'SOL', 'Solana'],
  ['ripple', 'XRP', 'XRP'], ['cardano', 'ADA', 'Cardano'], ['dogecoin', 'DOGE', 'Dogecoin'],
  ['polkadot', 'DOT', 'Polkadot'], ['tron', 'TRX', 'TRON'], ['chainlink', 'LINK', 'Chainlink'],
  ['litecoin', 'LTC', 'Litecoin'], ['shiba-inu', 'SHIB', 'Shiba Inu'], ['bitcoin-cash', 'BCH', 'Bitcoin Cash'],
  ['uniswap', 'UNI', 'Uniswap'], ['stellar', 'XLM', 'Stellar'], ['avalanche-2', 'AVAX', 'Avalanche'],
  ['monero', 'XMR', 'Monero'], ['cosmos', 'ATOM', 'Cosmos'], ['near', 'NEAR', 'NEAR Protocol'],
  ['aptos', 'APT', 'Aptos'], ['arbitrum', 'ARB', 'Arbitrum'], ['optimism', 'OP', 'Optimism'],
  ['internet-computer', 'ICP', 'Internet Computer'], ['hedera-hashgraph', 'HBAR', 'Hedera'],
  ['filecoin', 'FIL', 'Filecoin'], ['dai', 'DAI', 'Dai'], ['pepe', 'PEPE', 'Pepe'], ['the-open-network', 'TON', 'Toncoin'],
];

const CG = 'https://api.coingecko.com/api/v3';

export interface CoinRow {
  id: string; sym: string; name: string; price: number; chg: number;
  spark: number[]; cap: number;
}

interface CacheEntry { ts: number; rows: CoinRow[]; live: boolean }

const g = globalThis as unknown as { __novaCryptoCache?: CacheEntry; __novaCryptoBusy?: boolean; __novaCryptoLastTry?: number };

export const coinOf = (id: string) => CATALOG.find(c => c[0] === id) || null;
export const symOf = (id: string) => { const c = coinOf(id); return c ? c[1] : id.slice(0, 3).toUpperCase(); };
export const nameOf = (id: string) => { const c = coinOf(id); return c ? c[2] : id; };

/* Busca una moneda por texto libre (símbolo, nombre o id) */
export function findCoin(text: string): { id: string; sym: string; name: string } | null {
  const t = text.toLowerCase().trim();
  for (const [id, sym, name] of CATALOG) {
    const aliases = [sym.toLowerCase(), name.toLowerCase().split(' ')[0], id.replace(/-/g, ' ')];
    for (const a of aliases) {
      const hit = a.length > 4 ? t.includes(a) : new RegExp('\\b' + a + '\\b').test(t);
      if (hit) return { id, sym, name };
    }
  }
  return null;
}

/* Obtiene precios en vivo (caché 60 s). SOLO datos reales:
   si no hay red y no hay caché devuelve rows vacío (live=false). */
export async function getPrices(): Promise<CacheEntry> {
  const cached = g.__novaCryptoCache;
  if (cached && Date.now() - cached.ts < 60000) return cached;
  if (g.__novaCryptoBusy) return cached || { ts: Date.now(), rows: [], live: false };
  g.__novaCryptoBusy = true;
  try {
    const ids = CATALOG.map(c => c[0]).join(',');
    const url = `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('respuesta vacía');
    const rows: CoinRow[] = raw.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      sym: (r.symbol as string || '').toUpperCase(),
      name: r.name as string,
      price: r.current_price as number,
      chg: (r.price_change_percentage_24h as number) || 0,
      spark: (r.sparkline_in_7d as { price: number[] } | null)?.price?.filter((_, i) => i % 4 === 0) || [],
      cap: (r.market_cap as number) || 0,
    }));
    const entry: CacheEntry = { ts: Date.now(), rows, live: true };
    g.__novaCryptoCache = entry;
    return entry;
  } catch {
    /* Sin conexión: se sirve la caché real si existe; nunca se inventan precios */
    return cached || { ts: Date.now(), rows: [], live: false };
  } finally {
    g.__novaCryptoBusy = false;
  }
}

/* Precio puntual de una moneda (solo datos reales) */
export async function priceOf(id: string): Promise<{ row: CoinRow | null }> {
  const { rows } = await getPrices();
  return { row: rows.find(r => r.id === id) || null };
}

/* ---------- Formato ---------- */
export function money(n: number): string {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
export function money2(n: number): string {
  const v = Number(n) || 0;
  const dec = v !== 0 && Math.abs(v) < 0.01 ? 6 : Math.abs(v) < 1 ? 4 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtAmt(n: number): string {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  return String(+v.toFixed(6));
}
