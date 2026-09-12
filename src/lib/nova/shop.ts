/* ============================================================
   NOVA v007 — CONTROL DE TIENDA TIENTAMAX POR VOZ
   La tienda (tiendamax.org) vive en GitHub Pages y su base de
   datos es productos.json. El propio panel admin de TiendaMax
   guarda cambios con la GitHub Contents API (GET sha → PUT).
   NOVA hace lo mismo:
   · Lectura: pública (tiendamax.org / raw.githubusercontent) — sin token.
   · Escritura: PUT Contents API con el token del dueño (Contents:write),
     igual que el admin oficial → la tienda se actualiza al regenerar Pages.
   · Sin token: modo simulación honesta (cambios solo en el panel).
   ============================================================ */
import { db } from '@/lib/db';
import type { NovaSettings } from './settings';

/* ---------- Tipos ---------- */
export interface TmProduct {
  id: number | string;
  nombre: string;
  slug?: string;
  categoria?: string;
  subcategoria?: string;
  precioActual?: number;
  stock?: number;
  imagen?: string;
  [k: string]: unknown; // resto de campos del JSON real (se preservan al guardar)
}

export interface CatalogResult {
  rows: TmProduct[];
  source: 'github' | 'raw' | 'site' | 'cache' | 'ninguno';
  live: boolean;
}

export type ShopIntent =
  | 'venta' | 'reposicion' | 'eliminacion' | 'ajuste'
  | 'consulta' | 'bajostock' | 'agotados' | 'listado';

export interface ShopCommand {
  intent: ShopIntent;
  qty: number;      // unidades (ajuste: valor objetivo)
  price: number | null; // venta: precio unitario si lo dijo
}

export interface MoveResult {
  ok: boolean;
  reason?: string;
  detail?: string;
  kind?: ShopIntent;
  nombre?: string;
  before?: number;
  after?: number;
  delta?: number;
  unitPrice?: number | null;
  total?: number | null;
  sync?: 'github' | 'sim';
  commitUrl?: string;
  low?: boolean;
}

/* ---------- Credenciales (env tiene prioridad, como en WhatsApp) ---------- */
export function ghCreds(s: NovaSettings) {
  return {
    user: process.env.GITHUB_USER || s.ghUser || '',
    repo: process.env.GITHUB_REPO || s.ghRepo || 'Tiendamax',
    branch: s.ghBranch || 'main',
    path: s.ghPath || 'productos.json',
    site: s.ghSite || 'https://tiendamax.org',
    token: process.env.GITHUB_TOKEN || s.ghToken || '',
  };
}

const GH_HEADERS = (token: string): Record<string, string> => ({
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'NOVA-Agent',
  ...(token ? { Authorization: `token ${token}` } : {}),
});

/* ---------- Normalización y búsqueda difusa ---------- */
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'con', 'para', 'por', 'tipo']);

export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos
    .replace(/[^\p{L}\p{N} ]/gu, ' ') // emojis y puntuación
    .replace(/\s+/g, ' ')
    .trim();
}

interface ScoredProduct { p: TmProduct; score: number }

export function findScored(query: string, rows: TmProduct[]): ScoredProduct[] {
  const q = norm(query);
  if (!q || !rows.length) return [];
  const tokens = q.split(' ').filter(t => t.length > 2 && !STOP.has(t));
  const scored = rows.map(p => {
    const name = norm(p.nombre || '');
    const slug = norm(p.slug || '');
    let score = 0;
    if (name && q.includes(name)) score += 100;
    if (slug && q.includes(slug)) score += 90;
    const nameTokens = name.split(' ').filter(t => t.length > 2 && !STOP.has(t));
    let hits = 0;
    for (const nt of nameTokens) {
      if (q.includes(nt)) { score += 12; hits++; }
      else if (nt.length > 4 && tokens.some(t => t.startsWith(nt.slice(0, 4)) && nt.startsWith(t.slice(0, 4)))) score += 5;
    }
    if (nameTokens.length && hits === nameTokens.length) score += 25; // todas las palabras
    if (p.categoria && q.includes(norm(p.categoria))) score += 4;
    if (p.subcategoria && q.includes(norm(p.subcategoria))) score += 4;
    return { p, score };
  });
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || String(b.p.nombre).length - String(a.p.nombre).length);
}

