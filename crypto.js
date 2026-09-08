/* ============================================================
   NOVA PWA v002 — crypto.js
   Seguimiento de criptomonedas:
   · Precios en vivo vía CoinGecko (endpoint público, sin API key)
   · Portafolio local (cantidades guardadas solo en tu dispositivo)
   · Sparklines de 7 días, mejores/peores del día
   · Alertas de precio con toast + notificación
   · Comandos de voz: "precio de bitcoin", "¿cómo van mis criptos?"
   Sin conexión: muestra la última caché o datos de demostración.
   ============================================================ */
'use strict';

const CG = 'https://api.coingecko.com/api/v3';
NOVA.keys.CRYPTO   = 'nova:cryptoHoldings';
NOVA.keys.CG_CACHE = 'nova:cryptoCache';
NOVA.keys.ALERTS   = 'nova:cryptoAlerts';

/* Catálogo curado [id CoinGecko, símbolo, nombre] */
const CATALOG = [
  ['bitcoin','BTC','Bitcoin'],['ethereum','ETH','Ethereum'],['tether','USDT','Tether'],
  ['usd-coin','USDC','USD Coin'],['binancecoin','BNB','BNB'],['solana','SOL','Solana'],
  ['ripple','XRP','XRP'],['cardano','ADA','Cardano'],['dogecoin','DOGE','Dogecoin'],
  ['polkadot','DOT','Polkadot'],['tron','TRX','TRON'],['chainlink','LINK','Chainlink'],
  ['litecoin','LTC','Litecoin'],['shiba-inu','SHIB','Shiba Inu'],['bitcoin-cash','BCH','Bitcoin Cash'],
  ['uniswap','UNI','Uniswap'],['stellar','XLM','Stellar'],['avalanche-2','AVAX','Avalanche'],
  ['monero','XMR','Monero'],['cosmos','ATOM','Cosmos'],['near','NEAR','NEAR Protocol'],
  ['aptos','APT','Aptos'],['arbitrum','ARB','Arbitrum'],['optimism','OP','Optimism'],
  ['internet-computer','ICP','Internet Computer'],['hedera-hashgraph','HBAR','Hedera'],
  ['filecoin','FIL','Filecoin'],['dai','DAI','Dai'],['pepe','PEPE','Pepe'],['the-open-network','TON','Toncoin']
];
const DEFAULT_HOLDINGS = [
  { id: 'bitcoin',  amt: 0.05 },
  { id: 'ethereum', amt: 0.8 },
  { id: 'solana',   amt: 12 },
  { id: 'cardano',  amt: 1500 }
];

let cryptoLive = false;       // ¿el último fetch fue exitoso?
let cryptoBusy = false;
let cryptoLastTry = 0;

/* ---------- Utilidades ---------- */
const coinOf = id => CATALOG.find(c => c[0] === id) || null;
const symOf  = id => { const c = coinOf(id); return c ? c[1] : id.slice(0, 3).toUpperCase(); };
const nameOf = id => { const c = coinOf(id); return c ? c[2] : id; };

