/* ============================================================
   NOVA v004 — entrega de mensajes (dashboard, WhatsApp, dueño)
   Guarda todo en la BD y envía por Cloud API si está en vivo.
   v004: mensajes interactivos (botones/listas) + métricas
   (intent, latencyMs) + rol "owner" para respuestas humanas.
   ============================================================ */
import { db } from '@/lib/db';
import { sendWaText, sendWaInteractive, waMode, type WaButton, type WaRow } from './whatsapp';
import { getSettings, type NovaSettings } from './settings';

export async function ensureContact(waId: string, name?: string, channel: 'whatsapp' | 'simulador' = 'whatsapp') {
  return db.contact.upsert({
    where: { waId },
    update: { lastSeen: new Date(), name: name || undefined },
    create: { waId, name: name || waId, channel },
  });
}

export async function saveMessage(
  contactId: string,
  role: 'user' | 'agent' | 'owner' | 'system',
  kind: string,
  body: string,
  meta?: Record<string, unknown>,
  extra?: { intent?: string; latencyMs?: number },
) {
  return db.message.create({
    data: {
      contactId, role, kind, body,
      meta: meta ? JSON.stringify(meta) : null,
      intent: extra?.intent || null,
      latencyMs: extra?.latencyMs ?? null,
    },
  });
}

export interface DeliverOpts {
  kind?: string;
  meta?: Record<string, unknown>;
  intent?: string;
  latencyMs?: number;
  buttons?: WaButton[];      // ≤3 botones de respuesta rápida
  list?: { title: string; rows: WaRow[] }; // o 1 lista de hasta 10 filas
}

/* Entrega un mensaje del agente a un contacto concreto (texto o interactivo) */
export async function deliverTo(s: NovaSettings, waId: string, name: string, body: string, opts: DeliverOpts = {}) {
  const kind = opts.kind || 'text';
  const contact = await ensureContact(waId, name);
  const mode = waMode(s);
  let delivered = true;
  let error: string | undefined;

  if (mode === 'live') {
    if (opts.buttons || opts.list) {
      const r = await sendWaInteractive(waId, body, { buttons: opts.buttons, list: opts.list }, s);
      delivered = r.ok;
      error = r.error;
      // Fallback: si el interactivo falla, enviamos texto plano con el menú escrito
      if (!r.ok) await sendWaText(waId, body, s);
    } else {
      const r = await sendWaText(waId, body, s);
      delivered = r.ok;
      error = r.error;
    }
  }

  const meta = { ...opts.meta, mode, ...(error ? { error } : {}) };
  if (opts.buttons) meta.botones = opts.buttons;      // el simulador del dashboard los renderiza
  if (opts.list) meta.lista = { title: opts.list.title, rows: opts.list.rows };
  await saveMessage(contact.id, 'agent', kind, body, meta, { intent: opts.intent, latencyMs: opts.latencyMs });
  return { contact, delivered, error };
}

/* Notifica al dueño (escalado a humano, avisos internos) */
export async function notifyOwner(s: NovaSettings, body: string, kind = 'note') {
  if (!s.ownerWa) return { ok: false, reason: 'sin ownerWa configurado' };
  const r = await deliverTo(s, s.ownerWa, 'Dueño (tú)', body, { kind });
  return { ok: r.delivered, reason: r.error };
}

/* Mensaje del sistema visible en la conversación (no se envía a nadie) */
export async function systemNote(contactId: string, body: string) {
  return saveMessage(contactId, 'system', 'note', body);
}

/* Difusión: resumen diario / avisos a todos los contactos */
export async function broadcast(s: NovaSettings, body: string, kind = 'summary', only: 'all' | 'owner' = 'all') {
  const contacts = await db.contact.findMany({
    where: only === 'owner' ? { waId: s.ownerWa || '__none__' } : { channel: 'whatsapp', waId: { not: '' } },
    orderBy: { lastSeen: 'desc' },
    take: 200,
  });
  let sent = 0, failed = 0;
  for (const c of contacts) {
    const r = await deliverTo(s, c.waId, c.name, body, { kind });
    if (r.delivered) sent++; else failed++;
  }
  return { sent, failed };
}
