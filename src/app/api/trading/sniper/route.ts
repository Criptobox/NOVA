import { NextResponse } from 'next/server';
import { scanNewListings, sniperStatus } from '@/lib/nova/sniper';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* v010 — Sniper de nuevos listados: estado + escaneo manual. */
export async function GET() {
  try {
    const st = await sniperStatus();
    return NextResponse.json({ ok: true, ...st });
  } catch (e) {
    console.error('[NOVA trading/sniper GET]', e);
    return NextResponse.json({ ok: false, error: 'no se pudo leer el sniper' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const r = await scanNewListings();
    return NextResponse.json({ ok: !r.error, ...r });
  } catch (e) {
    console.error('[NOVA trading/sniper POST]', e);
    return NextResponse.json({ ok: false, error: 'escaneo fallido' }, { status: 500 });
  }
}
