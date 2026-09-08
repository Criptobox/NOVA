import { NextResponse } from 'next/server';
import { getSettings } from '@/lib/nova/settings';
import { testGithub } from '@/lib/nova/shop';

export const dynamic = 'force-dynamic';

/* v007 — Prueba de la conexión GitHub (igual que el test del panel admin de TiendaMax) */
export async function POST() {
  const s = await getSettings();
  const r = await testGithub(s);
  return NextResponse.json(r);
}
