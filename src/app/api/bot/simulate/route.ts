import { NextRequest, NextResponse } from 'next/server';
import { processInbound } from '@/lib/nova/engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Simulador: envía un mensaje al motor como si fuera un usuario de WhatsApp */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const kind = ['text', 'audio', 'image'].includes(body?.kind) ? body.kind : 'text';
    if (kind === 'text' && !body?.text?.trim()) {
      return NextResponse.json({ ok: false, error: 'mensaje vacío' }, { status: 400 });
    }
    if (kind === 'audio' && !body?.audioBase64) {
      return NextResponse.json({ ok: false, error: 'falta audioBase64' }, { status: 400 });
    }
    if (kind === 'image' && !body?.imageUrl) {
      return NextResponse.json({ ok: false, error: 'falta imageUrl (data URL)' }, { status: 400 });
    }
    const result = await processInbound({
      waId: body?.waId || 'sim-user-1',
      name: body?.name || 'Usuario (simulador)',
      channel: 'simulador',
      kind,
      text: kind === 'text' ? String(body.text).slice(0, 2000) : undefined,
      audioBase64: kind === 'audio' ? String(body.audioBase64) : undefined,
      imageUrl: kind === 'image' ? String(body.imageUrl) : undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[NOVA simulate] error:', err);
    return NextResponse.json({ ok: false, error: 'error procesando el mensaje' }, { status: 500 });
  }
}