/* Resuelve 1 producto: coincidencia clara, ambigua o nula */
export function resolveProduct(query: string, rows: TmProduct[]):
  | { status: 'ok'; product: TmProduct }
  | { status: 'ambiguo'; cands: TmProduct[] }
  | { status: 'nada' } {
  const scored = findScored(query, rows).filter(x => x.score >= 12);
  if (!scored.length) return { status: 'nada' };
  const [top, second] = scored;
  // claro si: score alto, o token único que solo coincide con 1 producto
  if (top.score >= 24 && (!second || top.score - second.score >= 12)) return { status: 'ok', product: top.p };
  if (top.score >= 12 && !second) return { status: 'ok', product: top.p };
  if (top.score - second.score >= 20) return { status: 'ok', product: top.p };
  return { status: 'ambiguo', cands: scored.slice(0, 3).map(x => x.p) };
}

/* ---------- Números en español ---------- */
const WORD_NUM: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, docena: 12, trece: 13, catorce: 14,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};

/* ---------- Parser de comandos de tienda (texto ya en minúsculas) ---------- */
const RX = {
  bajostock: /\bstock bajo\b|\bproductos? (casi|por) agotar|\bse acaban?\b|\bquedan pocos\b|\bcasi sin (stock|existencias)\b/,
  agotados: /\bagotados?\b|\bsin stock\b|\bse agoto\b|\bse acabaron\b/,
  listado: /\b(catalogo|inventario completo|lista de productos|todos los productos)\b/,
  venta: /\b(venta|vendi|vendimos|vendio|se vendio|se vendieron|registr(?:a|ar|ame) (?:la )?venta)\b/,
  ajuste: /\b(deja|dejar|dejame|pon|pone|poner|fija|fijar|fijame|ajusta|ajustar|setea)\b.*\bstock\b|\bstock\b.*\b(en|a)\b\s*[\d]/,
  eliminacion: /\b(elimina|eliminar|quita|quitar|resta|restar|reduce|reducir|baja|bajar|saca|sacar|descuenta|descontar)\b/,
  reposicion: /\b(reposicionar|reposicion|reponer|repones|repongo|repuesto|reabastecer|reabastec|llegaron|llego|anadir|anade|anado|agregar|agrega|agrego|sumar|suma|sumo|sume|meter|mete|meto|aumentar|aumenta|aumento|entraron|entran|entra)\b/,
  consulta: /\b(stock|inventario|existencias?|cuanto hay|cuantos hay|cuantas hay|cuanto queda|cuantos quedan|cuantas quedan|quedan|queda)\b/,
};

