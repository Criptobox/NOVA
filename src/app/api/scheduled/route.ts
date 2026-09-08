import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const jobs = await db.scheduledJob.findMany({ orderBy: { when: 'asc' }, take: 100 });
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const kind = b?.kind === 'summary' ? 'summary' : 'reminder';
    const label = String(b?.label || (kind === 'summary' ? 'Resumen cripto diario' : 'Recordatorio')).slice(0, 80);
    const body = String(b?.body || (kind === 'summary' ? '' : `⏰ *Recordatorio*: ${label}`)).slice(0, 500);
    const when = b?.when ? new Date(b.when) : new Date(Date.now() + 3600 * 1000);
    if (isNaN(when.getTime())) return NextResponse.json({ ok: false, error: 'fecha inválida' }, { status: 400 });
    const repeat = b?.repeat === 'daily' ? 'daily' : 'none';
    const target = String(b?.target || 'owner').slice(0, 40) || 'owner';
    const j = await db.scheduledJob.create({ data: { kind, label, body, when, repeat, target } });
    return NextResponse.json({ ok: true, job: j });
  } catch {
    return NextResponse.json({ ok: false, error: 'datos inválidos' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const b = await req.json();
    const id = String(b?.id || '');
    if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });
    const j = await db.scheduledJob.update({ where: { id }, data: { on: !!b?.on } });
    return NextResponse.json({ ok: true, job: j });
  } catch {
    return NextResponse.json({ ok: false, error: 'no se pudo actualizar' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, error: 'falta id' }, { status: 400 });
  await db.scheduledJob.delete({ where: { id } }).catch(() => null);
  return NextResponse.json({ ok: true });
}
