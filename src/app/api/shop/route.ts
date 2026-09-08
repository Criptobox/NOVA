import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/nova/settings';
import { fetchCatalog, ghCreds, syncMirror } from '@/lib/nova/shop';

export const dynamic = 'force-dynamic';

/* v007 — Catálogo real de la tienda (espejo local + estado de conexión) */
export async function GET(req: NextRequest) {
  const fresh = req.nextUrl.searchParams.get('refresh') === '1';
  const s = await getSettings();
  const gh = ghCreds(s);
  const cat = await fetchCatalog(s, { fresh });

  const rows = await db.shopProduct.findMany({ orderBy: { nombre: 'asc' } });
  const low = s.lowStock || 3;
  const stats = {
    count: rows.length,
    unidades: rows.reduce((a, r) => a + r.stock, 0),
    valor: +rows.reduce((a, r) => a + r.stock * r.precio, 0).toFixed(2),
    bajos: rows.filter(r => r.stock > 0 && r.stock <= low).length,
    agotados: rows.filter(r => r.stock === 0).length,
  };

  return NextResponse.json({
    ok: true,
    live: cat.live,
    source: cat.source,
    sim: s.shopSim,
    lowStock: low,
    gh: {
      user: gh.user, repo: gh.repo, branch: gh.branch, path: gh.path, site: gh.site,
      tokenSet: !!gh.token,
    },
    stats,
    rows: rows.map(r => ({
      extId: r.extId, nombre: r.nombre, slug: r.slug, categoria: r.categoria,
      subcat: r.subcat, precio: r.precio, stock: r.stock, imagen: r.imagen,
      updatedAt: r.updatedAt,
    })),
  });
}

/* Re-sincroniza el espejo manualmente (botón Actualizar) */
export async function POST() {
  const s = await getSettings();
  const cat = await fetchCatalog(s, { fresh: true });
  if (cat.source === 'github' || cat.source === 'raw' || cat.source === 'site') await syncMirror(cat.rows);
  return NextResponse.json({ ok: true, live: cat.live, source: cat.source, count: cat.rows.length });
}