export function parseShopCommand(text: string): ShopCommand | null {
  const t = norm(text);
  if (!t) return null;
  // Palabras-número → dígitos en una copia para extraer cantidades
  const withWords = t.split(' ').map(w => WORD_NUM[w] !== undefined ? String(WORD_NUM[w]) : w).join(' ');

  const qtyOf = (): number => {
    // descarta decimales de nombres técnicos ("2.0") con (?![.\d])
    const m = withWords.match(/(?:^|[\s(])(\d{1,4})(?![.\d])\s*(?:unidades?|uds?|u\b|piezas?|pch)?(?=[\s,;.?!]|$)/);
    return m ? parseInt(m[1], 10) : 1;
  };
  const priceOf = (): number | null => {
    const m = withWords.match(/(?:a|@|en|por|c\/u|cada una|cada uno|unitario)\s*\$\s*(\d+(?:[.,]\d{1,2})?)\s*$|(\d+(?:[.,]\d{1,2})?)\s*(?:c\/u|cada una|cada uno|dolares|dolar|usd|pesos|mn)\s*$|(?:a|@|en|por)\s*\$?\s*(\d+(?:[.,]\d{1,2})?)\s*$/);
    if (!m) return null;
    const raw = m[1] || m[2] || m[3];
    if (!raw) return null;
    const v = parseFloat(raw.replace(',', '.'));
    return Number.isFinite(v) && v >= 0 ? v : null;
  };

  if (RX.bajostock.test(t)) return { intent: 'bajostock', qty: 0, price: null };
  if (RX.agotados.test(t)) return { intent: 'agotados', qty: 0, price: null };
  if (RX.listado.test(t)) return { intent: 'listado', qty: 0, price: null };
  if (RX.venta.test(t)) {
    // primero el precio (al final, tras "a|en|por|@"), y se retira del texto;
    // la cantidad es el primer número restante (evita confundir "HDMI 2.0" con 2 u)
    const price = priceOf();
    let rest = withWords;
    if (price !== null) {
      rest = rest.replace(/(?:a|@|en|por|c\/u|cada una|cada uno|unitario)\s*\$?\s*\d+(?:[.,]\d{1,2})?\s*(?:c\/u|cada una|cada uno|dolares|dolar|usd|pesos|mn)?\s*$/, ' ');
    }
    const nums = rest.match(/\d+(?:[.,]\d+)?/g) || [];
    let qty = qtyOf();
    if (qty <= 1 && nums.length && nums[0]) {
      const first = parseFloat(nums[0].replace(/\.$/, ''));
      if (Number.isFinite(first) && first >= 1 && Number.isInteger(first)) qty = Math.round(first);
    }
    return { intent: 'venta', qty: Math.max(1, qty), price };
  }
  if (RX.ajuste.test(t)) {
    // objetivo = número tras "en|a" al final ("deja el stock de X en 5" → 5), no el 1.er número (nombre tipo "Cargador 10 A")
    const m = withWords.match(/(?:en|a)\s*(\d{1,4})\s*$/);
    const target = m ? parseInt(m[1], 10) : qtyOf();
    return { intent: 'ajuste', qty: Math.max(0, target), price: null };
  }
  if (RX.eliminacion.test(t)) return { intent: 'eliminacion', qty: Math.max(1, qtyOf()), price: null };
  if (RX.reposicion.test(t)) return { intent: 'reposicion', qty: Math.max(1, qtyOf()), price: null };
  if (RX.consulta.test(t)) return { intent: 'consulta', qty: 0, price: null };
  return null;
}

/* ---------- Lectura del catálogo real (con caché 60 s) ---------- */
let cache: { at: number; cat: CatalogResult } | null = null;
const TTL = 60_000;

async function ghGetFile(user: string, repo: string, path: string, branch: string, token: string) {
  const url = `https://api.github.com/repos/${user}/${repo}/contents/${path}?ref=${branch}&_=${Date.now()}`;
  const r = await fetch(url, { headers: GH_HEADERS(token), cache: 'no-store' });
  if (!r.ok) throw new Error(`github ${r.status}`);
  const j = (await r.json()) as { encoding: string; content: string; sha: string; html_url?: string };
  const json = JSON.parse(Buffer.from(j.content.replace(/\s/g, ''), 'base64').toString('utf-8'));
  return { rows: json as TmProduct[], sha: j.sha as string };
}

export async function fetchCatalog(s: NovaSettings, opts: { fresh?: boolean } = {}): Promise<CatalogResult> {
  if (!opts.fresh && cache && Date.now() - cache.at < TTL) return cache.cat;
  const { user, repo, branch, path, site, token } = ghCreds(s);

  // 1) GitHub API (con token, fuente de verdad para escribir)
  if (user && token) {
    try {
      const { rows } = await ghGetFile(user, repo, path, branch, token);
      const cat = { rows, source: 'github' as const, live: true };
      cache = { at: Date.now(), cat };
      await syncMirror(rows);
      return cat;
    } catch { /* sigue */ }
  }
  // 2) raw.githubusercontent (repo público, sin token)
  if (user) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${user}/${repo}/${branch}/${path}?_=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) {
        const rows = (await r.json()) as TmProduct[];
        const cat = { rows, source: 'raw' as const, live: true };
        cache = { at: Date.now(), cat };
        await syncMirror(rows);
        return cat;
      }
    } catch { /* sigue */ }
  }
  // 3) El sitio en vivo (lectura pública, como un visitante)
  try {
    const r = await fetch(`${site}/productos.json?_=${Date.now()}`, { cache: 'no-store', headers: { 'User-Agent': 'NOVA-Agent' } });
    if (r.ok) {
      const rows = (await r.json()) as TmProduct[];
      const cat = { rows, source: 'site' as const, live: true };
      cache = { at: Date.now(), cat };
      await syncMirror(rows);
      return cat;
    }
  } catch { /* sigue */ }

  // 4) Última copia local (nunca inventar)
  const mirror = await db.shopProduct.findMany({ orderBy: { nombre: 'asc' } });
  if (mirror.length) {
    const rows: TmProduct[] = mirror.map(m => ({
      id: m.extId, nombre: m.nombre, slug: m.slug, categoria: m.categoria,
      subcategoria: m.subcat, precioActual: m.precio, stock: m.stock, imagen: m.imagen,
    }));
    return { rows, source: 'cache', live: false };
  }
  return { rows: [], source: 'ninguno', live: false };
}

