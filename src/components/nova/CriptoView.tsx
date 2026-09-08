'use client';

/* NOVA v005 — Vista Criptos: portafolio, movers, alertas (solo datos reales) */
import { useCallback, useEffect, useState } from 'react';
import { CoinAvatar, Spark, money, money2, fmtAmt, fmtAge, CsvButton } from './ui';

interface Holding {
  id: string; coinId: string; sym: string; name: string; amt: number;
  price: number | null; chg: number | null; spark: number[]; value: number | null;
}
interface Alert {
  id: string; coinId: string; sym: string; dir: string; price: number; on: boolean;
  fired: boolean; firedAt: string | null; currentPrice: number | null; chg: number | null; createdAt: string;
}
interface CatalogCoin { id: string; sym: string; name: string }

const CATALOG: CatalogCoin[] = [
  { id: 'bitcoin', sym: 'BTC', name: 'Bitcoin' }, { id: 'ethereum', sym: 'ETH', name: 'Ethereum' },
  { id: 'tether', sym: 'USDT', name: 'Tether' }, { id: 'usd-coin', sym: 'USDC', name: 'USD Coin' },
  { id: 'binancecoin', sym: 'BNB', name: 'BNB' }, { id: 'solana', sym: 'SOL', name: 'Solana' },
  { id: 'ripple', sym: 'XRP', name: 'XRP' }, { id: 'cardano', sym: 'ADA', name: 'Cardano' },
  { id: 'dogecoin', sym: 'DOGE', name: 'Dogecoin' }, { id: 'polkadot', sym: 'DOT', name: 'Polkadot' },
  { id: 'tron', sym: 'TRX', name: 'TRON' }, { id: 'chainlink', sym: 'LINK', name: 'Chainlink' },
  { id: 'litecoin', sym: 'LTC', name: 'Litecoin' }, { id: 'shiba-inu', sym: 'SHIB', name: 'Shiba Inu' },
  { id: 'bitcoin-cash', sym: 'BCH', name: 'Bitcoin Cash' }, { id: 'uniswap', sym: 'UNI', name: 'Uniswap' },
  { id: 'stellar', sym: 'XLM', name: 'Stellar' }, { id: 'avalanche-2', sym: 'AVAX', name: 'Avalanche' },
  { id: 'monero', sym: 'XMR', name: 'Monero' }, { id: 'cosmos', sym: 'ATOM', name: 'Cosmos' },
  { id: 'near', sym: 'NEAR', name: 'NEAR Protocol' }, { id: 'aptos', sym: 'APT', name: 'Aptos' },
  { id: 'arbitrum', sym: 'ARB', name: 'Arbitrum' }, { id: 'optimism', sym: 'OP', name: 'Optimism' },
  { id: 'internet-computer', sym: 'ICP', name: 'Internet Computer' }, { id: 'hedera-hashgraph', sym: 'HBAR', name: 'Hedera' },
  { id: 'filecoin', sym: 'FIL', name: 'Filecoin' }, { id: 'dai', sym: 'DAI', name: 'Dai' },
  { id: 'pepe', sym: 'PEPE', name: 'Pepe' }, { id: 'the-open-network', sym: 'TON', name: 'Toncoin' },
];

