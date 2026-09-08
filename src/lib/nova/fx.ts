/* ============================================================
   NOVA v004 — conversor de divisas (gratis, sin API key)
   · open.er-api.com (161 divisas, actualización diaria) → principal
   · frankfurter.app (Banco Central Europeo) → respaldo
   · Caché en memoria 6 h · Parser en español: "100 usd a mxn"
   ============================================================ */

export interface CurrencyDef { code: string; name: string; aliases: string[] }

export const CURRENCIES: CurrencyDef[] = [
  { code: 'USD', name: 'dólares estadounidenses', aliases: ['usd', 'dolar', 'dólar', 'dolares', 'dólares', 'dolars', 'verdes', 'us$'] },
  { code: 'EUR', name: 'euros', aliases: ['eur', 'euro', 'euros', '€'] },
  { code: 'MXN', name: 'pesos mexicanos', aliases: ['mxn', 'peso mexicano', 'pesos mexicanos', 'pesos', 'peso', 'lucias'] },
  { code: 'ARS', name: 'pesos argentinos', aliases: ['ars', 'peso argentino', 'pesos argentinos', 'patacones'] },
  { code: 'COP', name: 'pesos colombianos', aliases: ['cop', 'peso colombiano', 'pesos colombianos'] },
  { code: 'CLP', name: 'pesos chilenos', aliases: ['clp', 'peso chileno', 'pesos chilenos'] },
  { code: 'PEN', name: 'soles peruanos', aliases: ['pen', 'sol', 'soles', 'sol peruano'] },
  { code: 'BRL', name: 'reales brasileños', aliases: ['brl', 'real', 'reales', 'reais'] },
  { code: 'GBP', name: 'libras esterlinas', aliases: ['gbp', 'libra', 'libras', '£'] },
  { code: 'JPY', name: 'yenes japoneses', aliases: ['jpy', 'yen', 'yenes', '¥'] },
  { code: 'CAD', name: 'dólares canadienses', aliases: ['cad', 'dolar canadiense', 'dólares canadienses'] },
  { code: 'CHF', name: 'francos suizos', aliases: ['chf', 'franco suizo', 'francos suizos', 'francos'] },
  { code: 'CNY', name: 'yuanes chinos', aliases: ['cny', 'yuan', 'yuanes', 'rmb'] },
  { code: 'AUD', name: 'dólares australianos', aliases: ['aud', 'dolar australiano', 'dólares australianos'] },
  { code: 'INR', name: 'rupias indias', aliases: ['inr', 'rupia', 'rupias'] },
  { code: 'KRW', name: 'wones surcoreanos', aliases: ['krw', 'won', 'wones'] },
  { code: 'TRY', name: 'liras turcas', aliases: ['try', 'lira', 'liras'] },
  { code: 'ZAR', name: 'rands sudafricanos', aliases: ['zar', 'rand', 'rands'] },
  { code: 'NZD', name: 'dólares neozelandeses', aliases: ['nzd'] },
  { code: 'SEK', name: 'coronas suecas', aliases: ['sek', 'corona sueca', 'coronas suecas'] },
];

const FX_CACHE_MS = 6 * 3600 * 1000;

interface FxCache { ts: number; rates: Record<string, number>; src: string }
const g = globalThis as unknown as { __novaFxCache?: FxCache; __novaFxBusy?: boolean };

async function fetchErApi(): Promise<FxCache | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json() as { result?: string; rates?: Record<string, number> };
    if (d.result !== 'success' || !d.rates) return null;
    return { ts: Date.now(), rates: d.rates, src: 'open.er-api.com' };
  } catch { return null; }
}

