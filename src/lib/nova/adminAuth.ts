/* ============================================================
   NOVA v018 — Sesión de administrador (protección del panel)
   Sin esto, cualquiera con la URL del despliegue puede abrir el
   panel, leer conversaciones, activar trading real o escribir en
   la tienda: no había ninguna autenticación en toda la app.
   Cookie de sesión firmada con HMAC-SHA256 (Web Crypto, funciona
   tanto en el runtime Edge del middleware como en Node.js) usando
   la propia ADMIN_PASSWORD como clave: si la contraseña cambia,
   las sesiones antiguas quedan inválidas automáticamente sin
   necesitar un secreto aparte ni una lista de sesiones en la BD.
   ============================================================ */

export const COOKIE_NAME = 'nova_admin';
const TTL_MS = 30 * 24 * 3600 * 1000; // 30 días

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** Crea el valor de la cookie de sesión: "expiración.firma" */
export async function createSessionToken(secret: string): Promise<string> {
  const exp = Date.now() + TTL_MS;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(exp)));
  return `${exp}.${b64url(new Uint8Array(sig))}`;
}

/** Verifica firma y expiración de la cookie de sesión */
export async function verifySessionToken(token: string | undefined | null, secret: string): Promise<boolean> {
  if (!token) return false;
  const [expStr, sigB64] = token.split('.');
  if (!expStr || !sigB64) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  try {
    const key = await hmacKey(secret);
    const sig = fromB64url(sigB64);
    return await crypto.subtle.verify('HMAC', key, sig as BufferSource, enc.encode(expStr));
  } catch {
    return false;
  }
}