export function CriptoView() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [total, setTotal] = useState(0);
  const [chgUSD, setChgUSD] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [rows, setRows] = useState<{ id: string; sym: string; name: string; price: number; chg: number; spark: number[] }[]>([]);
  const [ts, setTs] = useState(0);
  const [live, setLive] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editVal, setEditVal] = useState('');
  const [addId, setAddId] = useState('');
  const [aCoin, setACoin] = useState('bitcoin');
  const [aDir, setADir] = useState('above');
  const [aPrice, setAPrice] = useState('');

  const load = useCallback(async () => {
    try {
      const [rh, ra, rp] = await Promise.all([
        fetch('/api/holdings', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/alerts', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crypto/prices', { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (rh.ok) { setHoldings(rh.holdings || []); setTotal(rh.total || 0); setChgUSD(rh.chgUSD || 0); }
      if (ra.ok) setAlerts(ra.alerts || []);
      if (rp.ok) { setRows(rp.rows || []); setTs(rp.ts || 0); setLive(!!rp.live); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addCoin = async () => {
    if (!addId) return;
    await fetch('/api/holdings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId: addId, amt: 0 }) });
    setAddId('');
    void load();
  };
  const saveAmt = async (coinId: string) => {
    const v = parseFloat(editVal);
    await fetch('/api/holdings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId, amt: isNaN(v) ? 0 : v }) });
    setEditing(null);
    void load();
  };
  const delCoin = async (coinId: string) => {
    await fetch(`/api/holdings?coinId=${coinId}`, { method: 'DELETE' });
    void load();
  };
  const addAlert = async () => {
    const p = parseFloat(aPrice);
    if (!(p > 0)) return;
    await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coinId: aCoin, dir: aDir, price: p, sym: aCoin.toUpperCase().slice(0, 4) }) });
    setAPrice('');
    void load();
  };
  const rearm = async (id: string) => {
    await fetch('/api/alerts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    void load();
  };
  const delAlert = async (id: string) => {
    await fetch(`/api/alerts?id=${id}`, { method: 'DELETE' });
    void load();
  };

  const sorted = [...rows].sort((a, b) => b.chg - a.chg);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
  const pct = total - chgUSD ? (chgUSD / (total - chgUSD)) * 100 : 0;
  const remaining = CATALOG.filter(c => !holdings.some(h => h.coinId === c.id));

  const moverRow = (r: typeof rows[number]) => (
    <div className="row" key={r.id}>
      <CoinAvatar id={r.id} sym={r.sym} />
      <div className="grow"><b>{r.name}</b><small>{money2(r.price)}</small></div>
      <span className={`tag ${r.chg >= 0 ? '' : 'red'}`}>{r.chg >= 0 ? '↑' : '↓'} {Math.abs(r.chg).toFixed(2)}%</span>
    </div>
  );

  const statusTag = () => {
    if (!rows.length) return <span className="tag red">○ SIN DATOS · SIN CONEXIÓN</span>;
    if (live) return <span className="tag">● EN VIVO</span>;
    return <span className="tag yellow">◌ CACHÉ REAL · {fmtAge(ts).toUpperCase()}</span>;
  };

  return (
    <section className="view active" id="view-criptos">
      <div className="viewhead">
        <h2>Cripto seguimiento</h2>
        <p>Precios reales en vivo vía CoinGecko (servidor). Aquí nunca se muestran datos inventados: si no hay conexión verás “SIN DATOS” hasta que vuelva la señal. El agente vigila tus alertas 24/7 y avisa por WhatsApp.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.35fr 1fr 1fr' }}>
        <article className="card">
          <div className="cardhead"><h3>Mi portafolio</h3>{statusTag()}<CsvButton what="portafolio" title="Exportar portafolio a CSV" /></div>
          <div className="panelbody">
            <div style={{ fontSize: 27, fontWeight: 800 }}>{rows.length ? money(total) : '—'}</div>
            <div className="muted">24 h: <b className={chgUSD >= 0 ? 'up' : 'down'}>{chgUSD >= 0 ? '+' : '−'}{money(Math.abs(chgUSD))}</b> ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%) · {holdings.length} monedas</div>
            {!rows.length && <div className="tag red" style={{ display: 'inline-block', marginTop: 8 }}>Sin conexión con el mercado — no se muestran valores inventados</div>}
            <div style={{ marginTop: 10 }}>
              {holdings.filter(h => (h.value || 0) > 0).sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 6).map(h => {
                const p = total ? Math.round((h.value || 0) / total * 100) : 0;
                return (
                  <div key={h.id}>
                    <div className="metric"><span>{h.sym} · {money(h.value || 0)}</span><b>{p}%</b></div>
                    <div className="bar"><i style={{ width: `${p}%` }} /></div>
                  </div>
                );
              })}
              {holdings.length === 0 && <div className="empty">Añade monedas abajo para ver tu portafolio.</div>}
            </div>
          </div>
        </article>
        <article className="card">
          <div className="cardhead"><h3>Mejores 24 h</h3><span className="up">SUBEN</span></div>
          <div className="list">{best.length ? best.map(moverRow) : <div className="empty"><span className="big">◇</span>Sin datos todavía.</div>}</div>
        </article>
        <article className="card">
          <div className="cardhead"><h3>Peores 24 h</h3><span className="down">BAJAN</span></div>
          <div className="list">{worst.length ? worst.map(moverRow) : <div className="empty"><span className="big">◇</span>Sin datos todavía.</div>}</div>
        </article>
      </div>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="cardhead"><h3>Mis criptos ({holdings.length})</h3><span className="muted">TOCA ✎ PARA EDITAR LA CANTIDAD</span></div>
        <div className="tblwrap"><table className="tbl">
          <thead><tr><th>Moneda</th><th>Precio</th><th>24 h</th><th>7 días</th><th>Tienes</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            {holdings.length ? holdings.map(h => {
              const up = (h.chg || 0) >= 0;
              return (
                <tr key={h.id}>
                  <td><div style={{ display: 'flex', gap: 9, alignItems: 'center' }}><CoinAvatar id={h.coinId} sym={h.sym} /><div><b>{h.name}</b><br /><span className="muted">{h.sym}</span></div></div></td>
                  <td>{h.price != null ? money2(h.price) : <span className="muted">—</span>}</td>
                  <td className={h.price != null ? (up ? 'up' : 'down') : 'muted'}>{h.chg != null ? `${up ? '↑' : '↓'} ${Math.abs(h.chg).toFixed(2)}%` : '—'}</td>
                  <td><Spark points={h.spark} up={up} /></td>
                  <td>
                    {editing === h.coinId ? (
                      <input
                        className="amtinput"
                        type="number" step="any" min="0" autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onBlur={() => void saveAmt(h.coinId)}
                        onKeyDown={e => { if (e.key === 'Enter') void saveAmt(h.coinId); }}
                        style={{ width: 110, background: 'rgba(6,17,32,.92)', border: '1px solid rgba(53,215,255,.5)', borderRadius: 8, padding: '6px 8px', color: '#eef7ff' }}
                      />
                    ) : <span onClick={() => { setEditing(h.coinId); setEditVal(String(h.amt)); }} style={{ cursor: 'pointer' }}>{fmtAmt(h.amt)}</span>}
                  </td>
                  <td><b>{h.value != null ? money(h.value) : '—'}</b></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="button" onClick={() => { setEditing(h.coinId); setEditVal(String(h.amt)); }}>✎</button>{' '}
                    <button className="button danger" onClick={() => void delCoin(h.coinId)}>×</button>
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={7}><div className="empty">Tu lista está vacía. Añade monedas abajo.</div></td></tr>}
          </tbody>
        </table></div>
      </article>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <article className="card">
          <div className="cardhead"><h3>Añadir moneda</h3><span className="muted">{remaining.length} DISPONIBLES</span></div>
          <div className="panelbody">
            <div className="field">
              <label>Moneda</label>
              <select value={addId} onChange={e => setAddId(e.target.value)}>
                <option value="">Elige una moneda…</option>
                {remaining.map(c => <option key={c.id} value={c.id}>{c.name} · {c.sym}</option>)}
              </select>
            </div>
            <button className="button green" style={{ width: '100%' }} onClick={() => void addCoin()}>＋ Añadir a mi lista</button>
          </div>
        </article>
        <article className="card">
          <div className="cardhead"><h3>Alertas de precio</h3><span className="muted">{alerts.filter(a => a.on && !a.fired).length} ACTIVAS</span></div>
          <div className="panelbody">
            <div className="formrow">
              <select value={aCoin} onChange={e => setACoin(e.target.value)} style={{ flex: 1.2, background: 'rgba(6,17,32,.85)', border: '1px solid var(--line)', borderRadius: 11, padding: 9, color: '#eef7ff', fontSize: 11 }}>
                {CATALOG.map(c => <option key={c.id} value={c.id}>{c.sym}</option>)}
              </select>
              <select value={aDir} onChange={e => setADir(e.target.value)} style={{ flex: 1, background: 'rgba(6,17,32,.85)', border: '1px solid var(--line)', borderRadius: 11, padding: 9, color: '#eef7ff', fontSize: 11 }}>
                <option value="above">≥ sube por</option>
                <option value="below">≤ baja por</option>
              </select>
              <input value={aPrice} onChange={e => setAPrice(e.target.value)} type="number" step="any" min="0" placeholder="USD" style={{ flex: 1, background: 'rgba(6,17,32,.85)', border: '1px solid var(--line)', borderRadius: 11, padding: 9, color: '#eef7ff', fontSize: 11 }} />
              <button className="button green" style={{ padding: '9px 12px' }} onClick={() => void addAlert()}>＋</button>
            </div>
            <div style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
              {alerts.length ? alerts.map(a => (
                <div className="alertrow" key={a.id}>
                  <CoinAvatar id={a.coinId} sym={a.sym} />
                  <div className="grow">
                    <b>{a.sym}</b> {a.dir === 'above' ? 'sube por encima de' : 'baja por debajo de'} <b>{money2(a.price)}</b>
                    <br /><small className="muted">{a.fired ? `Activada ${a.firedAt ? fmtAge(a.firedAt) : ''} — reármala para volver a vigilar` : 'El agente vigila el mercado 24/7'}</small>
                  </div>
                  {a.fired ? <button className="button green" onClick={() => void rearm(a.id)}>↺</button> : <span className="muted">{a.currentPrice != null ? money2(a.currentPrice) : '—'}</span>}
                  <button className="button danger" onClick={() => void delAlert(a.id)}>×</button>
                </div>
              )) : <div className="empty">Sin alertas. Ej.: "BTC ≥ 120000" — el agente avisa por WhatsApp al cruzarlo.</div>}
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