async function syncMirror(rows: TmProduct[]): Promise<void> {
  for (const p of rows) {
    if (p?.id === undefined || p?.id === null) continue;
    const extId = String(p.id);
    const data = {
      nombre: String(p.nombre || 'Producto'),
      slug: String(p.slug || ''),
      categoria: String(p.categoria || ''),
      subcat: String(p.subcategoria || ''),
      precio: Number(p.precioActual) || 0,
      stock: Math.max(0, Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0),
      imagen: String(p.imagen || ''),
    };
    await db.shopProduct.upsert({ where: { extId }, update: data, create: { extId, ...data } });
  }
}

export { syncMirror };

/* ---------- Escritura: mover stock / registrar venta ---------- */
export interface MoveArgs {
  extId: string;
  kind: 'reposicion' | 'eliminacion' | 'venta' | 'ajuste';
  qty: number;
  unitPrice?: number | null;
  note?: string;
  source?: 'voz' | 'panel';
}

const KIND_LABEL: Record<string, string> = {
  reposicion: 'Reposición', eliminacion: 'Ajuste −', venta: 'Venta', ajuste: 'Stock fijado',
};

export async function applyMove(s: NovaSettings, args: MoveArgs): Promise<MoveResult> {
  const { user, repo, branch, path, site, token } = ghCreds(s);
  const sim = s.shopSim; // simulación explícita en Ajustes

  if (!sim && !token) {
    return { ok: false, reason: 'sin-token', detail: 'Para subir cambios a la tienda hace falta el token de GitHub (Ajustes → Conexión tienda).' };
  }

  const qty = Math.max(0, Math.round(args.qty));
  const note = (args.note || '').slice(0, 140);
  const source = args.source || 'voz';

  /* --- MODO REAL: leer del repo, modificar, PUT con sha --- */
  if (!sim) {
    try {
      const { rows, sha } = await ghGetFile(user, repo, path, branch, token);
      const idx = rows.findIndex(p => String(p?.id) === args.extId);
      if (idx < 0 || !rows[idx]) return { ok: false, reason: 'no-encontrado' };
      const p = rows[idx];
      const before = Math.max(0, Number(p.stock) || 0);
      const after = args.kind === 'reposicion' ? before + qty
        : args.kind === 'ajuste' ? qty
        : Math.max(0, before - qty);
      // venta sin existencias: no commitear ni registrar phantom-sale
      if (args.kind === 'venta' && before === 0) {
        return { ok: true, kind: 'venta', nombre: String(p.nombre), before, after, delta: 0, unitPrice: args.unitPrice ?? (Number(p.precioActual) || 0), total: 0, sync: 'github', low: false, detail: 'sin-stock' };
      }
      p.stock = after;
      const json = JSON.stringify(rows, null, 2);
      const body: Record<string, unknown> = {
        message: `NOVA · ${KIND_LABEL[args.kind]} ${args.kind === 'ajuste' ? '→' : (qty > 0 ? (args.kind === 'reposicion' ? '+' + qty : '−' + qty) : '')} · ${p.nombre} (stock ${before} → ${after})${note ? ` · ${note}` : ''}`,
        content: Buffer.from(json, 'utf-8').toString('base64'),
        branch,
      };
      if (sha) body.sha = sha;
      const put = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/${path}`, {
        method: 'PUT', headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!put.ok) {
        const txt = await put.text().catch(() => '');
        if (put.status === 401) return { ok: false, reason: 'token-invalido' };
        if (put.status === 403) return { ok: false, reason: 'sin-permiso', detail: txt.slice(0, 120) };
        if (put.status === 422 || put.status === 409) return { ok: false, reason: 'conflicto' };
        return { ok: false, reason: 'github-error', detail: `HTTP ${put.status}` };
      }
      const j = (await put.json()) as { commit?: { html_url?: string } };
      const units = Math.max(0, before - after); // unidades realmente descontadas (venta parcial incluida)
      const unitPrice = args.kind === 'venta' ? (args.unitPrice ?? (Number(p.precioActual) || 0)) : null;
      const total = args.kind === 'venta' ? +(units * (unitPrice as number)).toFixed(2) : null;
      await logMove(args, p.nombre as string, before, after, unitPrice, total, 'github', j.commit?.html_url || '');
      await syncMirror(rows);
      cache = null; // forzar refresco
      // Producto volvió a tener stock → el flujo oficial de TiendaMax avisa a suscriptores
      if (before === 0 && after > 0) void triggerFlush(s);
      return finish(args, p.nombre as string, before, after, unitPrice, total, 'github', j.commit?.html_url || '', s);
    } catch (e) {
      return { ok: false, reason: 'sin-red', detail: e instanceof Error ? e.message : 'error GitHub' };
    }
  }

  /* --- MODO SIMULACIÓN: el espejo local es la fuente de verdad (autocoherente) --- */
  try {
    let m = await db.shopProduct.findUnique({ where: { extId: args.extId } });
    if (!m) {
      const cat = await fetchCatalog(s); // poblar el espejo con el catálogo en vivo
      if (!cat.rows.length) return { ok: false, reason: 'sin-catalogo' };
      m = await db.shopProduct.findUnique({ where: { extId: args.extId } });
    }
    if (!m) return { ok: false, reason: 'no-encontrado' };
    const before = m.stock;
    const after = args.kind === 'reposicion' ? before + qty
      : args.kind === 'ajuste' ? qty
      : Math.max(0, before - qty);
    // venta sin existencias: no mutar ni registrar phantom-sale
    if (args.kind === 'venta' && before === 0) {
      return { ok: true, kind: 'venta', nombre: m.nombre, before, after, delta: 0, unitPrice: args.unitPrice ?? (m.precio || 0), total: 0, sync: 'sim', low: false, detail: 'sin-stock' };
    }
    const units = Math.max(0, before - after);
    const unitPrice = args.kind === 'venta' ? (args.unitPrice ?? (m.precio || 0)) : null;
    const total = args.kind === 'venta' ? +(units * (unitPrice as number)).toFixed(2) : null;
    await db.shopProduct.update({ where: { extId: args.extId }, data: { stock: after } });
    await logMove(args, m.nombre, before, after, unitPrice, total, 'sim', '');
    return finish(args, m.nombre, before, after, unitPrice, total, 'sim', '', s);
  } catch (e) {
    return { ok: false, reason: 'sin-catalogo', detail: e instanceof Error ? e.message : '' };
  }
}

async function logMove(
  args: MoveArgs, nombre: string, before: number, after: number,
  unitPrice: number | null, total: number | null, sync: 'github' | 'sim', commitUrl: string,
): Promise<void> {
  await db.stockMove.create({
    data: {
      extId: args.extId, nombre, kind: args.kind,
      delta: after - before, before, after, qty: Math.round(args.qty),
      unitPrice, total, note: (args.note || '').slice(0, 140),
      source: args.source || 'voz', sync, commitUrl,
    },
  });
}

function finish(
  args: MoveArgs, nombre: string, before: number, after: number,
  unitPrice: number | null, total: number | null, sync: 'github' | 'sim', commitUrl: string, s: NovaSettings,
): MoveResult {
  const low = after <= (s.lowStock || 3) && after > 0;
  let detail: string | undefined;
  if (args.kind === 'venta' && after === before && before === 0) detail = 'sin-stock';
  else if (after === 0) detail = 'agotado';
  return {
    ok: true, kind: args.kind, nombre, before, after, delta: after - before,
    unitPrice, total, sync, commitUrl, low, detail,
  };
}

/* ---------- Avisos "volvió el stock" (flujo oficial de TiendaMax) ---------- */
export async function triggerFlush(s: NovaSettings): Promise<boolean> {
  try {
    const { user, repo, branch, token } = ghCreds(s);
    if (!user || !token) return false;
    const r = await fetch(`https://api.github.com/repos/${user}/${repo}/actions/workflows/flush-push-queue.yml/dispatches`, {
      method: 'POST',
      headers: { ...GH_HEADERS(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: branch }),
    });
    return r.status === 204;
  } catch { return false; }
}

