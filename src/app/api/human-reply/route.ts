import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/nova/settings';
import { waMode, sendWaText } from '@/lib/nova/whatsapp';
import { systemNote } from '@/lib/nova/notify';

export const dynamic = 'force-dynamic';

/* v004 — El dueño responde como humano desde el dashboard.
   · Envía por WhatsApp real si está en modo live
   · Guarda el mensaje con rol "owner"
   · Pone el bot en pausa para ese contacto (modo humano)
*/
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const contactId = String(body?.contactId || '');
    const text = String(body?.text || '').trim().slice(0, 2000);
    if (!contactId || !text) {
      return NextResponse.json({ ok: false, error: 'faltan contactId o text' }, { status: 400 });
    }
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact) return NextResponse.json({ ok: false, error: 'contacto no encontrado' }, { status: 404 });

    const s = await getSettings();
    const mode = waMode(s);
    let delivered = true;
    let error: string | undefined;

    if (mode === 'live' && contact.channel === 'whatsapp') {
      const r = await sendWaText(contact.waId, text, s);
      delivered = r.ok;
      error = r.error;
    }

    const msg = await db.message.create({
      data: {
        contactId: contact.id,
        role: 'owner',
        kind: 'text',
        body: text,
        meta: JSON.stringify({ mode, via: 'panel-dueño', ...(error ? { error } : {}) }),
      },
    });

    // Pausa del bot: NOVA no responde automáticamente mientras el humano converse
    if (!contact.botPaused) {
      await db.contact.update({ where: { id: contact.id }, data: { botPaused: true } });
      await systemNote(contact.id, '👤 El dueño tomó la conversación: bot en pausa para este contacto. El usuario puede escribir "continuar" para volver con NOVA.');
    }

    return NextResponse.json({ ok: true, message: msg, delivered, error, mode });
  } catch (err) {
    console.error('[NOVA human-reply] error:', err);
    return NextResponse.json({ ok: false, error: 'error enviando la respuesta humana' }, { status: 500 });
  }
}
