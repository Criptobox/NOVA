import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { systemNote } from '@/lib/nova/notify';

export const dynamic = 'force-dynamic';

/* Lista de conversaciones con último mensaje */
export async function GET() {
  const contacts = await db.contact.findMany({
    orderBy: { lastSeen: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    take: 100,
  });
  return NextResponse.json({
    ok: true,
    contacts: contacts.map(c => ({
      id: c.id, waId: c.waId, name: c.name, channel: c.channel, lastSeen: c.lastSeen,
      botPaused: c.botPaused,
      lastMessage: c.messages[0] ? { body: c.messages[0].body, role: c.messages[0].role, kind: c.messages[0].kind, createdAt: c.messages[0].createdAt } : null,
    })),
  });
}

/* v004 — Pausar / reactivar el bot para un contacto (modo humano) */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const id = String(body?.id || '');
    const botPaused = Boolean(body?.botPaused);
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });
    const c = await db.contact.update({ where: { id }, data: { botPaused } });
    await systemNote(id, botPaused
      ? '👤 Bot en pausa: NOVA no responderá automáticamente a este contacto hasta que lo reactives o el usuario escriba "continuar".'
      : '🤖 Bot reactivado desde el panel: NOVA responde automáticamente de nuevo.');
    return NextResponse.json({ ok: true, contact: { id: c.id, botPaused: c.botPaused } });
  } catch (err) {
    console.error('[NOVA contacts PATCH] error:', err);
    return NextResponse.json({ ok: false, error: 'no se pudo actualizar el contacto' }, { status: 500 });
  }
}