/* ---------- Prueba de conexión GitHub ---------- */
export async function testGithub(s: NovaSettings): Promise<{ ok: boolean; push?: boolean; fileOk?: boolean; message: string }> {
  const { user, repo, branch, path, token } = ghCreds(s);
  if (!user || !token) return { ok: false, message: 'Falta el usuario o el token de GitHub.' };
  try {
    const r = await fetch(`https://api.github.com/repos/${user}/${repo}`, { headers: GH_HEADERS(token), cache: 'no-store' });
    if (r.status === 401) return { ok: false, message: 'El token no es válido o venció. Genera uno nuevo en GitHub.' };
    if (r.status === 404) return { ok: false, message: `No se encontró ${user}/${repo}. Revisa el usuario y el nombre del repo (¿el token puede verlo?).` };
    if (!r.ok) return { ok: false, message: `GitHub respondió HTTP ${r.status}.` };
    const j = (await r.json()) as { permissions?: { push?: boolean }; default_branch?: string };
    const push = !!j.permissions?.push;
    const fr = await fetch(`https://api.github.com/repos/${user}/${repo}/contents/${path}?ref=${branch}`, { headers: GH_HEADERS(token), cache: 'no-store' });
    const fileOk = fr.ok;
    if (!push) return { ok: true, push: false, fileOk, message: 'El token entra al repo pero NO puede escribir: necesita permiso de escritura en "Contents".' };
    return { ok: true, push, fileOk, message: fileOk ? `Conexión OK: ${user}/${repo} con permiso de escritura y ${path} encontrado.` : `Conexión OK, pero no encontré ${path} en la rama ${branch}.` };
  } catch {
    return { ok: false, message: 'Sin conexión con GitHub ahora mismo.' };
  }
}

