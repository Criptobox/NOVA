/* ============================================================
   NOVA v004 — adaptador WhatsApp Cloud API (OFICIAL de Meta)
   · 100% gratis para responder a usuarios (mensajes de servicio)
   · Cero riesgo de baneo: es el camino oficial
   · Botones y listas interactivas (gratis en la ventana 24 h)
   · Sin credenciales configuradas → MODO SIMULADOR
   ============================================================ */
import crypto from 'node:crypto';
import { waCreds, type NovaSettings } from './settings';

export type WaMode = 'live' | 'simulador';

export interface WaButton { id: string; title: string }
export interface WaRow { id: string; title: string; description?: string }

export function waMode(s: NovaSettings): WaMode {
  const { token, phoneId } = waCreds(s);
  return token && phoneId ? 'live' : 'simulador';
}

const GRAPH = 'https://graph.facebook.com/v21.0';

/* Envía texto por WhatsApp real. Devuelve {ok, error?} */
export async function sendWaText(to: string, text: string, s: NovaSettings): Promise<{ ok: boolean; error?: string }> {
  const { token, phoneId } = waCreds(s);
  if (!token || !phoneId) return { ok: false, error: 'sin credenciales' };
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text.slice(0, 4000) },
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[NOVA WA] send error', res.status, errText.slice(0, 300));
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[NOVA WA] send exception', err);
    return { ok: false, error: String(err) };
  }
}

/* Envía mensaje interactivo (botones ≤3 o lista ≤10 filas) por WhatsApp real.
   Gratis: es un mensaje de servicio dentro de la ventana de 24 h. */
export async function sendWaInteractive(
  to: string,
  body: string,
  opts: { buttons?: WaButton[]; list?: { title: string; rows: WaRow[] } },
  s: NovaSettings,
): Promise<{ ok: boolean; error?: string }> {
  const { token, phoneId } = waCreds(s);
  if (!token || !phoneId) return { ok: false, error: 'sin credenciales' };
  const interactive: Record<string, unknown> = { body: { text: body.slice(0, 1024) } };
  if (opts.list && opts.list.rows.length) {
    interactive.type = 'list';
    interactive.action = {
      button: (opts.list.title || 'Ver opciones').slice(0, 20),
      sections: [{
        title: 'Opciones',
        rows: opts.list.rows.slice(0, 10).map(r => ({ id: r.id.slice(0, 200), title: r.title.slice(0, 24), description: (r.description || '').slice(0, 72) })),
      }],
    };
  } else if (opts.buttons && opts.buttons.length) {
    interactive.type = 'button';
    interactive.action = {
      buttons: opts.buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id.slice(0, 256), title: b.title.slice(0, 20) } })),
    };
  } else {
    return sendWaText(to, body, s);
  }
  try {
    const res = await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[NOVA WA] interactive error', res.status, errText.slice(0, 300));
      return { ok: false, error: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error('[NOVA WA] interactive exception', err);
    return { ok: false, error: String(err) };
  }
}

/* Descarga media (audio/imagen) de WhatsApp y la devuelve en base64 */
export async function fetchWaMedia(mediaId: string, s: NovaSettings): Promise<{ base64: string; mime: string } | null> {
  const { token } = waCreds(s);
  if (!token) return null;
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!meta.ok) return null;
    const { url, mime_type } = await meta.json() as { url: string; mime_type: string };
    const bin = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
    if (!bin.ok) return null;
    const buf = Buffer.from(await bin.arrayBuffer());
    return { base64: buf.toString('base64'), mime: mime_type || 'application/octet-stream' };
  } catch (err) {
    console.error('[NOVA WA] media error', err);
    return null;
  }
}

/* Verificación del webhook (GET con hub.challenge) */
export function verifyWebhook(query: URLSearchParams, s: NovaSettings): string | null {
  const { verifyToken } = waCreds(s);
  const mode = query.get('hub.mode');
  const token = query.get('hub.verify_token');
  const challenge = query.get('hub.challenge');
  if (mode === 'subscribe' && token && timingSafeEq(token, verifyToken)) return challenge;
  return null;
}

function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* v018 — Verifica la firma HMAC-SHA256 (cabecera X-Hub-Signature-256) que Meta
   añade a CADA POST del webhook, firmada con el App Secret de la app de Meta.
   Sin esto, cualquiera puede mandar un POST fabricado a mano suplantando al
   dueño (mismo número que ownerWa) y disparar comandos reales de trading o
   tienda. Si no hay App Secret configurado, no se puede verificar — se avisa
   por consola pero se deja pasar por compatibilidad con instalaciones que
   aún no lo configuraron (ver Ajustes → Conexión WhatsApp). */
export function verifyWebhookSignature(rawBody: string, header: string | null, s: NovaSettings): { ok: boolean; reason?: string } {
  const { appSecret } = waCreds(s);
  if (!appSecret) return { ok: true, reason: 'sin App Secret configurado (firma no verificada)' };
  if (!header || !header.startsWith('sha256=')) return { ok: false, reason: 'falta la cabecera de firma' };
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const got = header.slice('sha256='.length);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(got, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'firma inválida' };
  return { ok: true };
}
