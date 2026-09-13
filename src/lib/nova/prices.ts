/* ============================================================
   NOVA v005 — catálogo y precios cripto (servidor)
   · Catálogo curado de 30 monedas (CoinGecko) + cualquier moneda que
     el usuario añada a su portafolio o a una alerta (v019): getPrices()
     amplía la consulta con esos ids, así que deja de estar limitado
     a las 30 de siempre — es compatible con las ~17.000 de CoinGecko.
   · Logos originales: cada fila trae "image" (CDN de CoinGecko).
   · Precios en vivo con caché de 60 s — SOLO DATOS REALES:
     si CoinGecko falla y no hay caché se devuelve rows=[] y
     live=false (nada de precios inventados).
   · Portafolio, mejores/peores 24 h, resumen diario
   ============================================================ */
import { db } from '@/lib/db';

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
  spark: number[]; cap: number; image: string;
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

function rowFromRaw(r: Record<string, unknown>): CoinRow {
  return {
    id: r.id as string,
    sym: (r.symbol as string || '').toUpperCase(),
    name: r.name as string,
    price: (r.current_price as number) || 0,
    chg: (r.price_change_percentage_24h as number) || 0,
    spark: (r.sparkline_in_7d as { price: number[] } | null)?.price?.filter((_, i) => i % 4 === 0) || [],
    cap: (r.market_cap as number) || 0,
    image: (r.image as string) || '',
  };
}

/* v019 — ids adicionales a vigilar: cualquier moneda que el usuario haya
   añadido a su portafolio o a una alerta, aunque no esté en el catálogo
   curado. Así "añadir cualquier moneda" funciona de verdad: en cuanto se
   guarda un Holding o una PriceAlert con un id nuevo, el próximo refresco
   de precios (máx. 60 s) ya la incluye. */
async function trackedIds(): Promise<string[]> {
  try {
    const [holds, alerts] = await Promise.all([
      db.holding.findMany({ select: { coinId: true } }),
      db.priceAlert.findMany({ select: { coinId: true } }),
    ]);
    return [...holds.map(h => h.coinId), ...alerts.map(a => a.coinId)];
  } catch {
    return []; // sin BD todavía: se sirve solo el catálogo curado
  }
}

/* Obtiene precios en vivo (caché 60 s). SOLO datos reales:
   si no hay red y no hay caché devuelve rows vacío (live=false). */
export async function getPrices(): Promise<CacheEntry> {
  const cached = g.__novaCryptoCache;
  if (cached && Date.now() - cached.ts < 60000) return cached;
  if (g.__novaCryptoBusy) return cached || { ts: Date.now(), rows: [], live: false };
  g.__novaCryptoBusy = true;
  try {
    const extra = await trackedIds();
    const ids = Array.from(new Set([...CATALOG.map(c => c[0]), ...extra])).slice(0, 200);
    const url = `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids.join(','))}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('respuesta vacía');
    const rows: CoinRow[] = raw.map(rowFromRaw);
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

/* Precio puntual de una moneda (solo datos reales). Si el id no está en la
   caché general (p. ej. la preguntaron por WhatsApp antes de añadirla a
   ningún lado) se consulta sola, sin esperar al próximo refresco de 60 s. */
export async function priceOf(id: string): Promise<{ row: CoinRow | null }> {
  const { rows } = await getPrices();
  const hit = rows.find(r => r.id === id);
  if (hit) return { row: hit };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const url = `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(id)}&sparkline=true&price_change_percentage=24h`;
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return { row: null };
    const raw = await res.json();
    if (!Array.isArray(raw) || !raw.length) return { row: null };
    return { row: rowFromRaw(raw[0]) };
  } catch {
    return { row: null };
  }
}

export interface CoinSearchResult { id: string; sym: string; name: string; image: string }

/* v019 — Busca CUALQUIER moneda de CoinGecko por texto libre (símbolo o
   nombre, con o sin acentos). Alimenta el buscador de "añadir moneda" del
   panel y el reconocimiento de comandos de WhatsApp para monedas fuera del
   catálogo curado. */
export async function searchCoins(query: string): Promise<CoinSearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch(`${CG}/search?query=${encodeURIComponent(q)}`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return [];
    const data = await res.json();
    const coins = (data?.coins as Record<string, unknown>[]) || [];
    return coins.slice(0, 15).map(c => ({
      id: c.id as string,
      sym: (c.symbol as string || '').toUpperCase(),
      name: c.name as string,
      image: (c.large as string) || (c.thumb as string) || '',
    }));
  } catch {
    return [];
  }
}

/* Resuelve texto libre a una moneda: primero el catálogo curado local
   (instantáneo, sin red), luego cualquier moneda ya vigilada en la base
   (portafolio/alertas), y por último una búsqueda real en CoinGecko —
   así cualquier moneda que exista ahí queda reconocida, no solo las 30
   curadas. */
export async function resolveCoin(text: string): Promise<{ id: string; sym: string; name: string } | null> {
  const local = findCoin(text);
  if (local) return local;
  const t = text.toLowerCase().trim();
  const extra = await trackedIds();
  if (extra.length) {
    const { rows } = await getPrices();
    for (const id of new Set(extra)) {
      const r = rows.find(x => x.id === id);
      const sym = r?.sym.toLowerCase() || id;
      if (new RegExp('\\b' + sym + '\\b').test(t)) return { id, sym: r?.sym || id.toUpperCase(), name: r?.name || id };
    }
  }
  const results = await searchCoins(text);
  if (!results.length) return null;
  const exact = results.find(r => t.split(/\s+/).includes(r.sym.toLowerCase()));
  const best = exact || results[0];
  return { id: best.id, sym: best.sym, name: best.name };
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
