import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettings, waCreds } from '@/lib/nova/settings';
import { waMode } from '@/lib/nova/whatsapp';
import { schedulerStatus } from '@/lib/nova/scheduler';
import { mask } from '@/lib/nova/seal';

export const dynamic = 'force-dynamic';

/* v018 — Los secretos NUNCA salen en claro por la API: waToken, ghToken y
   waAppSecret se enmascaran (últimas 4 letras) y vapidPriv no se envía en
   absoluto (es de uso exclusivo del servidor para firmar Web Push). */
function redacted(s: Awaited<ReturnType<typeof getSettings>>) {
  const { vapidPriv: _vapidPriv, waToken, ghToken, waAppSecret, ...rest } = s;
  return {
    ...rest,
    waToken: mask(waToken),
    ghToken: mask(ghToken),
    waAppSecret: mask(waAppSecret),
  };
}

export async function GET() {
  const s = await getSettings();
  const { token, phoneId, verifyToken, appSecret } = waCreds(s);
  return NextResponse.json({
    ok: true,
    settings: redacted(s),
    status: {
      mode: waMode(s),
      tokenSet: !!token,
      phoneIdSet: !!phoneId,
      verifyToken,
      sigVerified: !!appSecret,
      scheduler: schedulerStatus(),
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    const b = await req.json();
    await getSettings();
    const data: Record<string, unknown> = {};
    if (b?.persona && ['profesional', 'casual', 'creativa', 'tecnica'].includes(b.persona)) data.persona = b.persona;
    if (typeof b?.mode247 === 'boolean') data.mode247 = b.mode247;
    if (Number.isInteger(b?.startHour) && b.startHour >= 0 && b.startHour <= 23) data.startHour = b.startHour;
    if (Number.isInteger(b?.endHour) && b.endHour >= 0 && b.endHour <= 23) data.endHour = b.endHour;
    if (Number.isInteger(b?.maxMsgsPerMin) && b.maxMsgsPerMin >= 3 && b.maxMsgsPerMin <= 100) data.maxMsgsPerMin = b.maxMsgsPerMin;
    if (typeof b?.ownerWa === 'string') data.ownerWa = b.ownerWa.replace(/[^+\d]/g, '').slice(0, 20);
    if (typeof b?.aiEnabled === 'boolean') data.aiEnabled = b.aiEnabled;
    if (typeof b?.dailySummaryOn === 'boolean') data.dailySummaryOn = b.dailySummaryOn;
    if (Number.isInteger(b?.dailySummaryHour) && b.dailySummaryHour >= 0 && b.dailySummaryHour <= 23) data.dailySummaryHour = b.dailySummaryHour;
    // Secretos: si el valor viene vacío o es la máscara que la propia API
    // devuelve (p. ej. "••••••••1234"), se conserva el que ya había en la
    // base de datos — así "Guardar" no borra ni sobrescribe un token real
    // con su propia máscara solo porque el formulario lo reenvía tal cual.
    const secret = (v: unknown, max: number) =>
      typeof v === 'string' && v.trim() && !v.trim().startsWith('••') ? v.trim().slice(0, max) : undefined;
    const waToken = secret(b?.waToken, 400); if (waToken !== undefined) data.waToken = waToken;
    const ghToken = secret(b?.ghToken, 200); if (ghToken !== undefined) data.ghToken = ghToken;
    const waAppSecret = secret(b?.waAppSecret, 200); if (waAppSecret !== undefined) data.waAppSecret = waAppSecret;
    if (typeof b?.waPhoneId === 'string') data.waPhoneId = b.waPhoneId.replace(/\D/g, '').slice(0, 30);
    if (typeof b?.waVerifyToken === 'string') data.waVerifyToken = b.waVerifyToken.trim().slice(0, 80) || 'nova-verify';
    if (typeof b?.ghUser === 'string') data.ghUser = b.ghUser.trim().slice(0, 60);
    if (typeof b?.ghRepo === 'string') data.ghRepo = b.ghRepo.trim().slice(0, 80) || 'Tiendamax';
    if (typeof b?.ghBranch === 'string') data.ghBranch = b.ghBranch.trim().slice(0, 40) || 'main';
    if (typeof b?.ghPath === 'string') data.ghPath = b.ghPath.trim().replace(/^\/+/, '').slice(0, 120) || 'productos.json';
    if (typeof b?.ghSite === 'string') data.ghSite = b.ghSite.trim().slice(0, 200) || 'https://tiendamax.org';
    if (typeof b?.shopSim === 'boolean') data.shopSim = b.shopSim;
    if (Number.isInteger(b?.lowStock) && b.lowStock >= 1 && b.lowStock <= 50) data.lowStock = b.lowStock;
    const s = await db.setting.update({ where: { id: 'nova' }, data });
    return NextResponse.json({ ok: true, settings: redacted(s) });
  } catch {
    return NextResponse.json({ ok: false, error: 'datos inválidos' }, { status: 400 });
  }
}
