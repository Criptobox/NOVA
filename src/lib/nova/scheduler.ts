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

/* Resumen diario (una vez al día a la hora configurada) */
async function dailySummary(): Promise<void> {
  const s = await getSettings();
  if (!s.dailySummaryOn) return;
  const now = new Date();
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  if (g.__novaSummaryFired === key) return;
  if (now.getHours() !== s.dailySummaryHour) return;
  g.__novaSummaryFired = key;
  const { rows } = await getPrices();
  if (!rows.length) return; // sin conexión: no se envía un resumen con datos vacíos/inventados
  const holds = await db.holding.findMany();
  let total = 0;
  for (const h of holds) {
    const r = rows.find(x => x.id === h.coinId);
    if (r) total += h.amt * r.price;
  }
  const body = summaryText(rows, total);
  await broadcast(s, body, 'summary');
}

async function tick(): Promise<void> {
  try {
    await checkAlerts();
  } catch (e) { console.error('[NOVA cron] alertas:', e); }
  try {
    await runReminders();
  } catch (e) { console.error('[NOVA cron] recordatorios:', e); }
  try {
    await dailySummary();
  } catch (e) { console.error('[NOVA cron] resumen:', e); }
}

export function startScheduler(): void {
  if (g.__novaScheduler) return;
  g.__novaScheduler = setInterval(() => { void tick(); }, 60000);
  setTimeout(() => { void tick(); }, 8000); // primer chequeo a los 8 s
  console.log('[NOVA] planificador iniciado (cada 60 s: alertas + recordatorios + resumen)');
}

export function schedulerStatus(): { running: boolean; mode: string } {
  const g2 = globalThis as unknown as { __novaScheduler?: NodeJS.Timeout };
  return { running: !!g2.__novaScheduler, mode: '60s' };
}
