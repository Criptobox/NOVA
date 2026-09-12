'use client';

/* NOVA v010 — Vista Trading: motor de trading automatizado con reglas de
   riesgo, simulación por defecto 🧪, señales técnicas, backtest y sniper.
   La misma prudencia del módulo Tienda: nada real sin decisión explícita. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';
import { CsvButton, money2 } from './ui';

interface Cfg {
  on: boolean; simMode: boolean; symbols: string;
  maxPosQuote: number; maxPctCapital: number; stopLossPct: number;
  takeProfitPct: number; maxTradesHour: number; sniperOn: boolean;
}
interface OpenPos { symbol: string; entry: number; qty: number; quote: number; price: number | null; pnl: number | null; since: string }
interface LastTrade { id: string; symbol: string; side: string; price: number; quoteQty: number; result: number | null; mode: string; reason: string; status: string; createdAt: string }
interface StatusData {
  ok: boolean; cfg: Cfg; mode: 'sim' | 'testnet' | 'real'; credsOn: boolean;
  open: OpenPos[];
  today: { trades: number; pnl: number };
  totals: { trades: number; pnl: number };
  lastTrades: LastTrade[];
  sniper: { on: boolean; tracked: number; recent: { symbol: string; firstSeen: string; handled: boolean; note: string }[] };
}
interface SignalRow { symbol: string; action: string | null; score: number | null; confidence: number | null; price: number | null; breakdown: string[] }
interface BacktestData { trades: number; winRate: number; returnPct: number; maxDrawdownPct: number; buyHoldPct: number; note: string }

const MODE_LABEL: Record<string, string> = { sim: '🧪 Simulación', testnet: '🧪 Testnet', real: '💰 REAL' };
const REASON_LABEL: Record<string, string> = {
  'señal': 'Señal', 'stop-loss': 'Stop-loss', 'take-profit': 'Take-profit',
  'manual': 'Manual', 'sniper: nuevo listado': 'Sniper', 'señal de venta': 'Señal de venta',
};

export function TradingView() {
  const [st, setSt] = useState<StatusData | null>(null);
  const [signals, setSignals] = useState<SignalRow[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ t: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [form, setForm] = useState<Cfg | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [testnet, setTestnet] = useState(true);
  const [keyMask, setKeyMask] = useState('');
  const [bt, setBt] = useState<{ symbol: string; days: string; data: BacktestData | null; running: boolean }>({ symbol: 'BTCUSDT', days: '30', data: null, running: false });

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/trading/status', { cache: 'no-store' });
      const d = (await r.json()) as StatusData;
      if (d.ok) {
        setSt(d);
        setForm(d.cfg);
      }
    } catch { /* silencioso */ }
  }, []);

  const loadSignals = useCallback(async (symbols: string) => {
    try {
      const r = await fetch(`/api/trading/signals?symbols=${encodeURIComponent(symbols)}`, { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) setSignals(d.signals || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (st?.cfg?.symbols) void loadSignals(st.cfg.symbols); }, [st?.cfg?.symbols, loadSignals]);

  const saveCfg = async (patch: Partial<Cfg> & Record<string, unknown>, label: string) => {
    setBusy(label);
    setMsg(null);
    try {
      const r = await fetch('/api/trading/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (d.ok) { setMsg({ t: 'ok', text: label + ' ✓' }); await load(); }
      else setMsg({ t: 'err', text: d.error || 'No se pudo guardar' });
    } catch { setMsg({ t: 'err', text: 'Sin conexión con el servidor' }); }
    finally { setBusy(''); }
  };

  const saveCreds = async () => {
    setBusy('creds');
    setMsg(null);
    try {
      const r = await fetch('/api/trading/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey, apiSecret, testnet }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg({ t: 'ok', text: (d.credMsg || 'Credenciales guardadas') + (d.test?.ok ? ' · conexión verificada ✓' : d.test ? ` · pero falló la verificación: ${d.test.error}` : '') });
        setApiKey(''); setApiSecret('');
        await load();
      } else setMsg({ t: 'err', text: d.error || 'No se pudieron guardar las claves' });
    } catch { setMsg({ t: 'err', text: 'Sin conexión con el servidor' }); }
    finally { setBusy(''); }
  };

  const toggle = async (on: boolean) => {
    setBusy(on ? 'activar' : 'pausar');
    try {
      await fetch(on ? '/api/trading/activate' : '/api/trading/pause', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notify: true }),
      });
      await load();
    } finally { setBusy(''); }
  };

  const evalNow = async () => {
    setBusy('eval');
    setMsg(null);
    try {
      const r = await fetch('/api/trading/eval', { method: 'POST' });
      const d = await r.json();
      if (d.ok) {
        const ops = d.operaciones?.length ? d.operaciones.join(' · ') : 'sin operaciones nuevas esta ronda';
        setMsg({ t: 'ok', text: `Evaluados ${d.evaluados} pares → ${ops}` });
        await load(); if (st?.cfg?.symbols) void loadSignals(st.cfg.symbols);
      } else setMsg({ t: 'err', text: d.error || 'Fallo al evaluar' });
    } catch { setMsg({ t: 'err', text: 'Sin conexión' }); }
    finally { setBusy(''); }
  };

  const runBacktest = async () => {
    setBt(b => ({ ...b, running: true }));
    try {
      const r = await fetch('/api/trading/backtest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: bt.symbol, days: parseInt(bt.days, 10) || 30 }),
      });
      const d = await r.json();
      if (d.ok) setBt(b => ({ ...b, data: d as BacktestData }));
      else setMsg({ t: 'err', text: d.error || 'Backtest fallido' });
    } catch { setMsg({ t: 'err', text: 'Sin conexión' }); }
    finally { setBt(b => ({ ...b, running: false })); }
  };

  const scanSniper = async () => {
    setBusy('sniper');
    try {
      const r = await fetch('/api/trading/sniper', { method: 'POST' });
      const d = await r.json();
      if (d.ok) setMsg({ t: d.nuevos?.length ? 'warn' : 'ok', text: d.nuevos?.length ? `🎯 ${d.nuevos.length} nuevo(s) listado(s) detectado(s)` : (d.sniperError || `Escaneados ${d.scanned} pares: nada nuevo`) });
      else setMsg({ t: 'err', text: d.error || 'Escaneo fallido' });
      await load();
    } finally { setBusy(''); }
  };

  if (!st || !form) return <div className="empty">Cargando el módulo de trading…</div>;

  const modePill = st.mode === 'real' ? 'tag red' : st.mode === 'testnet' ? 'tag blue' : 'tag yellow';

  return (
    <section className="view active" id="view-trading">
      <div className="viewhead">
        <h2>Trading automatizado</h2>
        <p>Señales técnicas (tendencia, RSI, MACD y volumen) con reglas de riesgo duras. <b>Arranca siempre en simulación 🧪</b>: cada operación se registra sin tocar dinero real. Esto no es asesoría financiera.</p>
      </div>

      {msg && <div className={`opmsg ${msg.t === 'ok' ? 'good' : msg.t === 'warn' ? 'simmsg' : 'bad'}`}>{msg.text}</div>}

      <div className="stack">
        {/* Estado del motor */}
        <article className="card">
          <div className="cardhead">
            <h3>Motor</h3>
            <span style={{ display: 'flex', gap: 6 }}>
              <span className={modePill}>{MODE_LABEL[st.mode]}</span>
              <span className={`tag ${st.cfg.on ? 'green' : ''}`}>{st.cfg.on ? '● ACTIVO' : '○ PAUSADO'}</span>
            </span>
          </div>
          <div className="stats">
            <div className="stat"><label>Posiciones abiertas</label><strong>{st.open.length}</strong></div>
            <div className="stat"><label>Ventas hoy</label><strong>{st.today.trades}</strong></div>
            <div className="stat"><label>PnL hoy</label><strong className={st.today.pnl >= 0 ? 'up' : 'down'}>{st.today.pnl >= 0 ? '+' : ''}{st.today.pnl.toFixed(2)}</strong></div>
            <div className="stat"><label>PnL acumulado</label><strong className={st.totals.pnl >= 0 ? 'up' : 'down'}>{st.totals.pnl >= 0 ? '+' : ''}{st.totals.pnl.toFixed(2)}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {st.cfg.on
              ? <button className="button" style={{ flex: 1 }} disabled={busy === 'pausar'} onClick={() => void toggle(false)}>⏸ Pausar</button>
              : <button className="button green" style={{ flex: 1 }} disabled={busy === 'activar'} onClick={() => void toggle(true)}>▶ Activar</button>}
            <button className="button" style={{ flex: 1 }} disabled={busy === 'eval'} onClick={() => void evalNow()}>{busy === 'eval' ? 'Evaluando…' : '⚡ Evaluar ahora'}</button>
          </div>
          {st.mode === 'sim' && (
            <div className="simpline">
              🧪 <b>Modo simulación:</b> las operaciones se registran en el historial con precios reales pero sin dinero. Cuando tengas claves de testnet/real y apagues la simulación, las órdenes irán al exchange.
            </div>
          )}
        </article>

        {/* Reglas de riesgo */}
        <article className="card wide">
          <div className="cardhead"><h3>Reglas de riesgo (se aplican ANTES de cada orden)</h3><span className="muted">PROTECCIÓN PRIMERO</span></div>
          <div className="panelbody">
            <div className="riskgrid">
              <div className="field"><label>Pares vigilados (máx 10)</label>
                <input value={form.symbols} onChange={e => setForm({ ...form, symbols: e.target.value })} placeholder="BTCUSDT, ETHUSDT, SOLUSDT" /></div>
              <div className="field"><label>Tamaño máx. posición (USDT)</label>
                <input type="number" min={10} value={form.maxPosQuote} onChange={e => setForm({ ...form, maxPosQuote: parseFloat(e.target.value) || 0 })} /></div>
              <div className="field"><label>% capital por operación</label>
                <input type="number" min={0.5} step={0.5} value={form.maxPctCapital} onChange={e => setForm({ ...form, maxPctCapital: parseFloat(e.target.value) || 0 })} /></div>
              <div className="field"><label>Stop-loss (%)</label>
                <input type="number" min={0.5} step={0.5} value={form.stopLossPct} onChange={e => setForm({ ...form, stopLossPct: parseFloat(e.target.value) || 0 })} /></div>
              <div className="field"><label>Take-profit (%)</label>
                <input type="number" min={0.5} step={0.5} value={form.takeProfitPct} onChange={e => setForm({ ...form, takeProfitPct: parseFloat(e.target.value) || 0 })} /></div>
              <div className="field"><label>Máx. operaciones/hora</label>
                <input type="number" min={1} max={20} value={form.maxTradesHour} onChange={e => setForm({ ...form, maxTradesHour: parseInt(e.target.value, 10) || 1 })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <button className="button green" disabled={busy === 'riesgo'} onClick={() => void saveCfg({
                symbols: form.symbols, maxPosQuote: form.maxPosQuote, maxPctCapital: form.maxPctCapital,
                stopLossPct: form.stopLossPct, takeProfitPct: form.takeProfitPct, maxTradesHour: form.maxTradesHour,
              }, 'Reglas de riesgo guardadas')}>Guardar reglas</button>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={form.simMode} onChange={e => void saveCfg({ simMode: e.target.checked }, e.target.checked ? 'Simulación activada 🧪' : '⚠️ Simulación DESACTIVADA')} />
                Modo simulación 🧪 (desactívalo solo cuando quieras operar de verdad)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                <input type="checkbox" checked={form.sniperOn} onChange={e => void saveCfg({ sniperOn: e.target.checked }, e.target.checked ? 'Sniper activado 🎯' : 'Sniper apagado')} />
                Sniper de nuevos listados 🎯 (solo simulación)
              </label>
            </div>
          </div>
        </article>

        {/* Señales en vivo */}
        <article className="card wide">
          <div className="cardhead"><h3>Señales en vivo (velas de 1 h)</h3><button className="csvbtn" onClick={() => void loadSignals(st.cfg.symbols)} title="Recalcular señales"><Icon name="refresh" size={12} /> Recalcular</button></div>
          <div className="panelbody">
            {signals.length ? signals.map(sg => (
              <div className="signalrow" key={sg.symbol}>
                <b>{sg.symbol}</b>
                <span className={`tag ${sg.action === 'comprar' ? 'green' : sg.action === 'vender' ? 'red' : ''}`}>
                  {sg.action ? (sg.action === 'comprar' ? '🟢 COMPRAR' : sg.action === 'vender' ? '🔴 VENDER' : '⚪ ESPERAR') : '— sin datos'}
                </span>
                {sg.score !== null && <small>score {sg.score} · conf {sg.confidence}% · {sg.price ? money2(sg.price) : '—'}</small>}
              </div>
            )) : <div className="empty">Pulsa “Recalcular” para ver las señales.</div>}
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 10 }}>
              El motor actúa solo cuando el score llega a ±1.5: tendencia (EMA9/EMA21), RSI 14, MACD y volumen relativo. El stop-loss y el take-profit se gestionan siempre antes que cualquier señal nueva.
            </p>
          </div>
        </article>

        {/* Posiciones abiertas */}
        <article className="card">
          <div className="cardhead"><h3>Posiciones abiertas</h3><span className="muted">SL/TP ACTIVOS</span></div>
          <div className="panelbody">
            {st.open.length ? st.open.map(o => (
              <div className="metric" key={o.symbol + o.since}>
                <span><i className={o.pnl !== null && o.pnl < 0 ? 'dotr' : 'dotg'} /> {o.symbol} · entrada {money2(o.entry)}</span>
                <b className={o.pnl !== null && o.pnl < 0 ? 'down' : 'up'}>
                  {o.price ? money2(o.price) : '—'} {o.pnl !== null ? `(${o.pnl >= 0 ? '+' : ''}${o.pnl.toFixed(2)})` : ''}
                </b>
              </div>
            )) : <div className="empty">Sin posiciones abiertas ahora mismo.</div>}
          </div>
        </article>

        {/* Conexión exchange */}
        <article className="card">
          <div className="cardhead"><h3>Conexión exchange (Binance)</h3><span className="tag">{st.credsOn ? '● CONECTADO' : '○ SIN CLAVES'}</span></div>
          <div className="panelbody">
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 11, lineHeight: 1.6 }}>
              Las claves se cifran con AES-256-GCM y no vuelven a mostrarse. Empieza con las claves de <b>testnet</b> (fondos ficticios): testnet.binance.vision.
            </p>
            <div className="field"><label>API key {keyMask ? `(actual: ${keyMask})` : ''}</label>
              <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="pega tu API key" autoComplete="off" /></div>
            <div className="field"><label>API secret</label>
              <input type="password" value={apiSecret} onChange={e => setApiSecret(e.target.value)} placeholder="pega tu API secret" autoComplete="new-password" /></div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
              <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} />
              Usar TESTNET (fondos ficticios — recomendado)
            </label>
            <button className="button" style={{ width: '100%' }} disabled={busy === 'creds' || !apiKey || !apiSecret} onClick={() => void saveCreds()}>
              {busy === 'creds' ? 'Guardando…' : 'Guardar y verificar claves'}
            </button>
          </div>
        </article>

        {/* Backtest */}
        <article className="card">
          <div className="cardhead"><h3>Backtest de la estrategia</h3><span className="muted">VELAS REALES 1 H</span></div>
          <div className="panelbody">
            <div className="riskgrid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="field"><label>Par</label>
                <input value={bt.symbol} onChange={e => setBt(b => ({ ...b, symbol: e.target.value.toUpperCase() }))} /></div>
              <div className="field"><label>Días (7-45)</label>
                <input type="number" min={7} max={45} value={bt.days} onChange={e => setBt(b => ({ ...b, days: e.target.value }))} /></div>
            </div>
            <button className="button" style={{ width: '100%', marginTop: 6 }} disabled={bt.running} onClick={() => void runBacktest()}>{bt.running ? 'Simulando…' : 'Ejecutar backtest'}</button>
            {bt.data && (
              <div className="stats" style={{ marginTop: 10 }}>
                <div className="stat"><label>Operaciones</label><strong>{bt.data.trades}</strong></div>
                <div className="stat"><label>Win rate</label><strong>{bt.data.winRate}%</strong></div>
                <div className="stat"><label>Retorno</label><strong className={bt.data.returnPct >= 0 ? 'up' : 'down'}>{bt.data.returnPct >= 0 ? '+' : ''}{bt.data.returnPct}%</strong></div>
                <div className="stat"><label>Drawdown máx</label><strong className="down">−{bt.data.maxDrawdownPct}%</strong></div>
                <div className="stat"><label>Si solo comprara y esperara</label><strong className={bt.data.buyHoldPct >= 0 ? 'up' : 'down'}>{bt.data.buyHoldPct >= 0 ? '+' : ''}{bt.data.buyHoldPct}%</strong></div>
              </div>
            )}
            <p className="muted" style={{ margin: '8px 0 0', fontSize: 10 }}>{bt.data?.note || 'Compara siempre con “comprar y mantener”: si la estrategia no lo supera en el backtest, no la actives en real.'}</p>
          </div>
        </article>

        {/* Historial */}
        <article className="card wide">
          <div className="cardhead"><h3>Historial de operaciones</h3><CsvButton what="trading" title="Exportar operaciones" /></div>
          <div className="panelbody">
            {st.lastTrades.length ? (
              <div className="movelist">
                {st.lastTrades.map(t => (
                  <div className="moverow" key={t.id}>
                    <span className={`movebadge ${t.side === 'BUY' ? 'reposicion' : 'venta'}`}>{t.side === 'BUY' ? 'Compra' : 'Venta'}</span>
                    <div className="moveinfo">
                      <b>{t.symbol} · {money2(t.price)}</b>
                      <small>{t.quoteQty ? `${t.quoteQty.toFixed(2)} USDT · ` : ''}{REASON_LABEL[t.reason] || t.reason} · {t.status}{t.result !== null ? ` · PnL ${t.result >= 0 ? '+' : ''}${t.result.toFixed(2)}` : ''}</small>
                    </div>
                    <span className={`syncbadge ${t.mode}`}>{t.mode === 'sim' ? '🧪 sim' : t.mode === 'testnet' ? '🧪 testnet' : '💰 real'}</span>
                    <span className="movetime">{new Date(t.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            ) : <div className="empty">Todavía no hay operaciones. Activa el motor y púlsalo en “Evaluar ahora”.</div>}
          </div>
        </article>

        {/* Sniper */}
        <article className="card">
          <div className="cardhead"><h3>Sniper de nuevos listados</h3><span className={`tag ${st.sniper.on ? 'green' : ''}`}>{st.sniper.on ? '● VIGILANDO' : '○ APAGADO'}</span></div>
          <div className="panelbody">
            <p className="muted" style={{ margin: '0 0 8px', fontSize: 11, lineHeight: 1.6 }}>
              Detecta pares recién listados en Binance, aplica checks anti-riesgo y registra una compra <b>simulada</b>. El sniping on-chain real (DEX, milisegundos) requiere un worker aparte fuera de Vercel.
            </p>
            <div className="metric"><span><i className="dotb" /> Pares vigilados</span><b>{st.sniper.tracked}</b></div>
            {st.sniper.recent.slice(0, 4).map(r => (
              <div className="metric" key={r.symbol}><span><i className={r.handled ? 'dotg' : 'doty'} /> {r.symbol}</span><b>{r.note || 'vigilando'}</b></div>
            ))}
            <button className="button" style={{ width: '100%', marginTop: 10 }} disabled={busy === 'sniper'} onClick={() => void scanSniper()}>{busy === 'sniper' ? 'Escaneando…' : '🎯 Escanear ahora'}</button>
          </div>
        </article>

        {/* Comandos por voz/WhatsApp */}
        <article className="card">
          <div className="cardhead"><h3>Pedírselo a NOVA</h3><span className="muted">AGENTE → TRADING</span></div>
          <div className="panelbody">
            <div className="voiceex">
              <div>📈 «<b>estado trading</b>»</div>
              <div>📊 «<b>señal btc</b>» / «analiza eth»</div>
              <div>🤖 «<b>activar trading</b>» / «pausar trading»</div>
              <div>🛒 «<b>compra btc</b>» / «vende eth» (sim/testnet)</div>
              <div>🧾 «<b>resumen operaciones</b>»</div>
              <div>⚡ «<b>evalúa el trading</b>»</div>
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 10, lineHeight: 1.6 }}>
              Funciona en la pestaña Agente y por WhatsApp. Las órdenes de trading quedan reservadas al número del dueño.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
