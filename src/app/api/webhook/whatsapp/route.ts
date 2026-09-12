import { NextRequest, NextResponse, after } from 'next/server';
import { getSettings } from '@/lib/nova/settings';
import { verifyWebhook, waMode } from '@/lib/nova/whatsapp';
import { processWaWebhookValue } from '@/lib/nova/engine';
import { startScheduler } from '@/lib/nova/scheduler';
import { lazyTickRun } from '@/lib/nova/lazyTick';

export const dynamic = 'force-dynamic';

/* Verificación del webhook (Meta llama con hub.challenge) */
export async function GET(req: NextRequest) {
  startScheduler(); // idempotente
  const s = await getSettings();
  const challenge = verifyWebhook(req.nextUrl.searchParams, s);
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({
    ok: true,
    mode: waMode(s),
    message: 'Webhook NOVA listo. Usa POST para eventos de Meta o configura credenciales en Ajustes.',
  });
}

/* Eventos entrantes de WhatsApp Cloud API */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const s = await getSettings();
    if (waMode(s) !== 'live') {
      return NextResponse.json({ ok: false, error: 'NOVA está en modo simulador. Configura el token y el phone_id en Ajustes.' }, { status: 503 });
    }
    let processed = 0;
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        processed += await processWaWebhookValue(change?.value || {});
      }
    }
    /* v011 — tick perezoso: cada mensaje recibido empuja también las tareas
       vencidas (recordatorios, alertas, resumen, trading). En serverless no
       hay proceso permanente; así las tareas no dependen de un cron externo. */
    after(() => lazyTickRun());
    return NextResponse.json({ ok: true, processed });
  } catch (err) {
    console.error('[NOVA webhook] error:', err);
    return NextResponse.json({ ok: false, error: 'evento inválido' }, { status: 400 });
  }
}