/* ---------- Respuestas del agente (texto) ---------- */
const fmtUSD = (n: number) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

export function suggestCandidates(cands: TmProduct[]): string {
  const lines = cands.slice(0, 3).map(p => `• ${p.nombre} (stock: ${Math.max(0, Number(p.stock) || 0)})`);
  return `Encontré varios productos parecidos. ¿Cuál es? Repite el comando con más palabras del nombre:\n${lines.join('\n')}`;
}

export async function shopReply(s: NovaSettings, text: string, cmd: ShopCommand, source: 'voz' | 'panel' = 'voz'): Promise<string> {
  const cat = await fetchCatalog(s);
  if (!cat.rows.length) {
    return '📦 Ahora mismo no puedo leer el catálogo de tu tienda (sin conexión con tiendamax.org). Pruebo no inventarme nada: intenta en unos minutos.';
  }

  /* Consultas (solo lectura) */
  const wantAmbiguo = (cands: TmProduct[]): boolean =>
    !(cands.length === 1 || norm(text).includes(norm(String(cands[0].nombre || '###'))));
  if (cmd.intent === 'bajostock' || cmd.intent === 'agotados') {
    const lim = s.lowStock || 3;
    const agotados = cat.rows
      .filter(p => (Math.max(0, Number(p.stock) || 0)) === 0)
      .sort((a, b) => (Number(b.precioActual) || 0) - (Number(a.precioActual) || 0));
    const bajos = cat.rows
      .filter(p => { const st = Math.max(0, Number(p.stock) || 0); return st > 0 && st <= lim; })
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0));
    if (cmd.intent === 'agotados') {
      if (!agotados.length) return '📦 Buenas noticias: no hay productos agotados en tu tienda ahora mismo.';
      const lines = agotados.slice(0, 10).map(p => `• ${p.nombre} · ${fmtUSD(Number(p.precioActual) || 0)}`);
      const resto = agotados.length > 10 ? `\n…y ${agotados.length - 10} más.` : '';
      return `🚫 *Agotados* (${agotados.length}) en tu tienda:\n${lines.join('\n')}${resto}\n\nDi *"reponer N ${norm(agotados[0].nombre).split(' ').slice(0, 2).join(' ')}"* y lo subo a la tienda.`;
    }
    if (!bajos.length) {
      return agotados.length
        ? `📦 No queda nada por debajo de ${lim} unidades, pero tienes *${agotados.length} productos agotados*. Di *"agotados"* para verlos.`
        : `📦 Nada por debajo de ${lim} unidades. Todo tu inventario respira tranquilo.`;
    }
    const lines = bajos.map(p => `• ${p.nombre} — *${Number(p.stock)} u* · ${fmtUSD(Number(p.precioActual) || 0)}`);
    const notaAgot = agotados.length ? `\n\nAdemás hay *${agotados.length} agotados* — di *"agotados"* para verlos.` : '';
    return `⚠️ *Stock bajo* (${bajos.length} productos con ≤ ${lim} u):\n${lines.join('\n')}${notaAgot}\n\nDi por ejemplo *"reponer 5 ${norm(bajos[0].nombre).split(' ').slice(0, 2).join(' ')}"* y lo subo a la tienda.`;
  }
  if (cmd.intent === 'listado') {
    const totalU = cat.rows.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0), 0);
    const valor = cat.rows.reduce((a, p) => a + Math.max(0, Number(p.stock) || 0) * (Number(p.precioActual) || 0), 0);
    const bajos = cat.rows.filter(p => (Number(p.stock) || 0) <= (s.lowStock || 3)).length;
    return `📦 *Tu tienda en números* (catálogo real de tiendamax.org):\n• ${cat.rows.length} productos publicados\n• ${totalU} unidades en stock\n• Valor de inventario: *${fmtUSD(valor)}*\n• ${bajos} productos con stock bajo\n\nPregunta por uno: *"stock de batería must"*, o gestiona: *"reponer 10 …"*, *"venta de 2 … a 30"*, *"elimina 3 …"*, *"deja el stock de … en 5"*.`;
  }
  if (cmd.intent === 'consulta') {
    const res = resolveProduct(text, cat.rows);
    if (res.status === 'nada') return 'No encontré ese producto en tu catálogo. Dímelo con el nombre tal como está en la tienda, por ejemplo: *"stock de batería must"*.';
    if (res.status === 'ambiguo' && wantAmbiguo(res.cands)) return suggestCandidates(res.cands);
    const p = res.status === 'ok' ? res.product : res.cands[0];
    const st = Math.max(0, Number(p.stock) || 0);
    return `📦 *${p.nombre}*\nStock: *${st} unidades*${st === 0 ? ' (agotado)' : st <= (s.lowStock || 3) ? ' ⚠️ stock bajo' : ''} · Precio: *${fmtUSD(Number(p.precioActual) || 0)}*${p.categoria ? ` · ${p.categoria}` : ''}`;
  }

  /* Operaciones (escritura) */
  const res = resolveProduct(text, cat.rows);
  if (res.status === 'nada') {
    const verb: Record<string, string> = { venta: 'registrar la venta', reposicion: 'reponer', eliminacion: 'eliminar stock de', ajuste: 'fijar el stock de' };
    return `No encontré ese producto para ${verb[cmd.intent] || 'esa operación'}. Dímelo con el nombre de la tienda, por ejemplo: *"${cmd.intent === 'venta' ? 'venta de 2 batería must a 300' : 'reponer 10 batería must'}"*.`;
  }
  if (res.status === 'ambiguo' && wantAmbiguo(res.cands)) return suggestCandidates(res.cands);
  const p = res.status === 'ok' ? res.product : res.cands[0];
  const r = await applyMove(s, {
    extId: String(p.id), kind: cmd.intent as 'reposicion' | 'eliminacion' | 'venta' | 'ajuste',
    qty: cmd.qty, unitPrice: cmd.price, note: source === 'voz' ? 'comando del dueño' : 'panel', source,
  });

  if (!r.ok) {
    if (r.reason === 'sin-token') {
      return '✍️ Puedo hacerlo, pero todavía no tengo el token de GitHub para subir el cambio a tu tienda. Ve al dashboard → *Ajustes → Conexión tienda*: pega ahí el mismo token que usa tu panel de TiendaMax (permiso Contents:write). Mientras tanto puedes activar el modo simulación y lo ensayamos sin tocar la tienda.';
    }
    if (r.reason === 'token-invalido') return '🔑 El token de GitHub no es válido o venció. Genera uno nuevo y pégalo en Ajustes → Conexión tienda.';
    if (r.reason === 'sin-permiso') return '🔒 GitHub rechazó la escritura: el token necesita permiso de escritura en "Contents" (como el de tu panel admin).';
    if (r.reason === 'conflicto') return '⏳ GitHub detectó un cambio simultáneo en productos.json. Espera unos segundos y dímelo de nuevo.';
    if (r.reason === 'sin-catalogo') return '📦 No tengo el catálogo cargado (sin conexión con la tienda). Intenta de nuevo en un momento.';
    return `No pude aplicar el cambio en la tienda (${r.detail || r.reason}). Prueba de nuevo en unos minutos.`;
  }

  const syncLine = r.sync === 'github'
    ? `✅ *Subido a GitHub* — tu tienda se actualiza en ~1 minuto${r.commitUrl ? `\n${r.commitUrl}` : ''}`
    : '🧪 *Simulación* — guardado en el panel, la tienda real NO se ha tocado (conecta GitHub en Ajustes para subir cambios de verdad)';

  const parts: string[] = [];
  const afterN = r.after ?? 0;
  const beforeN = r.before ?? 0;
  if (cmd.intent === 'venta') {
    const precioTxt = (r.unitPrice && r.unitPrice > 0) ? ` a ${fmtUSD(r.unitPrice)} c/u = *${fmtUSD(r.total || 0)}*` : '';
    if (r.detail === 'sin-stock') {
      parts.push(`⚠️ No pude registrar la venta: *${r.nombre}* está agotado en estos momentos. Di *"reponer N …"* primero y la registro enseguida.`);
      return parts.join('\n');
    }
    parts.push(`💰 *Venta registrada*: ${Math.abs(r.delta || 0)} u de ${r.nombre}${precioTxt}`);
    if (cmd.qty && Math.abs(r.delta || 0) < cmd.qty) {
      parts.push(`ℹ️ Pediste ${cmd.qty} u pero solo había ${beforeN} — se descontaron ${Math.abs(r.delta || 0)}.`);
    }
  } else if (cmd.intent === 'reposicion') {
    parts.push(`📥 *Reposición*: +${r.delta} u de ${r.nombre}`);
  } else if (cmd.intent === 'eliminacion') {
    parts.push(`📤 *Stock eliminado*: ${r.delta} u de ${r.nombre}`);
  } else {
    parts.push(`🎯 *Stock fijado* en ${afterN} u para ${r.nombre}`);
  }
  parts.push(`Stock: ${beforeN} → *${afterN} u*${afterN === 0 ? ' ⚠️ queda agotado' : r.low ? ' ⚠️ stock bajo' : ''}`);
  parts.push(syncLine);
  if (r.low && afterN > 0) parts.push(`¿Aprovechamos y repones? Di *"reponer 10 ${norm(r.nombre || '').split(' ').slice(0, 2).join(' ')}"*.`);
  return parts.join('\n');
}
