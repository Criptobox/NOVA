import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/nova/settings';
import { applyMove } from '@/lib/nova/shop';

export const dynamic = 'force-dynamic';

const KINDS = ['reposicion', 'eliminacion', 'venta', 'ajuste'];

/* v007 — Movimiento de stock desde el panel (voz ya cubre engine.ts) */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    const kind = String(b?.kind || '');
    const extId = String(b?.extId || '');
    const qty = Math.max(0, Math.round(Number(b?.qty) || 0));
    if (!extId || !KINDS.includes(kind)) {
      return NextResponse.json({ ok: false, error: 'Datos inválidos' }, { status: 400 });
    }
    const p = await db.shopProduct.findUnique({ where: { extId } });
    if (!p) return NextResponse.json({ ok: false, error: 'Producto no encontrado en el catálogo. Actualiza el catálogo e inténtalo de nuevo.' }, { status: 404 });
    if (kind !== 'ajuste' && qty < 1) {
      return NextResponse.json({ ok: false, error: 'La cantidad debe ser al menos 1' }, { status: 400 });
    }
    const s = await getSettings();
    const r = await applyMove(s, {
      extId, kind: kind as 'reposicion' | 'eliminacion' | 'venta' | 'ajuste',
      qty, unitPrice: b?.unitPrice != null ? Number(b.unitPrice) : null,
      note: String(b?.note || 'panel').slice(0, 140), source: 'panel',
    });
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch {
    return NextResponse.json({ ok: false, error: 'Petición inválida' }, { status: 400 });
  }
}
