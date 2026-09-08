import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* v004 — Métricas del agente: mensajes por día, intenciones top,
   tiempo medio de respuesta, contactos activos y escalados. */

interface DayRow { day: string; user: number; agent: number }

export async function GET() {
  const since14 = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const since7 = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const [msgs14, intents7, latencyAgg, activeToday, active7, escalados7, totalContacts, byChannel, pausedCount] = await Promise.all([
    db.message.findMany({
      where: { createdAt: { gte: since14 }, role: { in: ['user', 'agent'] } },
      select: { createdAt: true, role: true },
    }),
    db.message.groupBy({
      by: ['intent'],
      where: { createdAt: { gte: since7 }, intent: { not: null } },
      _count: { intent: true },
      orderBy: { _count: { intent: 'desc' } },
      take: 10,
    }),
    db.message.aggregate({
      where: { createdAt: { gte: since7 }, role: 'agent', latencyMs: { not: null } },
      _avg: { latencyMs: true },
      _count: { latencyMs: true },
    }),
    db.contact.count({ where: { lastSeen: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    db.contact.count({ where: { lastSeen: { gte: since7 } } }),
    db.message.count({ where: { createdAt: { gte: since7 }, intent: 'humano' } }),
    db.contact.count(),
    db.contact.groupBy({ by: ['channel'], _count: { channel: true } }),
    db.contact.count({ where: { botPaused: true } }),
  ]);

  // Serie de 14 días (YYYY-MM-DD)
  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  const serie: DayRow[] = days.map(day => ({ day, user: 0, agent: 0 }));
  const idx = new Map(serie.map((r, i) => [r.day, i]));
  for (const m of msgs14) {
    const k = new Date(m.createdAt).toISOString().slice(0, 10);
    const i = idx.get(k);
    if (i === undefined) continue;
    if (m.role === 'user') serie[i].user++; else serie[i].agent++;
  }

  const labels: Record<string, string> = {
    precio: '🪙 Precio cripto', top: '🏆 Top del día', portafolio: '💼 Portafolio', resumen: '🌅 Resumen',
    alertas_listar: '⏰ Ver alertas', alertas_borrar: '🗑 Borrar alerta', alerta_crear: '⏰ Crear alerta',
    recordatorio: '⏱ Recordatorios', humano: '👤 Escalado a humano', gracias: '🙏 Gracias',
    divisas: '💱 Divisas', ayuda: '🤖 Ayuda / menú', saludo: '👋 Saludos', conversacion_ia: '💬 Conversación IA',
    audio_asr: '🎤 Notas de voz', imagen_vlm: '🖼 Imágenes', menu_boton: '🔘 Menú con botones',
    reactivar_bot: '🤖 Bot reactivado', fuera_horario: '🌙 Fuera de horario',
  };

  return NextResponse.json({
    ok: true,
    serie,
    intents: intents7.map(i => ({ intent: i.intent || 'otro', label: labels[i.intent || ''] || i.intent, count: i._count.intent })),
    avgLatencyMs: Math.round(latencyAgg._avg.latencyMs || 0),
    latencySamples: latencyAgg._count.latencyMs,
    activeToday,
    active7,
    escalados7,
    totalContacts,
    byChannel: byChannel.map(c => ({ channel: c.channel, count: c._count.channel })),
    paused: pausedCount,
  });
}
