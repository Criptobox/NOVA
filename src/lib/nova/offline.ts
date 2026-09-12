'use client';

/* ============================================================
   NOVA v010 — MODO OFFLINE (cliente)
   La PWA sigue siendo usable sin conexión:
   · Snapshot de datos reales en localStorage (precios, tienda,
     estadísticas, operaciones) mientras hay conexión.
   · Motor local de comandos: responde con la última copia real
     y aplica cambios de stock de forma optimista.
   · Outbox: los comandos que necesitan servidor (reponer, ventas,
     recordatorios…) se encolan y se ejecutan solos al reconectar.
   Nada se inventa: los datos offline llevan su antigüedad.
   ============================================================ */

const K = {
  prices: 'nova:off:prices',
  products: 'nova:off:products',
  stats: 'nova:off:stats',
  trades: 'nova:off:trades',
  holdings: 'nova:off:holdings',
  outbox: 'nova:off:outbox',
} as const;

export interface CachedBox<T> { ts: number; data: T }
export interface OutboxItem { id: string; text: string; ts: number }

function get<T>(key: string): CachedBox<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CachedBox<T>;
  } catch { return null; }
}
function set<T>(key: string, data: T): void {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch { /* lleno */ }
}

/* ---------- Snapshots (se guardan desde el panel cuando hay red) ---------- */
export const cache = {
  prices: (rows: unknown) => set(K.prices, rows),
  products: (rows: unknown) => set(K.products, rows),
  stats: (s: unknown) => set(K.stats, s),
  trades: (t: unknown) => set(K.trades, t),
  holdings: (h: unknown) => set(K.holdings, h),
  read: {
    prices: () => get<CachedPrice[]>(K.prices),
    products: () => get<CachedProduct[]>(K.products),
    stats: () => get<CachedStats>(K.stats),
    trades: () => get<CachedTrade[]>(K.trades),
    holdings: () => get<CachedHolding[]>(K.holdings),
  },
};

export interface CachedPrice { id: string; sym: string; name: string; price: number; chg: number }
export interface CachedProduct { extId: string; nombre: string; categoria: string; precio: number; stock: number }
export interface CachedStats { contacts: number; msgs24h: number; alertsActive: number; portfolioTotal: number; shopCount: number; shopBajos: number; shopAgotados: number }
export interface CachedTrade { id: string; symbol: string; side: string; price: number; quoteQty: number; result: number | null; mode: string; reason: string; createdAt: string }
export interface CachedHolding { coinId: string; sym: string; amt: number }

/* ---------- Outbox ---------- */
function readOutbox(): OutboxItem[] {
  try { return JSON.parse(localStorage.getItem(K.outbox) || '[]') as OutboxItem[]; } catch { return []; }
}
function writeOutbox(items: OutboxItem[]): void {
  try { localStorage.setItem(K.outbox, JSON.stringify(items.slice(-40))); } catch { /* lleno */ }
}

export function outboxCount(): number {
  return readOutbox().length;
}

/** Encola un comando pendiente de sincronizar */
export function queueCommand(text: string): number {
  const items = readOutbox();
  items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, ts: Date.now() });
  writeOutbox(items);
  return items.length;
}

/** Reproduce la outbox contra el servidor al volver la conexión. */
export async function processOutbox(): Promise<{ done: number; failed: number }> {
  const items = readOutbox();
  if (!items.length) return { done: 0, failed: 0 };
  let done = 0, failed = 0;
  const rest: OutboxItem[] = [];
  for (const it of items) {
    try {
      const r = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `${it.text} (comando enviado sin conexión a las ${new Date(it.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })})` }),
      });
      if (r.ok) done++; else { failed++; rest.push(it); }
    } catch { failed++; rest.push(it); }
  }
  writeOutbox(rest);
  return { done, failed };
}

/* ---------- Ayudantes de formato ---------- */
function hace(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'menos de un minuto';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} días`;
}
function money(n: number): string {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export interface OfflineReply { reply: string; queued: boolean; optimistic?: boolean }

const OFFLINE_HELP = `📴 *Modo offline de NOVA*

