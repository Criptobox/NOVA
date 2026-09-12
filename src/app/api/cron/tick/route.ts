import { NextResponse } from 'next/server';
import { runTick } from '@/lib/nova/scheduler';

/* NOVA v011 — /api/cron/tick
   Ejecuta un ciclo de tareas programadas bajo demanda: alertas de precio,
   recordatorios vencidos, resumen diario de cripto, trading y sniper.
   · Vercel Cron NATIVO llama a esta ruta una vez al día (vercel.json) y le
     añade automáticamente la cabecera x-vercel-cron.
   · Además la llaman los ticks perezosos del webhook y del panel, así que
     las tareas vencidas se ejecutan también con cada mensaje y recarga.
   · Protegido por CRON_SECRET: si está definida, Vercel Cron la envía solo
     como "Authorization: Bearer CRON_SECRET" (automático) y cualquier
     llamada externa debe usar ?token=SECRETO.
   · Idempotente: llamarlo varias veces no duplica envíos. */

function autorizado(url: URL, req: Request): boolean {
  const secreto = process.env.CRON_SECRET || '';
  const q = url.searchParams.get('token');
  const h = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (secreto) return q === secreto || h === secreto;
  // Sin secreto configurado: se acepta el cron NATIVO de Vercel (cabecera
  // x-vercel-cron, la pone la plataforma) y cualquier llamada en desarrollo
  if (req.headers.get('x-vercel-cron')) return true;
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!autorizado(url, req)) {
    return NextResponse.json(
      { ok: false, error: 'Token ausente o incorrecto. Añade ?token=CRON_SECRET a la URL o cabecera Authorization.' },
      { status: 403 }
    );
  }
  const started = Date.now();
  const r = await runTick();
  return NextResponse.json({
    ok: true,
    ...r,
    ms: Date.now() - started,
    at: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  return GET(req);
}