function money2(n) {
  const v = Number(n) || 0;
  const dec = v !== 0 && Math.abs(v) < 0.01 ? 6 : Math.abs(v) < 1 ? 4 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtAmt(n) {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  return String(+v.toFixed(6));
}
function fmtAge(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return `hace ${h} h`;
}

function getHoldings() {
  let h = NOVA.get(NOVA.keys.CRYPTO, null);
  if (!h) { h = DEFAULT_HOLDINGS; NOVA.set(NOVA.keys.CRYPTO, h); }
  return h;
}
function setHoldings(h) { NOVA.set(NOVA.keys.CRYPTO, h); NOVA.emit('data'); }
function getCached() { return NOVA.get(NOVA.keys.CG_CACHE, { ts: 0, rows: [], demo: false }); }

/* ---------- Avatares por moneda ---------- */
const PALETTE = ['#f7931a', '#627eea', '#9945ff', '#2a5ada', '#c2a633', '#e6007a', '#26a17b', '#8247e5', '#edc716', '#0ea5e9', '#f43f5e', '#22c55e', '#a855f7', '#f97316', '#14b8a6', '#eab308'];
function coinColor(id) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
function coinAvatar(id) {
  const sym = symOf(id);
  const glyph = sym === 'BTC' ? '₿' : sym === 'ETH' ? 'Ξ' : sym.slice(0, 3);
  return `<div class="coinav" style="background:${coinColor(id)}">${glyph}</div>`;
}

/* ---------- Sparkline SVG ---------- */
function sparkSVG(points, up) {
  if (!points || points.length < 2) return '<span class="muted">—</span>';
  const w = 92, h = 26;
  const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
  const step = w / (points.length - 1);
  const pts = points.map((p, i) => `${(i * step).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  const color = up ? '#48e0a1' : '#ff6b86';
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" style="stroke:${color}"/></svg>`;
}

/* ---------- Datos demo (sin conexión, primera visita) ---------- */
function seedDemo() {
  const known = { bitcoin: 118250, ethereum: 4310, solana: 212, cardano: 0.93, polkadot: 6.4, chainlink: 23.8, dogecoin: 0.31, litecoin: 128 };
  const rows = getHoldings().map((h, idx) => {
    let hsh = 0; for (const c of h.id) hsh = (hsh * 33 + c.charCodeAt(0)) >>> 0;
    let p = known[h.id];
    if (!p) p = +(((hsh % 40000) / 100) + 0.4).toFixed(2);
    let v = p * (1 - 0.03); const spark = [];
    for (let i = 0; i < 42; i++) {
      v = Math.max(v * (1 + (Math.sin(i * 1.7 + idx * 3) * 0.012) + (((hsh + i * 37) % 13) - 6) / 900), p * 0.82);
      spark.push(v);
    }
    spark[spark.length - 1] = p;
    const chg = +(((hsh % 17) - 7) * 0.14).toFixed(2);
    return { id: h.id, sym: symOf(h.id), name: nameOf(h.id), price: p, chg, spark, cap: p * 1e9 };
  });
  NOVA.set(NOVA.keys.CG_CACHE, { ts: Date.now() - 7 * 60000, rows, demo: true });
}

/* ---------- Fetch de precios (CoinGecko) ---------- */
async function fetchPrices(silent) {
  if (cryptoBusy) return;
  if (Date.now() - cryptoLastTry < 20000) return;
  cryptoBusy = true; cryptoLastTry = Date.now();
  const ids = [...new Set(getHoldings().map(h => h.id))].join(',');
  const url = `${CG}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = await res.json();
    if (!Array.isArray(raw) || !raw.length) throw new Error('respuesta vacía');
    const rows = raw.map(r => ({
      id: r.id,
      sym: (r.symbol || '').toUpperCase(),
      name: r.name,
      price: r.current_price,
      chg: r.price_change_percentage_24h || 0,
      spark: (r.sparkline_in_7d && r.sparkline_in_7d.price) ? r.sparkline_in_7d.price.filter((_, i) => i % 4 === 0) : [],
      cap: r.market_cap
    }));
    NOVA.set(NOVA.keys.CG_CACHE, { ts: Date.now(), rows, demo: false });
    cryptoLive = true;
    checkAlerts(rows);
    if (!silent) toast('↻ Precios cripto actualizados', 'ok', 1800);
  } catch (err) {
    cryptoLive = false;
    if (!getCached().rows.length) seedDemo();
    if (!silent) toast('◌ Sin conexión con CoinGecko. Mostrando últimos datos guardados.', 'warn', 3600);
  } finally {
    cryptoBusy = false;
    // Re-renderiza solo si el usuario está viendo Criptos (evita cortar ediciones)
    if (typeof currentView !== 'undefined' && currentView === 'criptos') renderCrypto();
    cryptoHome();
  }
}

/* ---------- Alertas de precio ---------- */
function checkAlerts(rows) {
  const alerts = NOVA.get(NOVA.keys.ALERTS, []);
  let changed = false;
  alerts.forEach(a => {
    if (!a.on || a.fired) return;
    const r = rows.find(x => x.id === a.id); if (!r) return;
    const hit = a.dir === 'above' ? r.price >= a.price : r.price <= a.price;
    if (hit) {
      a.fired = true; changed = true;
      toast(`🚨 ${symOf(a.id)} ${a.dir === 'above' ? 'superó' : 'cayó bajo'} ${money2(a.price)} · ahora ${money2(r.price)}`, 'warn', 9000);
      try {
        if (window.Notification && Notification.permission === 'granted')
          new Notification('NOVA · Alerta cripto', { body: `${nameOf(a.id)} está en ${money2(r.price)}`, icon: 'icons/icon-192.png' });
      } catch {}
    }
  });
  if (changed) NOVA.set(NOVA.keys.ALERTS, alerts);
}

/* ---------- Render de la vista Criptos ---------- */
function statusTag() {
  const c = getCached();
  if (cryptoLive) return '<span class="tag">● EN VIVO</span>';
  if (!c.rows.length) return '<span class="tag red">○ SIN DATOS</span>';
  return c.demo ? '<span class="tag blue">● DEMO · OFFLINE</span>' : `<span class="tag yellow">◌ CACHÉ · ${fmtAge(c.ts).toUpperCase()}</span>`;
}

RENDERERS.criptos = function () { renderCrypto(); };

function renderCrypto() {
  const host = document.getElementById('view-criptos');
  if (!host) return;
  const { ts, rows } = getCached();
  const hold = getHoldings();
  const alerts = NOVA.get(NOVA.keys.ALERTS, []);

  const rowOf = id => rows.find(x => x.id === id);
  const priceOf = id => { const r = rowOf(id); return r ? r.price : 0; };
  const val = h => h.amt * priceOf(h.id);
  const total = hold.reduce((s, h) => s + val(h), 0);
  const chgUSD = rows.reduce((s, r) => { const h = hold.find(x => x.id === r.id); return s + (h ? val(h) * r.chg / 100 : 0); }, 0);
  const chgPct = total && total - chgUSD ? (chgUSD / (total - chgUSD)) * 100 : 0;
  const chgTxt = (chgUSD >= 0 ? '+' : '−') + '$' + Math.abs(chgUSD).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sorted = [...rows].sort((a, b) => b.chg - a.chg);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();

  const alloc = [...hold].map(h => ({ h, v: val(h) })).filter(x => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 6);

  const moverRow = r => `
    <div class="row">${coinAvatar(r.id)}
      <div class="grow"><b>${esc(r.name)}</b><small>${money2(r.price)}</small></div>
      <span class="tag ${r.chg >= 0 ? '' : 'red'}">${r.chg >= 0 ? '↑' : '↓'} ${Math.abs(r.chg).toFixed(2)}%</span>
    </div>`;

  const noDataRow = h => `
    <div class="row">${coinAvatar(h.id)}
      <div class="grow"><b>${esc(nameOf(h.id))}</b><small>Esperando próximos datos…</small></div>
      <span class="tag yellow">SIN DATOS</span>
    </div>`;

  const coinRow = h => {
    const r = rowOf(h.id);
    const price = r ? r.price : 0, chg = r ? r.chg : 0, up = chg >= 0;
    const hasData = !!r;
    return `<tr>
      <td><div style="display:flex;gap:9px;align-items:center">${coinAvatar(h.id)}
        <div><b>${esc(nameOf(h.id))}</b><br><span class="muted">${symOf(h.id)}</span></div></div></td>
      <td>${hasData ? money2(price) : '<span class="muted">—</span>'}</td>
      <td class="${hasData ? (up ? 'up' : 'down') : 'muted'}">${hasData ? (up ? '↑' : '↓') + ' ' + Math.abs(chg).toFixed(2) + '%' : '—'}</td>
      <td>${sparkSVG(r && r.spark, up)}</td>
      <td><span class="amtshow" data-amt="${h.id}">${fmtAmt(h.amt)}</span></td>
      <td><b>${hasData ? money(val(h)) : '<span class="muted">—</span>'}</b></td>
      <td style="white-space:nowrap">
        <button class="button" data-editamt="${h.id}" title="Editar cantidad">✎</button>
        <button class="button danger" data-delcoin="${h.id}" title="Quitar de mi lista">×</button>
      </td>
    </tr>`;
  };

  const alertRow = a => `
    <div class="alertrow">${coinAvatar(a.id)}
      <div class="grow"><b>${symOf(a.id)}</b> ${a.dir === 'above' ? 'sube por encima de' : 'baja por debajo de'} <b>${money2(a.price)}</b>
        <br><small class="muted">${a.fired ? 'Activada — reármala para volver a vigilar' : 'Vigilando el mercado'}</small></div>
      ${a.fired ? '<button class="button green" data-rearm="' + a.id + '">↺</button>' : `<span class="switch ${a.on ? 'on' : ''}" data-toggalert="${a.id}"></span>`}
      <button class="button danger" data-delalert="${a.id}">×</button>
    </div>`;

  host.innerHTML = `
  <div class="viewhead"><h2>Cripto seguimiento</h2><p>Precios en vivo vía CoinGecko (público, sin claves API). Tus cantidades se guardan solo en este dispositivo. Con cantidad 0 la moneda queda en modo solo-precio.</p></div>
  <div class="grid" style="grid-template-columns:1.35fr 1fr 1fr">
    <article class="card">
      <div class="cardhead"><h3>Mi portafolio</h3>${statusTag()}</div>
      <div class="panelbody">
        <div style="font-size:27px;font-weight:800">${rows.length ? money(total) : '—'}</div>
        <div class="muted">24 h: <b class="${chgUSD >= 0 ? 'up' : 'down'}">${chgTxt}</b>
          (${chgPct >= 0 ? '+' : ''}${chgPct.toFixed(2)}%) · ${hold.length} monedas · actualizado ${ts ? fmtAge(ts) : '—'}</div>
        <div style="margin-top:10px">
          ${alloc.length ? alloc.map(({ h, v }) => {
            const pct = Math.round(v / total * 100);
            return `<div class="metric"><span>${symOf(h.id)} · ${money(v)}</span><b>${pct}%</b></div>
                    <div class="bar"><i style="width:${pct}%"></i></div>`;
          }).join('') : '<div class="empty">Añade monedas y cantidades para ver tu portafolio.</div>'}
        </div>
        <button class="button" id="refreshCrypto" style="width:100%;margin-top:10px">↻ Actualizar precios ahora</button>
      </div>
    </article>

    <article class="card">
      <div class="cardhead"><h3>Mejores 24 h</h3><span class="up">SUBEN</span></div>
      <div class="list">${best.length ? best.map(moverRow).join('') + hold.filter(h => !rowOf(h.id)).slice(0, 1).map(noDataRow).join('') : '<div class="empty"><span class="big">◇</span>Sin datos de mercado todavía.</div>'}</div>
    </article>

    <article class="card">
      <div class="cardhead"><h3>Peores 24 h</h3><span class="down">BAJAN</span></div>
      <div class="list">${worst.length ? worst.map(moverRow).join('') + hold.filter(h => !rowOf(h.id)).slice(0, 1).map(noDataRow).join('') : '<div class="empty"><span class="big">◇</span>Sin datos de mercado todavía.</div>'}</div>
    </article>
  </div>

  <article class="card" style="margin-top:12px">
    <div class="cardhead"><h3>Mis criptos (${hold.length})</h3><span class="muted">TOCA ✎ PARA EDITAR LA CANTIDAD</span></div>
    <div class="tblwrap"><table class="tbl">
      <thead><tr><th>Moneda</th><th>Precio</th><th>24 h</th><th>7 días</th><th>Tienes</th><th>Valor</th><th></th></tr></thead>
      <tbody>${hold.length ? hold.map(coinRow).join('') : '<tr><td colspan="7"><div class="empty">Tu lista está vacía. Añade monedas abajo.</div></td></tr>'}</tbody>
    </table></div>
  </article>

  <div class="grid" style="grid-template-columns:1fr 1fr;margin-top:12px">
    <article class="card">
      <div class="cardhead"><h3>Añadir moneda</h3><span class="muted">${CATALOG.length} DISPONIBLES</span></div>
      <div class="panelbody">
        <div class="field"><label>Moneda</label>
          <select id="addCoinSel">${CATALOG.filter(c => !hold.some(h => h.id === c[0])).map(c => `<option value="${c[0]}">${c[2]} · ${c[1]}</option>`).join('') || '<option value="">Ya tienes todas las del catálogo</option>'}</select></div>
        <button class="button green" id="addCoinBtn" style="width:100%">＋ Añadir a mi lista</button>
        <p class="muted" style="margin:8px 0 0">Consejo: después toca ✎ en la tabla para registrar cuántas unidades tienes.</p>
      </div>
    </article>

    <article class="card">
      <div class="cardhead"><h3>Alertas de precio</h3><span class="muted">${alerts.filter(a => a.on && !a.fired).length} ACTIVAS</span></div>
      <div class="panelbody">
        <div class="formrow">
          <select id="alertCoin" style="flex:1.2;background:rgba(6,17,32,.85);border:1px solid var(--line);border-radius:11px;padding:9px;color:var(--text);font-size:11px">
            ${hold.map(h => `<option value="${h.id}">${symOf(h.id)}</option>`).join('')}
          </select>
          <select id="alertDir" style="flex:1;background:rgba(6,17,32,.85);border:1px solid var(--line);border-radius:11px;padding:9px;color:var(--text);font-size:11px">
            <option value="above">≥ sube por</option><option value="below">≤ baja por</option>
          </select>
          <input id="alertPrice" type="number" step="any" min="0" placeholder="USD" style="flex:1;background:rgba(6,17,32,.85);border:1px solid var(--line);border-radius:11px;padding:9px;color:var(--text);font-size:11px">
          <button class="button green" id="alertAdd" style="padding:9px 12px">＋</button>
        </div>
        <div style="margin-top:8px">
          ${alerts.length ? alerts.map(alertRow).join('') : '<div class="empty">Sin alertas. Ej.: "BTC ≥ 120000" te avisa al superarlo.</div>'}
        </div>
      </div>
    </article>
  </div>`;

  /* --- Eventos --- */
  $('#refreshCrypto').onclick = () => { cryptoLastTry = 0; fetchPrices(false); };

  $$('#view-criptos [data-editamt]').forEach(b => b.onclick = () => {
    const id = b.dataset.editamt;
    const hold2 = getHoldings();
    const h = hold2.find(x => x.id === id); if (!h) return;
    const span = $(`[data-amt="${id}"]`); if (!span) return;
    span.outerHTML = `<input class="amtinput" id="amt-${id}" type="number" step="any" min="0" value="${h.amt}">`;
    const inp = $(`#amt-${id}`); inp.focus(); inp.select();
    let done = false;
    const save = () => {
      if (done) return; done = true;
      const v = parseFloat(inp.value);
      const hold3 = getHoldings(); const h3 = hold3.find(x => x.id === id);
      if (h3 && !isNaN(v) && v >= 0) { h3.amt = v; setHoldings(hold3); toast(`Cantidad de ${symOf(id)} actualizada`, 'ok', 1600); }
      renderCrypto();
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    inp.addEventListener('blur', save);
  });

  $$('#view-criptos [data-delcoin]').forEach(b => b.onclick = () => {
    const id = b.dataset.delcoin;
    setHoldings(getHoldings().filter(h => h.id !== id));
    NOVA.set(NOVA.keys.ALERTS, NOVA.get(NOVA.keys.ALERTS, []).filter(a => a.id !== id));
    toast(`${nameOf(id)} quitada de tu lista`, '', 1800);
    renderCrypto();
  });

  const addBtn = $('#addCoinBtn');
  if (addBtn) addBtn.onclick = () => {
    const sel = $('#addCoinSel'); if (!sel.value) return;
    if (getHoldings().some(h => h.id === sel.value)) return toast('Ya está en tu lista.', 'warn');
    setHoldings([...getHoldings(), { id: sel.value, amt: 0 }]);
    toast(`✦ ${nameOf(sel.value)} añadida (cantidad 0)`, 'ok');
    renderCrypto();
  };

  $('#alertAdd').onclick = () => {
    const id = $('#alertCoin').value, dir = $('#alertDir').value, price = parseFloat($('#alertPrice').value);
    if (!id) return toast('Añade primero una moneda.', 'warn');
    if (!(price > 0)) return toast('Escribe el precio objetivo en USD.', 'warn');
    const alerts2 = NOVA.get(NOVA.keys.ALERTS, []);
    alerts2.unshift({ key: uid(), id, dir, price, on: true, fired: false });
    NOVA.set(NOVA.keys.ALERTS, alerts2);
    toast(`⏰ Alerta creada: ${symOf(id)} ${dir === 'above' ? '≥' : '≤'} ${money2(price)}`, 'ok');
    renderCrypto();
  };

  $$('#view-criptos [data-toggalert]').forEach(sw => sw.onclick = () => {
    const alerts2 = NOVA.get(NOVA.keys.ALERTS, []);
    const a = alerts2.find(x => x.key === sw.dataset.toggalert);
    if (a) { a.on = !a.on; NOVA.set(NOVA.keys.ALERTS, alerts2); renderCrypto(); }
  });
  $$('#view-criptos [data-rearm]').forEach(b => b.onclick = () => {
    const alerts2 = NOVA.get(NOVA.keys.ALERTS, []);
    const a = alerts2.find(x => x.key === b.dataset.rearm);
    if (a) { a.fired = false; a.on = true; NOVA.set(NOVA.keys.ALERTS, alerts2); renderCrypto(); toast('Alerta rearmada', 'ok', 1600); }
  });
  $$('#view-criptos [data-delalert]').forEach(b => b.onclick = () => {
    NOVA.set(NOVA.keys.ALERTS, NOVA.get(NOVA.keys.ALERTS, []).filter(x => x.key !== b.dataset.delalert));
    renderCrypto();
  });
}

/* ---------- Tarjeta cripto del inicio ---------- */
function cryptoHome() {
  const tag = $('#cryptoTag'); if (!tag) return;
  const { ts, rows, demo } = getCached();
  const hold = getHoldings();
  const priceOf = id => { const r = rows.find(x => x.id === id); return r ? r.price : 0; };
  const total = hold.reduce((s, h) => s + h.amt * priceOf(h.id), 0);
  tag.innerHTML = cryptoLive ? '<span class="tag">● EN VIVO</span>'
    : rows.length ? (demo ? '<span class="tag blue">● DEMO</span>' : `<span class="tag yellow">◌ ${fmtAge(ts).toUpperCase()}</span>`)
    : '<span class="tag red">SIN DATOS</span>';
  $('#cryptoTotal').textContent = rows.length ? money(total) : '—';
  $('#cryptoSub').textContent = rows.length
    ? `${hold.length} monedas · 24 h: ${(() => { const c = rows.reduce((s, r) => { const h = hold.find(x => x.id === r.id); return s + (h ? h.amt * r.price * r.chg / 100 : 0); }, 0); return (c >= 0 ? '+' : '−') + '$' + Math.abs(c).toLocaleString('en-US', { maximumFractionDigits: 2 }); })()}`
    : 'Sin conexión: se mostrarán los precios al reconectar.';
  const rowsEl = $('#cryptoHomeRows');
  if (rowsEl) {
    const top = [...rows].sort((a, b) => b.chg - a.chg).slice(0, 3);
    rowsEl.innerHTML = top.map(r => `
      <div class="hometile">${coinAvatar(r.id)}<span>${r.sym}</span>
        <span class="muted">${money2(r.price)}</span>
        <b class="${r.chg >= 0 ? 'up' : 'down'}">${r.chg >= 0 ? '↑' : '↓'} ${Math.abs(r.chg).toFixed(1)}%</b>
      </div>`).join('');
  }
}

/* ---------- Voz: "precio de bitcoin", "¿cómo van mis criptos?" ---------- */
window.cryptoAnswerFn = function (cmd) {
  const { rows } = getCached();
  if (!rows.length) return 'Todavía no tengo precios de cripto. En cuanto haya conexión los consultaré al instante.';
  let found = null;
  for (const [id, sym, name] of CATALOG) {
    const aliases = [sym.toLowerCase(), name.toLowerCase().split(' ')[0], id.replace(/-/g, ' ')];
    for (const a of aliases) {
      const hit = a.length > 4 ? cmd.includes(a) : new RegExp('\\b' + a + '\\b').test(cmd);
      if (hit) { found = { id, sym, name }; break; }
    }
    if (found) break;
  }
  const r = found ? rows.find(x => x.id === found.id) : null;
  if (r) {
    const h = getHoldings().find(x => x.id === r.id);
    const up = r.chg >= 0;
    return `${r.name} cotiza en ${money2(r.price)} dólares, ${up ? 'sube' : 'baja'} un ${Math.abs(r.chg).toFixed(1)} por ciento en 24 horas` +
      (h && h.amt ? `. Tienes ${fmtAmt(h.amt)} ${r.sym}, valorado en ${money(h.amt * r.price)}.` : '.');
  }
  const hold = getHoldings();
  const total = hold.reduce((s, h) => { const rr = rows.find(x => x.id === h.id); return s + (rr ? h.amt * rr.price : 0); }, 0);
  if (!total) return 'Tu portafolio cripto está vacío. Puedo añadir monedas en la sección Criptos.';
  const best = [...rows].sort((a, b) => b.chg - a.chg)[0];
  const worst = [...rows].sort((a, b) => a.chg - b.chg)[0];
  return `Tu portafolio cripto vale alrededor de ${money(total)} dólares. Lo mejor del día: ${best.name}, ${best.chg >= 0 ? 'más' : 'menos'} ${Math.abs(best.chg).toFixed(1)} por ciento. Lo más débil: ${worst.name} con ${worst.chg.toFixed(1)} por ciento.`;
};

/* ---------- Init del módulo ---------- */
document.addEventListener('DOMContentLoaded', () => {
  getHoldings();
  if (!getCached().rows.length) seedDemo();
  renderCrypto();
  cryptoHome();
  fetchPrices(true);
  setInterval(() => fetchPrices(true), 60000);
  NOVA.on('data', () => { cryptoHome(); if (typeof currentView !== 'undefined' && currentView === 'criptos') renderCrypto(); });
});