Sin conexión sigo entendiendo estos comandos con la última copia guardada:
🪙 "precio btc" → último precio conocido (te digo de cuándo)
💼 "portafolio" → valor estimado con la última copia
📦 "stock bajo" / "agotados" / "stock de X" → última copia de tu tienda
📥 "reponer 5 batería" → lo apunto y lo ejecuto solo al reconectar 📤
💰 "venta de 2 batería a 300" → lo apunto igual
📊 "operaciones" → último resumen de trading
🧾 "estado" → resumen general guardado
⏰ "recordar …" → lo encolo para crearlo al reconectar

En cuanto vuelva la conexión, todo lo apuntado se envía al servidor solo.`;

/** Motor de comandos local (sin servidor). */
export function runOfflineCommand(input: string): OfflineReply {
  const t = input.toLowerCase().trim();

  if (/^(ayuda|help|menu|menú|comandos)$/.test(t)) return { reply: OFFLINE_HELP, queued: false };

  if (/^(estado|resumen general|cómo vas|como vas)/.test(t)) {
    const st = cache.read.stats();
    if (!st) return { reply: '📴 Todavía no tengo una copia guardada del estado. Cuando haya conexión, la guardo automáticamente.', queued: false };
    const d = st.data;
    return {
      reply: `🧾 *Estado guardado* (hace ${hace(st.ts)})\n• Contactos: ${d.contacts} · Mensajes 24 h: ${d.msgs24h}\n• Alertas vivas: ${d.alertsActive}\n• Portafolio: ~${money(d.portfolioTotal)}\n• Tienda: ${d.shopCount} productos · ${d.shopBajos} stock bajo · ${d.shopAgotados} agotados`,
      queued: false,
    };
  }

  // Precio cripto
  const precioM = t.match(/(?:precio|cuanto vale|cuánto vale|valor de)\s+(?:de\s+)?([a-z0-9]+)/);
  if (precioM) {
    const p = cache.read.prices();
    const rows = p?.data || [];
    const coin = rows.find(r => r.sym.toLowerCase() === precioM[1] || r.name.toLowerCase().includes(precioM[1]) || r.id === precioM[1]);
    if (!coin) return { reply: `📴 Sin conexión y "${precioM[1]}" no está en mi última copia guardada (${rows.length} monedas). En cuanto haya red te lo doy en vivo.`, queued: false };
    return {
      reply: `📴 *Último precio guardado* (hace ${hace(p!.ts)}):\n${coin.name} (${coin.sym}) = ${money(coin.price)} · ${coin.chg >= 0 ? '🟢 +' : '🔴 '}${coin.chg.toFixed(2)}% 24 h\n(Es la última copia real, no un dato en vivo.)`,
      queued: false,
    };
  }

  // Portafolio
  if (/portafolio|mis criptos|cu[aá]nto tengo/.test(t)) {
    const h = cache.read.holdings();
    const p = cache.read.prices();
    if (!h?.data.length || !p?.data.length) return { reply: '📴 No tengo copia del portafolio guardada todavía. Vuelve a conectar y la guardo.', queued: false };
    let total = 0;
    const lines = h.data.map(x => {
      const r = p.data.find(r2 => r2.id === x.coinId);
      const v = r ? x.amt * r.price : 0;
      total += v;
      return `• ${x.sym}: ${x.amt} ≈ ${money(v)}`;
    });
    return { reply: `📴 *Portafolio (hace ${hace(p.ts)})*\n${lines.join('\n')}\n≈ ${money(total)} en total`, queued: false };
  }

  // Stock (consultas)
  if (/stock bajo|agotados|qué falta|que falta/.test(t)) {
    const pr = cache.read.products();
    if (!pr?.data.length) return { reply: '📴 No tengo copia del inventario guardada. Al reconectar se actualiza sola.', queued: false };
    const bajos = pr.data.filter(x => x.stock > 0 && x.stock <= 3).slice(0, 8);
    const out = pr.data.filter(x => x.stock === 0).slice(0, 8);
    return {
      reply: `📴 *Inventario (hace ${hace(pr.ts)})*\n⚠️ Stock bajo: ${bajos.map(x => `${x.nombre} (${x.stock})`).join(' · ') || 'ninguno'}\n🚫 Agotados: ${out.map(x => x.nombre).join(' · ') || 'ninguno'}`,
      queued: false,
    };
  }
  const stockM = t.match(/(?:stock|cuanto queda|cuánto queda)\s+(?:de\s+|hay de\s+)?(.+)/);
  if (stockM) {
    const pr = cache.read.products();
    const rows = pr?.data || [];
    const hit = rows.find(x => x.nombre.toLowerCase().includes(stockM[1].trim()));
    if (!hit) return { reply: `📴 Sin conexión y no encuentro "${stockM[1].trim()}" en la copia guardada (${rows.length} productos).`, queued: false };
    return { reply: `📴 Última copia (hace ${hace(pr!.ts)}): *${hit.nombre}* tiene *${hit.stock} u* (${money(hit.precio)}).`, queued: false };
  }

  // Stock (escrituras → outbox + optimista)
  const repoM = t.match(/(?:repone|reponer|repo|agrega|añade|anade)\s+(\d+)\s+(.+)/);
  const elimM = t.match(/(?:elimina|eliminar|resta|quita|merma de?)\s+(\d+)\s+(.+)/);
  const ventaM = t.match(/(?:venta de|registrar venta|venta)\s+(\d+)\s+(.+?)(?:\s+a\s+([\d.]+))?$/);
  const write = repoM || elimM || ventaM;
  if (write) {
    const qty = parseInt((repoM || elimM || ventaM)![1], 10) || 1;
    const name = ((repoM?.[2] || elimM?.[2] || ventaM?.[2]) as string).trim();
    const pr = cache.read.products();
    const rows = pr?.data || [];
    const hit = rows.find(x => x.nombre.toLowerCase().includes(name));
    if (hit) {
      const before = hit.stock;
      hit.stock = repoM ? before + qty : elimM ? Math.max(0, before - qty) : Math.max(0, before - qty);
      cache.products(rows); // cambio optimista en la copia local
    }
    const n = queueCommand(input);
    return {
      reply: `📴 Sin conexión: lo he *apuntado* (${n} pendiente${n > 1 ? 's' : ''}).${hit ? `\nEn mi copia local ${hit.nombre} pasa a ${hit.stock} u.` : ''}\nEn cuanto vuelva la conexión lo ejecuto en el servidor y te confirmo. ✍️`,
      queued: true, optimistic: !!hit,
    };
  }

  // Recordatorio → outbox
  if (/(recordar|recu[eé]rdame|recordatorio)/.test(t)) {
    const n = queueCommand(input);
    return { reply: `📴 Sin conexión: apunto el recordatorio (${n} pendiente) y lo creo de verdad en cuanto vuelva la red.`, queued: true };
  }

  // Trading
  if (/operaciones|resumen trading|trading/.test(t)) {
    const tr = cache.read.trades();
    if (!tr?.data.length) return { reply: '📴 No tengo operaciones guardadas en la copia local.', queued: false };
    const lines = tr.data.slice(0, 5).map(x => `• ${x.side === 'BUY' ? '🟢 Compra' : '🔴 Venta'} ${x.symbol} ${x.quoteQty.toFixed(0)} USDT @ ${x.price}${x.result !== null ? ` (${x.result >= 0 ? '+' : ''}${x.result.toFixed(2)})` : ''}`);
    return { reply: `📴 *Últimas operaciones (hace ${hace(tr.ts)})*\n${lines.join('\n')}`, queued: false };
  }

  return {
    reply: '📴 Estoy en modo offline: solo puedo responder con la última copia guardada (cripto, portafolio, tienda, trading) y apuntar cambios de stock o recordatorios para ejecutarlos al reconectar. Escribe "ayuda" para ver qué funciona sin conexión.',
    queued: false,
  };
}
