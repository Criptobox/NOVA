import { NextResponse, after } from 'next/server';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/nova/settings';
import { waMode } from '@/lib/nova/whatsapp';
import { getPrices } from '@/lib/nova/prices';
import { schedulerStatus, startScheduler } from '@/lib/nova/scheduler';
import { lazyTickRun } from '@/lib/nova/lazyTick';

export const dynamic = 'force-dynamic';

/* Resumen para el panel de inicio */
export async function GET() {
  startScheduler(); // idempotente: garantiza el planificador aunque el server arranque después
  /* v011 — tick perezoso: cada refresco del panel (este endpoint se llama cada
     60 s) empuja las tareas vencidas. En Vercel no hay proceso permanente y
     así los recordatorios/alertas salen sin depender de servicios externos. */
  after(() => lazyTickRun());
  const s = await getSettings();
  const [contacts, msgs, alertsActive, jobsOn, holds, shopAgg] = await Promise.all([
    db.contact.count(),
    db.message.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    db.priceAlert.count({ where: { on: true, fired: false } }),
    db.scheduledJob.count({ where: { on: true } }),
    db.holding.findMany(),
    db.shopProduct.aggregate({ _count: { id: true }, _sum: { stock: true } }),
  ]);
  const shopBajos = await db.shopProduct.findMany({ where: { stock: { gt: 0, lte: s.lowStock || 3 } }, select: { id: true } });
  const shopAgotados = await db.shopProduct.count({ where: { stock: 0 } });
  const { rows, live } = await getPrices();
  let total = 0;
  for (const h of holds) {
    const r = rows.find(x => x.id === h.coinId);
    if (r) total += h.amt * r.price;
  }
  return NextResponse.json({
    ok: true,
    contacts,
    msgs24h: msgs,
    alertsActive,
    jobsOn,
    portfolioTotal: total,
    waMode: waMode(s),
    scheduler: schedulerStatus(),
    cryptoLive: live && rows.length > 0,
    shopCount: shopAgg._count.id,
    shopUnidades: shopAgg._sum.stock || 0,
    shopBajos: shopBajos.length,
    shopAgotados,
    withinHours: s.mode247 ? true : (s.startHour <= s.endHour ? new Date().getHours() >= s.startHour && new Date().getHours() < s.endHour : new Date().getHours() >= s.startHour || new Date().getHours() < s.endHour),
  });
}
