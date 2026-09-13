import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { COOKIE_NAME, createSessionToken } from '@/lib/nova/adminAuth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminPassword) {
    return NextResponse.json({ ok: false, error: 'ADMIN_PASSWORD no está configurada en el servidor.' }, { status: 503 });
  }
  let password = '';
  try {
    const b = await req.json();
    password = typeof b?.password === 'string' ? b.password : '';
  } catch { /* body inválido → contraseña vacía, falla abajo */ }

  const a = Buffer.from(password);
  const b = Buffer.from(adminPassword);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    // pequeño retraso fijo: dificulta medir tiempos y automatizar fuerza bruta
    await new Promise(r => setTimeout(r, 300));
    return NextResponse.json({ ok: false, error: 'Contraseña incorrecta' }, { status: 401 });
  }

  const token = await createSessionToken(adminPassword);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
