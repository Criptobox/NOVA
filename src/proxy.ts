import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from '@/lib/nova/adminAuth';

/* NOVA v018 — Puerta de acceso del panel.
   Antes de esta versión, CUALQUIERA con la URL del despliegue podía abrir
   el dashboard, leer conversaciones reales, activar trading con dinero real
   o escribir en el inventario de la tienda: no existía ninguna autenticación.
   Ahora, si defines ADMIN_PASSWORD en las variables de entorno, todo el panel
   y su API quedan detrás de una contraseña (cookie de sesión firmada, 30 días).
   Si NO defines ADMIN_PASSWORD, NOVA sigue funcionando exactamente igual que
   antes (sin bloquear a nadie) pero el panel muestra un aviso permanente
   invitando a configurarla — igual que el aviso de base de datos. */

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/webhook/whatsapp', // Meta llama aquí; se verifica con firma HMAC propia
  '/api/cron/tick', // Vercel Cron / cron externo; se verifica con CRON_SECRET propio
];

function esPublica(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (esPublica(pathname)) return NextResponse.next();

  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) return NextResponse.next(); // sin contraseña configurada: no se bloquea (ver aviso en el panel)

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (await verifySessionToken(token, adminPassword)) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|logo.svg|robots.txt|index.html).*)'],
};