async function fetchFrankfurter(): Promise<FxCache | null> {
  try {
    const codes = CURRENCIES.map(c => c.code).filter(c => c !== 'USD').join(',');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${codes}`, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    if (!res.ok) return null;
    const d = await res.json() as { rates?: Record<string, number> };
    if (!d.rates) return null;
    return { ts: Date.now(), rates: { USD: 1, ...d.rates }, src: 'frankfurter.app (BCE)' };
  } catch { return null; }
}

/* Tasas USD→divisa con caché de 6 h. Devuelve null si no hay conexión. */
export async function getFxRates(): Promise<FxCache | null> {
  const c = g.__novaFxCache;
  if (c && Date.now() - c.ts < FX_CACHE_MS) return c;
  if (g.__novaFxBusy) return c || null;
  g.__novaFxBusy = true;
  try {
    const fresh = (await fetchErApi()) || (await fetchFrankfurter());
    if (fresh) g.__novaFxCache = fresh;
    return fresh || c;
  } finally {
    g.__novaFxBusy = false;
  }
}

/* Busca una divisa por texto libre (código, nombre o alias en español) */
export function findCurrency(text: string): CurrencyDef | null {
  const t = text.toLowerCase();
  // 1) código exacto de 3 letras como palabra
  const code = t.match(/\b([a-z]{3})\b/);
  if (code) {
    const byCode = CURRENCIES.find(c => c.code.toLowerCase() === code[1]);
    if (byCode) return byCode;
  }
  // 2) alias (el más largo primero para no confundir "pesos mexicanos" con "pesos")
  const sorted = [...CURRENCIES].sort((a, b) => b.aliases.length - a.aliases.length);
  for (const c of sorted) {
    for (const a of [...c.aliases].sort((x, y) => y.length - x.length)) {
      if (t.includes(a)) return c;
    }
  }
  return null;
}

export interface FxResult {
  ok: true;
  amount: number; from: CurrencyDef; to: CurrencyDef;
  result: number; unitRate: number; src: string; ageH: number;
}

export interface FxError { ok: false; reason: 'sin-red' | 'sin-divisa' }

/* Convierte amount de una divisa a otra (vía USD como puente) */
export async function convertCurrency(amount: number, from: CurrencyDef, to: CurrencyDef): Promise<FxResult | FxError> {
  const fx = await getFxRates();
  if (!fx) return { ok: false, reason: 'sin-red' };
  const usdFrom = from.code === 'USD' ? 1 : fx.rates[from.code];
  const usdTo = to.code === 'USD' ? 1 : fx.rates[to.code];
  if (!usdFrom || !usdTo) return { ok: false, reason: 'sin-red' };
  const usdAmount = amount / usdFrom;         // divisa origen → USD
  const result = usdAmount * usdTo;           // USD → divisa destino
  const unitRate = usdTo / usdFrom;           // 1 from = ? to
  return {
    ok: true, amount, from, to, result, unitRate, src: fx.src,
    ageH: Math.max(0, Math.round((Date.now() - fx.ts) / 3600000)),
  };
}

const fmtN = (n: number): string => {
  const v = Number(n) || 0;
  const dec = Math.abs(v) >= 1000 ? 2 : Math.abs(v) >= 1 ? 2 : 4;
  return v.toLocaleString('es-MX', { maximumFractionDigits: dec });
};

/* Formatea el resultado como mensaje de WhatsApp */
export function formatFxReply(r: FxResult): string {
  return `💱 ${fmtN(r.amount)} ${r.from.code} = *${fmtN(r.result)} ${r.to.code}*\n(1 ${r.from.code} = ${fmtN(r.unitRate)} ${r.to.code} · tasa en vivo vía ${r.src}${r.ageH > 0 ? `, hace ${r.ageH} h` : ''})`;
}

/* Parser de intención de conversión en español.
   Ejemplos: "100 usd a mxn", "convierte 50 euros a dolares",
   "cuanto son 100 dolares en pesos mexicanos", "20 eur → gbp" */
export function parseFxIntent(text: string): { amount: number; from: CurrencyDef; to: CurrencyDef } | null {
  const t = text.toLowerCase();
  if (!/(converti|cambia|cambiar|cambio|c[uú]anto|cuantos|cu[aá]ntos|cu[aá]nto son|→|->| a | en )/.test(t)) return null;
  const numM = t.match(/([\d][\d.,]*)/);
  if (!numM) return null;
  const amount = parseFloat(numM[1].replace(/,/g, ''));
  if (!(amount > 0)) return null;
  const before = t.slice(0, numM.index || 0) + ' ' + (t.slice((numM.index || 0) + numM[1].length).split(/\b(?:a|en|to|→|->)\b/)[0] || '');
  const afterIdx = t.search(/\b(a|en|to|→|->)\b/);
  if (afterIdx < 0) return null;
  const after = t.slice(afterIdx + 2);
  const from = findCurrency(before) || findCurrency(t.replace(/\b(a|en|to)\b.*$/, ' '));
  const to = findCurrency(after);
  if (!from || !to) return null;
  if (from.code === to.code) return null;
  return { amount, from, to };
}
