/* ============================================================
   NOVA v010 — Cifrado de secretos (AES-256-GCM)
   Cifra las API keys del exchange en la base de datos:
   nunca se guardan en claro y nunca salen al frontend.
   La clave se deriva de NOVA_CRYPT_KEY (o CRON_SECRET de reserva)
   con SHA-256 → 32 bytes. En dev usa una clave local conocida.
   ============================================================ */
import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const base =
    process.env.NOVA_CRYPT_KEY ||
    process.env.CRON_SECRET ||
    'nova-v010-local-dev-key';
  return crypto.createHash('sha256').update(base).digest();
}

/** Cifra texto → "iv.tag.datos" (todo en base64url) */
export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

/** Descifra "iv.tag.datos" → texto (o '' si no se puede) */
export function unseal(payload: string): string {
  try {
    const [ivB, tagB, dataB] = payload.split('.');
    if (!ivB || !tagB || !dataB) return '';
    const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Máscara para mostrar en el panel: las 4 últimas letras */
export function mask(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return '••••••••' + plain.slice(-4);
}
