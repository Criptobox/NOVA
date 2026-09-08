import { NextResponse } from 'next/server';
import { pushAll } from '@/lib/nova/push';

export const dynamic = 'force-dynamic';

/* v006 — Notificación de prueba para verificar los avisos push */
export async function POST() {
  const r = await pushAll({
    title: 'NOVA · aviso de prueba',
    body: 'Los avisos push funcionan: si un contacto pide un humano, te enterarás al instante.',
    url: '/#convos',
    tag: 'nova-test',
  });
  return NextResponse.json({ ok: true, ...r });
}
