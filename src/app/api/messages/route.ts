import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/* Mensajes de una conversación (?contactId=...) */
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) return NextResponse.json({ ok: false, error: 'falta contactId' }, { status: 400 });
  const msgs = await db.message.findMany({
    where: { contactId },
    orderBy: { createdAt: 'asc' },
    take: 300,
  });
  return NextResponse.json({ ok: true, messages: msgs });
}
