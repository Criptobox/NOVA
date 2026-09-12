/* ============================================================
   NOVA v003 — planificador interno
   · Vigila alertas de precio cada 60 s → avisa por WhatsApp
   · Ejecuta recordatorios programados
   · Resumen diario de cripto a la hora configurada
   Se inicia una sola vez por proceso (instrumentation.ts).
   ============================================================ */
import { db } from '@/lib/db';
import { getSettings } from './settings';
import { getPrices, money2, symOf } from './prices';
import { deliverTo, broadcast } from './notify';
import { waMode } from './whatsapp';

const g = globalThis as unknown as { __novaScheduler?: NodeJS.Timeout; __novaSummaryFired?: string };

export function summaryText(rows: { id: string; sym: string; price: number; chg: number }[], portfolioTotal: number): string {
  const sorted = [...rows].sort((a, b) => b.chg - a.chg);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
  const fmt = (r: { sym: string; price: number; chg: number }) => `${r.sym} ${money2(r.price)} (${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%)`;
  const btc = rows.find(r => r.id === 'bitcoin');
  return [
    `🌅 *NOVA · Resumen cripto del día*`,
    btc ? `₿ Bitcoin: ${money2(btc.price)} (${btc.chg >= 0 ? '+' : ''}${btc.chg.toFixed(2)}% 24 h)` : '',
    `📈 Suben: ${best.map(fmt).join(' · ')}`,
    `📉 Bajan: ${worst.map(fmt).join(' · ')}`,
    portfolioTotal > 0 ? `💼 Tu portafolio: ~$${Math.round(portfolioTotal).toLocaleString('en-US')}` : '',
  ].filter(Boolean).join('\n');
}

/* Comprueba alertas activas contra precios actuales */
async function checkAlerts(): Promise<void> {
  const alerts = await db.priceAlert.findMany({ where: { on: true, fired: false } });
  if (!alerts.length) return;
  const { rows } = await getPrices();
  const s = await getSettings();
  for (const a of alerts) {
    const r = rows.find(x => x.id === a.coinId);
    if (!r) continue;
    const hit = a.dir === 'above' ? r.price >= a.price : r.price <= a.price;
    if (!hit) continue;
    await db.priceAlert.update({ where: { id: a.id }, data: { fired: true, firedAt: new Date() } });
    const body = `🚨 *Alerta cripto*\n${symOf(a.coinId)} ${a.dir === 'above' ? 'superó' : 'cayó bajo'} ${money2(a.price)}\nAhora está en *${money2(r.price)}* (${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(2)}% 24 h).`;
    if (a.createdBy) {
      await deliverTo(s, a.createdBy, a.createdBy, body, 'alert');
    } else {
      await broadcast(s, body, 'alert');
    }
  }
}

/* Ejecuta recordatorios vencidos */
async function runReminders(): Promise<void> {
  const now = new Date();
  const jobs = await db.scheduledJob.findMany({
    where: { on: true, kind: 'reminder', when: { lte: now }, OR: [{ lastRun: null }, { repeat: 'daily', lastRun: { lt: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } }] },
    take: 20,
  });
  if (!jobs.length) return;
  const s = await getSettings();
  for (const j of jobs) {
    if (j.target === 'owner' || !j.target) {
      if (s.ownerWa) await deliverTo(s, s.ownerWa, 'Dueño (tú)', j.body, 'text');
    } else {
      await deliverTo(s, j.target, j.target, j.body, 'text');
    }
    await db.scheduledJob.update({
      where: { id: j.id },
      data: j.repeat === 'daily'
        ? { lastRun: new Date(), when: new Date(Date.now() + 24 * 3600 * 1000) }
        : { lastRun: new Date(), on: false },
    });
  }
}

/* Resumen diario (una vez al día a la hora configurada).
   v009 — deduplicación en BASE DE DATOS (sobrevive a instancias sin estado como Vercel):
   si ya existe un mensaje kind=summary hoy, no se repite aunque el cron llame dos veces. */
