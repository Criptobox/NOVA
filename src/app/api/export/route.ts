import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getPrices } from '@/lib/nova/prices';
import { csvResponse, stamp, toCsv } from '@/lib/nova/csv';

export const dynamic = 'force-dynamic';

/* v006 — Exportación de datos reales a CSV (compatible con Excel).
   ?what=conversaciones | portafolio | metricas | intenciones | alertas | recordatorios */

const fmt = (d: Date) => d.toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'medium' });

export async function GET(req: NextRequest) {
  const what = req.nextUrl.searchParams.get('what') || 'conversaciones';

  if (what === 'conversaciones') {
    const [contacts, msgs] = await Promise.all([
      db.contact.findMany({ orderBy: { lastSeen: 'desc' } }),
      db.message.findMany({ orderBy: { createdAt: 'asc' }, take: 5000, include: { contact: true } }),
    ]);
    const byId = new Map(contacts.map(c => [c.id, c]));
    const csv = toCsv(
      ['fecha', 'contacto', 'canal', 'rol', 'tipo', 'intencion', 'latencia_ms', 'mensaje'],
      msgs.map(m => [
        fmt(m.createdAt),
        m.contact?.name || byId.get(m.contactId)?.name || m.contactId,
        m.contact?.channel || '',
        m.role === 'owner' ? 'dueño' : m.role === 'agent' ? 'NOVA' : m.role === 'system' ? 'sistema' : 'usuario',
        m.kind,
        m.intent || '',
        m.latencyMs ?? '',
        m.body.replace(/\r?\n/g, ' ⏎ '),
      ]),
    );
    return csvResponse(`nova-conversaciones-${stamp()}.csv`, csv);
  }

  if (what === 'portafolio') {
    const [holdings, prices] = await Promise.all([
      db.holding.findMany({ orderBy: { sym: 'asc' } }),
      getPrices(),
    ]);
    const rows = holdings.map(h => {
      const p = prices.rows.find(r => r.id === h.coinId) || null;
      const price = p?.price ?? 0;
      return [h.coinId, h.sym, h.name, h.amt, price, +(h.amt * price).toFixed(2), p?.chg ?? ''];
    });
    const total = rows.reduce((a, r) => a + (r[5] as number), 0);
    rows.push(['TOTAL', '', '', '', '', +total.toFixed(2), '']);
    const csv = toCsv(
      ['id_moneda', 'simbolo', 'nombre', 'cantidad', 'precio_usd', 'valor_usd', 'cambio_24h_pct'],
      rows,
    );
    return csvResponse(`nova-portafolio-${stamp()}.csv`, csv);
  }

  if (what === 'metricas') {
    const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const msgs = await db.message.findMany({
      where: { createdAt: { gte: since14 }, role: { in: ['user', 'agent'] } },
      select: { createdAt: true, role: true },
    });
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) days.push(new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().slice(0, 10));
    const rows = days.map(day => {
      const k = day;
      const user = msgs.filter(m => new Date(m.createdAt).toISOString().slice(0, 10) === k && m.role === 'user').length;
      const agent = msgs.filter(m => new Date(m.createdAt).toISOString().slice(0, 10) === k && m.role === 'agent').length;
      return [day, user, agent, user + agent];
    });
    const csv = toCsv(['fecha', 'mensajes_usuario', 'mensajes_nova', 'total'], rows);
    return csvResponse(`nova-actividad-14d-${stamp()}.csv`, csv);
  }

  if (what === 'intenciones') {
    const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const g = await db.message.groupBy({
      by: ['intent'],
      where: { createdAt: { gte: since7 }, intent: { not: null } },
      _count: { intent: true },
      orderBy: { _count: { intent: 'desc' } },
    });
    const csv = toCsv(
      ['intencion', 'veces'],
      g.map(i => [i.intent || 'otro', i._count.intent]),
    );
    return csvResponse(`nova-intenciones-7d-${stamp()}.csv`, csv);
  }

  if (what === 'alertas') {
    const alerts = await db.priceAlert.findMany({ orderBy: { createdAt: 'desc' } });
    const csv = toCsv(
      ['creada', 'moneda', 'simbolo', 'direccion', 'precio_objetivo_usd', 'activa', 'disparada'],
      alerts.map(a => [
        fmt(a.createdAt), a.coinId, a.sym,
        a.dir === 'above' ? 'cuando suba a' : 'cuando baje a',
        a.price, a.on ? 'sí' : 'no', a.fired ? fmt(a.firedAt || a.createdAt) : '',
      ]),
    );
    return csvResponse(`nova-alertas-${stamp()}.csv`, csv);
  }

  if (what === 'recordatorios') {
    const jobs = await db.scheduledJob.findMany({ orderBy: { when: 'asc' } });
    const csv = toCsv(
      ['tipo', 'etiqueta', 'mensaje', 'destino', 'cuando', 'repite', 'activo'],
      jobs.map(j => [
        j.kind === 'summary' ? 'resumen diario' : 'recordatorio',
        j.label, j.body.replace(/\r?\n/g, ' '), j.target, fmt(j.when),
        j.repeat === 'daily' ? 'diario' : 'una vez', j.on ? 'sí' : 'no',
      ]),
    );
    return csvResponse(`nova-recordatorios-${stamp()}.csv`, csv);
  }

  if (what === 'tienda_productos') {
    const rows = await db.shopProduct.findMany({ orderBy: { nombre: 'asc' } });
    const csv = toCsv(
      ['id_tienda', 'producto', 'slug', 'categoria', 'subcategoria', 'precio_usd', 'stock', 'valor_stock_usd'],
      rows.map(r => [r.extId, r.nombre, r.slug, r.categoria, r.subcat, r.precio, r.stock, +(r.stock * r.precio).toFixed(2)]),
    );
    return csvResponse(`nova-tienda-productos-${stamp()}.csv`, csv);
  }

  if (what === 'tienda_movimientos') {
    const moves = await db.stockMove.findMany({ orderBy: { createdAt: 'asc' } });
    const csv = toCsv(
      ['fecha', 'producto', 'tipo', 'unidades', 'stock_antes', 'stock_despues', 'total_usd', 'origen', 'sincronizado', 'nota'],
      moves.map(m => [
        fmt(m.createdAt), m.nombre, m.kind, m.delta, m.before, m.after,
        m.total ?? '', m.source === 'voz' ? 'voz' : 'panel',
        m.sync === 'github' ? 'subido a GitHub' : 'simulación', m.note,
      ]),
    );
    return csvResponse(`nova-tienda-movimientos-${stamp()}.csv`, csv);
  }

  if (what === 'tienda_ventas') {
    const ventas = await db.stockMove.findMany({ where: { kind: 'venta' }, orderBy: { createdAt: 'asc' } });
    const rows = ventas.map(v => [fmt(v.createdAt), v.nombre, Math.abs(v.delta), v.unitPrice ?? 0, v.total ?? 0, v.source === 'voz' ? 'voz' : 'panel', v.note]);
    const total = rows.reduce((a, r) => a + (r[4] as number), 0);
    rows.push(['TOTAL', '', '', '', +total.toFixed(2), '', '']);
    const csv = toCsv(['fecha', 'producto', 'unidades', 'precio_unitario_usd', 'total_usd', 'origen', 'nota'], rows);
    return csvResponse(`nova-tienda-ventas-${stamp()}.csv`, csv);
  }

  return new Response('export desconocido', { status: 400 });
}
