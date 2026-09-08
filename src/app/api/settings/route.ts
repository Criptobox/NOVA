import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettings, waCreds } from '@/lib/nova/settings';
import { waMode } from '@/lib/nova/whatsapp';
import { schedulerStatus } from '@/lib/nova/scheduler';

export const dynamic = 'force-dynamic';

export async function GET() {
  const s = await getSettings();
  const { token, phoneId, verifyToken } = waCreds(s);
  return NextResponse.json({
    ok: true,
    settings: s,
    status: {
      mode: waMode(s),
      tokenSet: !!token,
      phoneIdSet: !!phoneId,
      verifyToken,
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
    if (typeof b?.waToken === 'string') data.waToken = b.waToken.trim().slice(0, 400);
    if (typeof b?.waPhoneId === 'string') data.waPhoneId = b.waPhoneId.replace(/\D/g, '').slice(0, 30);
    if (typeof b?.waVerifyToken === 'string') data.waVerifyToken = b.waVerifyToken.trim().slice(0, 80) || 'nova-verify';
    if (typeof b?.ghUser === 'string') data.ghUser = b.ghUser.trim().slice(0, 60);
    if (typeof b?.ghRepo === 'string') data.ghRepo = b.ghRepo.trim().slice(0, 80) || 'Tiendamax';
    if (typeof b?.ghBranch === 'string') data.ghBranch = b.ghBranch.trim().slice(0, 40) || 'main';
    if (typeof b?.ghPath === 'string') data.ghPath = b.ghPath.trim().replace(/^\/+/, '').slice(0, 120) || 'productos.json';
    if (typeof b?.ghSite === 'string') data.ghSite = b.ghSite.trim().slice(0, 200) || 'https://tiendamax.org';
    if (typeof b?.ghToken === 'string') data.ghToken = b.ghToken.trim().slice(0, 200);
    if (typeof b?.shopSim === 'boolean') data.shopSim = b.shopSim;
    if (Number.isInteger(b?.lowStock) && b.lowStock >= 1 && b.lowStock <= 50) data.lowStock = b.lowStock;
    const s = await db.setting.update({ where: { id: 'nova' }, data });
    return NextResponse.json({ ok: true, settings: s });
  } catch {
    return NextResponse.json({ ok: false, error: 'datos inválidos' }, { status: 400 });
  }
}