async function dailySummary(): Promise<{ sent: boolean }> {
  const s = await getSettings();
  if (!s.dailySummaryOn) return { sent: false };
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (g.__novaSummaryFired === key) return { sent: false };
  if (now.getHours() !== s.dailySummaryHour) return { sent: false };
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yaHoy = await db.message.findFirst({ where: { kind: 'summary', createdAt: { gte: startOfDay } }, select: { id: true } });
  if (yaHoy) { g.__novaSummaryFired = key; return { sent: false }; }
  g.__novaSummaryFired = key;
  const { rows } = await getPrices();
  if (!rows.length) return { sent: false }; // sin conexión: no se envía un resumen con datos vacíos/inventados
  const holds = await db.holding.findMany();
  let total = 0;
  for (const h of holds) {
    const r = rows.find(x => x.id === h.coinId);
    if (r) total += h.amt * r.price;
  }
  const body = summaryText(rows, total);
  await broadcast(s, body, 'summary');
  return { sent: true };
}

async function tick(): Promise<void> {
  try { await runTick(); } catch (e) { console.error('[NOVA cron] tick:', e); }
}

/* v009 — un ciclo completo ejecutable bajo demanda (lo usa /api/cron/tick en Vercel).
   Idempotente: alertas marcadas como fired, recordatorios con lastRun y resumen
   deduplicado en BD → llamarlo varias veces no duplica envíos. */
export async function runTick(): Promise<{ alertas: number; recordatorios: number; resumen: boolean; trading: number }> {
  let alertas = 0, recordatorios = 0, resumen = false, trading = 0;
  try { await checkAlerts(); } catch (e) { console.error('[NOVA cron] alertas:', e); }
  try {
    const antes = await db.scheduledJob.count({ where: { on: true, kind: 'reminder', when: { lte: new Date() } } });
    await runReminders();
    const despues = await db.scheduledJob.count({ where: { on: true, kind: 'reminder', when: { lte: new Date() } } });
    recordatorios = Math.max(0, antes - despues);
  } catch (e) { console.error('[NOVA cron] recordatorios:', e); }
  try { resumen = (await dailySummary()).sent; } catch (e) { console.error('[NOVA cron] resumen:', e); }
  // v010 — módulo de trading: evalúa señales y gestiona SL/TP (si está activo)
  try {
    const { runTradingTick } = await import('./trading');
    const tr = await runTradingTick();
    trading = tr.evaluados;
    if (tr.operaciones.length) console.log('[NOVA cron] trading:', tr.operaciones.join(' | '));
  } catch (e) { console.error('[NOVA cron] trading:', e); }
  // v010 — sniper de nuevos listados (una pasada por ciclo; crea baseline la 1ª vez)
  try {
    const { scanNewListings } = await import('./sniper');
    await scanNewListings();
  } catch (e) { console.error('[NOVA cron] sniper:', e); }
  return { alertas, recordatorios, resumen, trading };
}

export function startScheduler(): void {
  /* v011 — en Vercel (serverless) los setInterval no sobreviven: las tareas
     las disparan el CRON NATIVO de Vercel (/api/cron/tick, ver el crons de
     vercel.json) + los TICKS PEREZOSOS (cada mensaje de WhatsApp y cada
     refresco del panel). Sin cron-job.org ni ningún servicio externo. */
  if (process.env.VERCEL === '1') { console.log('[NOVA] Vercel detectado: tareas vía Vercel Cron + ticks perezosos'); return; }
  if (g.__novaScheduler) return;
  g.__novaScheduler = setInterval(() => { void tick(); }, 60000);
  setTimeout(() => { void tick(); }, 8000); // primer chequeo a los 8 s
  console.log('[NOVA] planificador iniciado (cada 60 s: alertas + recordatorios + resumen)');
}

export function schedulerStatus(): { running: boolean; mode: string } {
  const g2 = globalThis as unknown as { __novaScheduler?: NodeJS.Timeout };
  if (process.env.VERCEL === '1') return { running: true, mode: 'cron nativo de Vercel + ticks perezosos' };
  return { running: !!g2.__novaScheduler, mode: '60s' };
}
