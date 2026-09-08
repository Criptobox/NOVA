'use client';

/* NOVA v007 — Tienda TiendaMax: gestión de stock por voz y desde el panel.
   Lee el catálogo real (productos.json en GitHub Pages) y aplica cambios
   como el admin oficial: commit en GitHub con el token del dueño. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { CsvButton, money, fmtClock, downloadCsv } from './ui';

interface ShopRow {
  extId: string; nombre: string; slug: string; categoria: string; subcat: string;
  precio: number; stock: number; imagen: string; updatedAt: string;
}
interface ShopData {
  ok: boolean; live: boolean; source: string; sim: boolean; lowStock: number;
  gh: { user: string; repo: string; branch: string; path: string; site: string; tokenSet: boolean };
  stats: { count: number; unidades: number; valor: number; bajos: number; agotados: number };
  rows: ShopRow[];
}
interface MoveRow {
  id: string; nombre: string; kind: string; delta: number; before: number; after: number;
  qty: number; unitPrice: number | null; total: number | null; note: string;
  source: string; sync: string; createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  reposicion: 'Reposición', eliminacion: 'Merma', venta: 'Venta', ajuste: 'Stock fijado',
};

export function ShopView() {
  const [data, setData] = useState<ShopData | null>(null);
  const [moves, setMoves] = useState<MoveRow[]>([]);
  const [ventas, setVentas] = useState<{ count: number; total: number } | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err' | 'sim'; text: string } | null>(null);
  const [sell, setSell] = useState<{ p: ShopRow; qty: string; price: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (fresh = false) => {
    try {
      if (fresh) setRefreshing(true);
      const [rc, rm] = await Promise.all([
        fetch(`/api/shop${fresh ? '?refresh=1' : ''}`, { cache: 'no-store' }),
        fetch('/api/shop/moves', { cache: 'no-store' }),
      ]);
      const dc = await rc.json();
      const dm = await rm.json();
      if (dc.ok) setData(dc);
      if (dm.ok) { setMoves(dm.moves || []); setVentas(dm.ventas || null); }
    } catch { /* silencioso */ } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { void load(false); }, [load]);

  const doMove = async (extId: string, kind: string, qty: number, unitPrice?: number, note?: string) => {
    setBusy(extId + kind);
    setMsg(null);
    try {
      const r = await fetch('/api/shop/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extId, kind, qty, unitPrice, note }),
      });
      const d = await r.json();
      if (d.ok) {
        const linea = d.kind === 'venta'
          ? `Venta registrada: ${Math.abs(d.delta)} u de ${d.nombre}${d.total ? ` por ${money(d.total)}` : ''} · stock ${d.before} → ${d.after}`
          : `${d.nombre}: stock ${d.before} → ${d.after}`;
        setMsg({ t: d.sync === 'github' ? 'ok' : 'sim', text: d.sync === 'github' ? `${linea} · Subido a GitHub ✓` : `${linea} · Simulación (no se subió a la tienda)` });
      } else {
        setMsg({ t: 'err', text: d.error || d.detail || 'No se pudo aplicar el movimiento' });
      }
      await load(true);
    } catch {
      setMsg({ t: 'err', text: 'Sin conexión con el servidor' });
    } finally { setBusy(''); }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    const n = q.trim().toLowerCase();
    if (!n) return data.rows.slice(0, 40);
    return data.rows.filter(r => `${r.nombre} ${r.categoria} ${r.subcat}`.toLowerCase().includes(n)).slice(0, 60);
  }, [data, q]);

  const stockClass = (st: number) => (st === 0 ? 'out' : st <= (data?.lowStock || 3) ? 'low' : 'ok');
  const stockLabel = (st: number) => (st === 0 ? 'Agotado' : `${st} u`);

  if (!data) return <div className="empty">Cargando tu tienda…</div>;

  const syncPill = data.sim
    ? <span className="tag yellow">● SIMULACIÓN</span>
    : data.gh.tokenSet ? <span className="tag">● GITHUB CONECTADO</span> : <span className="tag yellow">● SOLO LECTURA</span>;

  return (
    <section className="view active" id="view-tienda">
      <div className="viewhead">
        <h2>Tienda · TiendaMax</h2>
        <p>Gestiona el inventario real de <b>tiendamax.org</b> hablando o con un clic: reponer, eliminar stock y registrar ventas. Los cambios se guardan igual que en tu panel admin (commit en GitHub) y tu tienda se actualiza en ~1 minuto.</p>
      </div>

      <div className="grid">
        {/* Resumen */}
        <article className="card">
          <div className="cardhead">
            <h3>Inventario en vivo</h3>
            <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {syncPill}
              <button className="csvbtn" onClick={() => void load(true)} title="Releer el catálogo de la tienda" disabled={refreshing}>
                <Icon name="refresh" size={12} /> {refreshing ? '…' : 'Actualizar'}
              </button>
            </span>
          </div>
          <div className="stats">
            <div className="stat"><label>Productos</label><strong>{data.stats.count}</strong></div>
            <div className="stat"><label>Unidades</label><strong>{data.stats.unidades}</strong></div>
            <div className="stat"><label>Valor inventario</label><strong>{money(data.stats.valor)}</strong></div>
            <div className="stat"><label>Stock bajo</label><strong>{data.stats.bajos}</strong></div>
            <div className="stat"><label>Agotados</label><strong>{data.stats.agotados}</strong></div>
            <div className="stat"><label>Ventas registradas</label><strong>{ventas?.count ?? 0}<small style={{ fontSize: 11, fontWeight: 500 }}>{ventas?.count ? ` · ${money(ventas.total)}` : ''}</small></strong></div>
          </div>
          {data.sim && (
            <div className="simpline">
              🧪 <b>Modo simulación:</b> los cambios se ensayan en el panel y la tienda real NO se toca. Cuando pegues tu token de GitHub en <b>Ajustes → Conexión tienda</b> y apagues la simulación, cada comando se subirá de verdad al repo de TiendaMax.
            </div>
          )}
          {!data.sim && data.source === 'cache' && (
            <div className="simpline warn">
              ○ Sin conexión con GitHub/tiendamax.org ahora mismo: muestro la última copia guardada. Los cambios se reintentarán cuando vuelva la red.
            </div>
          )}
        </article>

        {/* Exportación */}
        <article className="card">
          <div className="cardhead"><h3>Datos de la tienda</h3><span className="muted">CSV PARA EXCEL</span></div>
          <div className="panelbody">
            <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
              Exporta el inventario, la bitácora de movimientos y el libro de ventas con datos reales de tu tienda.
            </p>
            <div className="expgrid">
              <button className="expbtn" onClick={() => void downloadCsv('tienda_productos')}><Icon name="box" size={14} />Productos</button>
              <button className="expbtn" onClick={() => void downloadCsv('tienda_movimientos')}><Icon name="chart" size={14} />Movimientos</button>
              <button className="expbtn" onClick={() => void downloadCsv('tienda_ventas')}><Icon name="cart" size={14} />Ventas</button>
            </div>
          </div>
        </article>

        {/* Productos */}
        <article className="card wide">
          <div className="cardhead">
            <h3>Productos</h3>
            <CsvButton what="tienda_productos" title="Exportar inventario" />
          </div>
          <div className="panelbody">
            <div className="field" style={{ marginBottom: 10 }}>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar producto o categoría (ej. batería, luces, teléfono…)" />
            </div>
            {msg && (
              <div className={`opmsg ${msg.t === 'ok' ? 'good' : msg.t === 'sim' ? 'simmsg' : 'bad'}`}>{msg.text}</div>
            )}
            <div className="shoplist">
              {filtered.map(r => (
                <div className="shoprow" key={r.extId}>
                  {r.imagen
                    ? <img className="shopthumb" src={r.imagen} alt="" loading="lazy" />
                    : <div className="shopthumb ph"><Icon name="box" size={16} /></div>}
                  <div className="shopinfo">
                    <b title={r.nombre}>{r.nombre}</b>
                    <small>{[r.categoria, r.subcat].filter(Boolean).join(' · ')} · {money(r.precio)}</small>
                  </div>
                  <span className={`stockbadge ${stockClass(r.stock)}`}>{stockLabel(r.stock)}</span>
                  <div className="shopactions">
                    <button className="qtybtn" title="Reponer 1" disabled={busy === r.extId + 'reposicion'} onClick={() => void doMove(r.extId, 'reposicion', 1)}><Icon name="plus" size={12} /></button>
                    <button className="qtybtn" title="Reponer 5" disabled={busy === r.extId + 'reposicion'} onClick={() => void doMove(r.extId, 'reposicion', 5)}>5</button>
                    <button className="qtybtn" title="Reponer 10" disabled={busy === r.extId + 'reposicion'} onClick={() => void doMove(r.extId, 'reposicion', 10)}>10</button>
                    <button className="qtybtn down" title="Eliminar 1 (merma)" disabled={busy === r.extId + 'eliminacion' || r.stock === 0} onClick={() => void doMove(r.extId, 'eliminacion', 1)}><Icon name="minus" size={12} /></button>
                    <button className="qtybtn sell" disabled={busy === r.extId + 'venta' || r.stock === 0} onClick={() => setSell({ p: r, qty: '1', price: String(r.precio || '') })}>
                      <Icon name="cart" size={12} /> Vender
                    </button>
                  </div>
                </div>
              ))}
              {!filtered.length && <div className="empty">Sin resultados para “{q}”.</div>}
            </div>
          </div>
        </article>

        {/* Formulario de venta */}
        {sell && (
          <article className="card wide">
            <div className="cardhead"><h3>Registrar venta · {sell.p.nombre}</h3><span className="muted">STOCK ACTUAL {sell.p.stock} U</span></div>
            <div className="panelbody">
              <div className="sellform">
                <div className="field"><label>Unidades vendidas</label>
                  <input type="number" min={1} max={sell.p.stock} value={sell.qty} onChange={e => setSell({ ...sell, qty: e.target.value })} /></div>
                <div className="field"><label>Precio unitario (USD)</label>
                  <input type="number" min={0} step="0.01" value={sell.price} onChange={e => setSell({ ...sell, price: e.target.value })} /></div>
                <div className="field"><label>Total</label>
                  <div className="selltoteal">{money((parseFloat(sell.qty) || 0) * (parseFloat(sell.price) || 0))}</div></div>
                <button className="button green" disabled={busy === sell.p.extId + 'venta'}
                  onClick={() => void doMove(sell.p.extId, 'venta', Math.max(1, parseInt(sell.qty, 10) || 1), parseFloat(sell.price) || undefined, 'venta desde el panel').then(() => setSell(null))}>
                  <Icon name="check" size={14} /> Confirmar venta
                </button>
                <button className="button" onClick={() => setSell(null)}>Cancelar</button>
              </div>
            </div>
          </article>
        )}

        {/* Bitácora */}
        <article className="card wide">
          <div className="cardhead"><h3>Movimientos recientes</h3><CsvButton what="tienda_movimientos" title="Exportar bitácora" /></div>
          <div className="panelbody">
            {moves.length ? (
              <div className="movelist">
                {moves.map(m => (
                  <div className="moverow" key={m.id}>
                    <span className={`movebadge ${m.kind}`}>{KIND_LABEL[m.kind] || m.kind}</span>
                    <div className="moveinfo">
                      <b>{m.nombre}</b>
                      <small>
                        {m.before} → {m.after} u
                        {m.kind === 'venta' && m.total ? ` · ${money(m.total)}` : ''}
                        {m.note ? ` · ${m.note}` : ''}
                      </small>
                    </div>
                    <span className={`syncbadge ${m.sync}`}>{m.sync === 'github' ? '⬆ GitHub' : '◍ simulación'}</span>
                    <span className="movetime">{fmtClock(m.createdAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty">Todavía no hay movimientos. Prueba “reponer 5 …” o registra una venta.</div>
            )}
          </div>
        </article>

        {/* Comandos de voz */}
        <article className="card">
          <div className="cardhead"><h3>Pedírselo a NOVA por voz</h3><span className="muted">AGENTE → TIENDA</span></div>
          <div className="panelbody">
            <div className="voiceex">
              <div>📦 «¿cuánto stock hay de <b>batería must</b>?»</div>
              <div>⚠️ «<b>stock bajo</b>» / «agotados»</div>
              <div>📥 «<b>reponer 10</b> batería must»</div>
              <div>📤 «<b>elimina 3</b> ventilador»</div>
              <div>💰 «<b>venta de 2</b> baterías <b>a 300</b>»</div>
              <div>🎯 «<b>deja el stock de</b> luces <b>en 5</b>»</div>
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 10, lineHeight: 1.6 }}>
              Funciona en la pestaña Agente (dictado continuo) y por WhatsApp. Las escrituras quedan reservadas al número del dueño.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
