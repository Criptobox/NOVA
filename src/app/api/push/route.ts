import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { ensureVapid } from '@/lib/nova/push';

export const dynamic = 'force-dynamic';

/* v006 — Web Push: GET clave pública VAPID · POST guardar suscripción */
export async function GET() {
  const { publicKey } = await ensureVapid();
  const total = await db.pushSub.count();
  return NextResponse.json({ ok: true, key: publicKey, subs: total });
}

export async function POST(req: NextRequest) {
  try {
    const d = await req.json();
    const sub = d?.subscription;
    const endpoint: string | undefined = sub?.endpoint;
    const p256dh: string | undefined = sub?.keys?.p256dh;
    const auth: string | undefined = sub?.keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: 'suscripción incompleta' }, { status: 400 });
    }
    await db.pushSub.upsert({
      where: { endpoint },
      update: { p256dh, auth },
      create: { endpoint, p256dh, auth, ua: req.headers.get('user-agent')?.slice(0, 180) || '' },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'cuerpo inválido' }, { status: 400 });
  }
}
