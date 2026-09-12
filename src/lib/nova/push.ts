/* ============================================================
   NOVA v006 — Web Push real (VAPID) sin servicios externos.
   · Claves VAPID generadas una vez y guardadas en Setting
   · pushOwner(): avisa a todos los navegadores suscritos
   · Limpia suscripciones muertas (410/404)
   ============================================================ */
import webpush from 'web-push';
import { db } from '@/lib/db';

let configured = false;

export async function ensureVapid(): Promise<{ publicKey: string }> {
  const s = await db.setting.findUnique({ where: { id: 'nova' } });
  if (s?.vapidPub && s?.vapidPriv) {
    webpush.setVapidDetails('mailto:nova@agente.local', s.vapidPub, s.vapidPriv);
    configured = true;
    return { publicKey: s.vapidPub };
  }
  const keys = webpush.generateVAPIDKeys();
  await db.setting.upsert({
    where: { id: 'nova' },
    update: { vapidPub: keys.publicKey, vapidPriv: keys.privateKey },
    create: { vapidPub: keys.publicKey, vapidPriv: keys.privateKey },
  });
  webpush.setVapidDetails('mailto:nova@agente.local', keys.publicKey, keys.privateKey);
  configured = true;
  return { publicKey: keys.publicKey };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/* Envía una notificación a todas las suscripciones (ignora errores) */
export async function pushAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  try {
    if (!configured) await ensureVapid();
    const subs = await db.pushSub.findMany();
    let sent = 0;
    let pruned = 0;
    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 3600 },
        );
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.pushSub.delete({ where: { id: sub.id } }).catch(() => { /* noop */ });
          pruned++;
        }
      }
    }));
    return { sent, pruned };
  } catch {
    return { sent: 0, pruned: 0 };
  }
}
