'use client';

/* NOVA v010 — Dashboard principal: trading automatizado, modo offline con comandos locales, auto-actualización PWA */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Hero, type OrbState } from '@/components/nova/Brain';
import { AgentView } from '@/components/nova/AgentView';
import { CriptoView } from '@/components/nova/CriptoView';
import { ConvosView } from '@/components/nova/ConvosView';
import { MetricsView } from '@/components/nova/MetricsView';
import { SchedView } from '@/components/nova/SchedView';
import { SettingsView } from '@/components/nova/SettingsView';
import { ShopView } from '@/components/nova/ShopView';
import { TradingView } from '@/components/nova/TradingView';
import { CoinAvatar, money, downloadCsv } from '@/components/nova/ui';
import { SwRegister, NOVA_VERSION } from '@/components/nova/SwRegister';
import { Icon, type IconName } from '@/components/nova/Icon';
import { cache, outboxCount, processOutbox } from '@/lib/nova/offline';

type View = 'inicio' | 'agente' | 'tienda' | 'trading' | 'convos' | 'criptos' | 'metrics' | 'sched' | 'ajustes';

const NAV: { id: View; icon: IconName; label: string }[] = [
  { id: 'inicio', icon: 'home', label: 'Inicio' },
  { id: 'agente', icon: 'brain', label: 'Agente' },
  { id: 'tienda', icon: 'box', label: 'Tienda' },
  { id: 'trading', icon: 'bolt', label: 'Trading' },
  { id: 'convos', icon: 'chat', label: 'Conversaciones' },
  { id: 'criptos', icon: 'coins', label: 'Criptos' },
  { id: 'metrics', icon: 'chart', label: 'Métricas' },
  { id: 'sched', icon: 'clock', label: 'Programados' },
  { id: 'ajustes', icon: 'gear', label: 'Ajustes' },
];

interface Stats {
  contacts: number; msgs24h: number; alertsActive: number; jobsOn: number;
  portfolioTotal: number; waMode: string; scheduler: { running: boolean };
  cryptoLive: boolean; withinHours: boolean;
  shopCount: number; shopUnidades: number; shopBajos: number; shopAgotados: number;
}
interface HomeRow { id: string; sym: string; name: string; price: number; chg: number }
interface TradingHome { on: boolean; mode: string; open: number; pnl: number }

export default function NovaDashboard() {
  const [view, setView] = useState<View>('inicio');
  const [orb, setOrb] = useState<OrbState>('standby');
  const [clock, setClock] = useState('--:--');
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<HomeRow[]>([]);
  const [tr, setTr] = useState<TradingHome | null>(null);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [dbOk, setDbOk] = useState<boolean | null>(null); // v014: null = comprobando
  const escalRef = useRef<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => {
      const d = new Date();
      setClock(d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [rs, rp, rt] = await Promise.all([
        fetch('/api/stats', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crypto/prices', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/trading/status', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      ]);
      if (rs.ok) { setStats(rs); cache.stats(rs); }           // v010: snapshot offline
      if (rp.ok) {
        const rows: HomeRow[] = rp.rows || [];
        setTop([...rows].sort((a, b) => b.chg - a.chg).slice(0, 3));
        cache.prices(rows);                                    // v010: snapshot offline
      }
      if (rt?.ok) {
        setTr({ on: rt.cfg?.on || false, mode: rt.mode, open: rt.open?.length || 0, pnl: rt.totals?.pnl || 0 });
        cache.trades(rt.lastTrades || []);                     // v010: snapshot offline
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void loadStats(); const t = setInterval(() => void loadStats(), 60000); return () => clearInterval(t); }, [loadStats]);

  /* v014 — Diagnóstico de base de datos: si Vercel Postgres aún no está creada/
     conectada, se muestra un aviso con los pasos exactos en vez de dejar los
     apartados vacíos sin explicación. Se reintenta cada 60 s automáticamente. */
  useEffect(() => {
    const check = () => fetch('/api/health', { cache: 'no-store' })
      .then(r => r.json()).then(h => setDbOk(!!h?.db)).catch(() => setDbOk(false));
    check();
    const t = setInterval(check, 60000);
    return () => clearInterval(t);
  }, []);

  /* v010 — MODO OFFLINE: indicador + sincronización de la outbox al reconectar */
  useEffect(() => {
    setOnline(navigator.onLine);
    setPendientes(outboxCount());
    const on = () => {
      setOnline(true);
      void (async () => {
        const r = await processOutbox();
        setPendientes(outboxCount());
        if (r.done > 0) {
          setToast(`Conexión recuperada: ${r.done} comando${r.done > 1 ? 's' : ''} sincronizado${r.done > 1 ? 's' : ''} ✓`);
          setTimeout(() => setToast(''), 8000);
          void loadStats();
        }
      })();
    };
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    /* v011 — red de seguridad: algunos navegadores/móviles no disparan el
       evento "online" al reconectar; si quedan comandos en la outbox,
       reintenta la sincronización cada 15 s mientras el panel esté abierto */
    const iv = setInterval(() => {
      if (navigator.onLine && outboxCount() > 0) on();
    }, 15000);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv); };
  }, [loadStats]);

  /* v008 — si la PWA se auto-actualizó (el SW recargó la página), avisar con un toast */
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('nova:justUpdated');
      if (v) {
        sessionStorage.removeItem('nova:justUpdated');
        setToast(`NOVA se actualizó a la ${v} ✓ — ya estás viendo la versión nueva.`);
        setTimeout(() => setToast(''), 8000);
      }
    } catch { /* noop */ }
  }, []);

  /* v006 — detector de escalados: si sube el contador, toast + notificación local */
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch('/api/metrics', { cache: 'no-store' });
        const d = await r.json();
        if (!d.ok) return;
        const n: number = d.escalados7 || 0;
        if (escalRef.current !== null && n > escalRef.current) {
          setToast('Un contacto pidió hablar con un humano — revísalo en Conversaciones.');
          if (Notification.permission === 'granted') {
            navigator.serviceWorker?.ready.then(reg => {
              reg.showNotification('🔔 Un contacto pide un humano', {
                body: 'Ábrela para responderle tú mismo desde Conversaciones.',
                icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png', tag: 'nova-escalate',
              }).catch(() => { /* noop */ });
            }).catch(() => { /* noop */ });
          }
          setTimeout(() => setToast(''), 8000);
        }
        escalRef.current = n;
      } catch { /* silencioso */ }
    };
    void check();
    const t = setInterval(() => void check(), 25000);
    return () => clearInterval(t);
  }, []);

  /* v012 — MODO CLARO / OSCURO: alterna el tema, lo guarda y actualiza el color del navegador */
  const toggleTheme = () => {
    const el = document.documentElement;
    const next = el.dataset.theme === 'light' ? 'dark' : 'light';
    el.dataset.theme = next;
    try { localStorage.setItem('nova:theme', next); } catch { /* noop */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f4f1e9' : '#030711');
  };

  const dateLine = new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="nova-app">
      <div className="app">
        <aside className="sidebar">
          <div className="brand"><i /><span>NOVA</span></div>
          <nav className="nav" aria-label="Vistas">
            {NAV.map(n => (
              <button key={n.id} className={view === n.id ? 'active' : ''} onClick={() => { setView(n.id); if (n.id !== 'agente') setOrb('standby'); }}>
                <Icon name={n.icon} size={17} /><label style={{ cursor: 'pointer' }}>{n.label}</label>
              </button>
            ))}
          </nav>
          <div className="profile">
            <div className="avatar" />
            <div className="meta"><b>Dueño</b><small>{stats?.waMode === 'live' ? 'WhatsApp en vivo' : 'Modo simulador'}</small></div>
          </div>
        </aside>

        <main>
          <header className="topbar">
            <div>
              <div className="time">{clock}</div>
              <div className="date">{dateLine.charAt(0).toUpperCase() + dateLine.slice(1)} · NOVA {NOVA_VERSION}</div>
            </div>
            <div className="top-actions">
              <button className="iconbtn" onClick={toggleTheme} aria-label="Cambiar entre modo claro y modo oscuro" title="Modo claro / oscuro">
                <Icon name="moon" className="thicon thmoon" size={16} />
                <Icon name="sun" className="thicon thsun" size={16} />
              </button>
              <div className={`pill ${stats?.waMode === 'live' ? 'ok' : 'sim'}`}>
                {stats?.waMode === 'live' ? 'WhatsApp EN VIVO' : 'WhatsApp: simulador'}{stats && !stats.withinHours ? ' · fuera de horario' : ''}
              </div>
              {!online && (
                <span className="pill off">📴 Offline{pendientes ? ` · ${pendientes} pendiente${pendientes > 1 ? 's' : ''}` : ''}</span>
              )}
              <span className={`pill ${stats?.scheduler.running ? 'ok' : ''}`} style={{ display: stats?.scheduler.running ? undefined : 'none' }}>
                Planificador activo
              </span>
              <SwRegister />
            </div>
          </header>

          {/* v014 — Aviso de base de datos no conectada (se muestra en TODAS las vistas) */}
          {dbOk === false && (
            <div className="dbwarn" role="alert">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <b>Base de datos no conectada</b>
                <span>Ahora mismo los apartados quedan vacíos y no se guarda nada. En Vercel: pestaña <b>Storage</b> → <b>Create Database → Postgres</b> → <b>Connect Project</b> → <b>Redeploy</b> (las tablas se crean solas al redesplegar). Es el paso 4 de la DEPLOY-GUIA. Se reconecta solo cada 60 s.</span>
              </div>
            </div>
          )}

          {/* ---------- INICIO ---------- */}
          {view === 'inicio' && (
            <section className="view active">
              <div className="mgrid">
                <article className="card hero a-hero">
                  <Hero state={orb} />
                  <div className="hero-footer">
                    <div className="mini">Anti-spam</div>
                    <div className="mini">Modo horario</div>
                    <div className="mini">Notas de voz</div>
                    <div className="mini">Imágenes IA</div>
                    <div className="mini">Divisas</div>
                    <div className="mini">Botones WA</div>
                    <div className="mini">Tienda por voz</div>
                  </div>
                </article>

                <article className="card a-agente">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico blue"><Icon name="chat" size={16} /></span>
                      <div className="cht"><h3>Agente hoy</h3><span className="kicker">Actividad · últimas 24 h</span></div>
                    </div>
                  </div>
                  <div className="stats">
                    <div className="stat"><label>Contactos</label><strong>{stats?.contacts ?? '—'}</strong></div>
                    <div className="stat"><label>Mensajes 24 h</label><strong>{stats?.msgs24h ?? '—'}</strong></div>
                    <div className="stat"><label>Alertas vivas</label><strong>{stats?.alertsActive ?? '—'}</strong></div>
                    <div className="stat"><label>Programados</label><strong>{stats?.jobsOn ?? '—'}</strong></div>
                  </div>
                </article>

                <article className="card a-tienda">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico green"><Icon name="box" size={16} /></span>
                      <div className="cht"><h3>Tienda · TiendaMax</h3><span className="kicker">tiendamax.org</span></div>
                    </div>
                  </div>
                  <div className="panelbody">
                    <div className="stats">
                      <div className="stat"><label>Productos</label><strong>{stats?.shopCount ?? '—'}</strong></div>
                      <div className="stat"><label>Unidades</label><strong>{stats?.shopUnidades ?? '—'}</strong></div>
                      <div className="stat"><label>Stock bajo</label><strong>{stats?.shopBajos ?? '—'}</strong></div>
                      <div className="stat"><label>Agotados</label><strong>{stats?.shopAgotados ?? '—'}</strong></div>
                    </div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('tienda')}>Gestionar inventario por voz</button>
                  </div>
                </article>

                <article className="card a-trading">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico violet"><Icon name="bolt" size={16} /></span>
                      <div className="cht"><h3>Trading automatizado</h3><span className="kicker">Motor de señales en vivo</span></div>
                    </div>
                    <span className={tr ? `badge ${tr.on ? 'live' : 'off'}` : 'badge off'}>{tr ? (tr.on ? '● ACTIVO' : '○ PAUSADO') : '—'}</span>
                  </div>
                  <div className="panelbody">
                    <div className="stats">
                      <div className="stat"><label>Modo</label><strong>{tr ? (tr.mode === 'sim' ? '🧪 Sim' : tr.mode === 'testnet' ? 'Testnet' : '💰 Real') : '—'}</strong></div>
                      <div className="stat"><label>Posiciones</label><strong>{tr?.open ?? '—'}</strong></div>
                      <div className="stat"><label>PnL acumulado</label><strong className={(tr?.pnl || 0) >= 0 ? 'up' : 'down'}>{tr ? `${tr.pnl >= 0 ? '+' : ''}${tr.pnl.toFixed(2)}` : '—'}</strong></div>
                    </div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('trading')}>Abrir módulo de trading</button>
                  </div>
                </article>

                <article className="card a-cripto">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico cyan"><Icon name="coins" size={16} /></span>
                      <div className="cht"><h3>Cripto · portafolio</h3><span className="kicker">Precios reales de mercado</span></div>
                    </div>
                    <span className={`badge ${stats?.cryptoLive ? 'live' : 'off'}`}>{stats?.cryptoLive ? '● EN VIVO' : '○ SIN DATOS'}</span>
                  </div>
                  <div className="panelbody">
                    <div className="bignum">{stats ? money(stats.portfolioTotal) : '$—'}</div>
                    <div className="muted">{top.length ? 'Mejores del día:' : 'Consultando precios…'}</div>
                    <div style={{ marginTop: 8 }}>
                      {top.map(r => (
                        <div className="hometile" key={r.id}>
                          <CoinAvatar id={r.id} sym={r.sym} /><span>{r.sym}</span>
                          <span className="muted">${r.price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                          <b className={r.chg >= 0 ? 'up' : 'down'}>{r.chg >= 0 ? '↑' : '↓'} {Math.abs(r.chg).toFixed(1)}%</b>
                        </div>
                      ))}
                    </div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('criptos')}>Abrir portafolio cripto</button>
                  </div>
                </article>

                <article className="card a-datos">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico yellow"><Icon name="download" size={16} /></span>
                      <div className="cht"><h3>Datos y avisos</h3><span className="kicker">Tus datos, tus reglas</span></div>
                    </div>
                  </div>
                  <div className="panelbody">
                    <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
                      Exporta la información real del agente a CSV (Excel) y activa los avisos push para enterarte cuando alguien pida un humano.
                    </p>
                    <div className="expgrid">
                      <button className="expbtn" onClick={() => void downloadCsv('conversaciones')}><Icon name="chat" size={14} />Conversaciones</button>
                      <button className="expbtn" onClick={() => void downloadCsv('portafolio')}><Icon name="coins" size={14} />Portafolio</button>
                      <button className="expbtn" onClick={() => void downloadCsv('metricas')}><Icon name="chart" size={14} />Actividad 14 d</button>
                      <button className="expbtn" onClick={() => void downloadCsv('alertas')}><Icon name="bolt" size={14} />Alertas</button>
                    </div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('ajustes')}>Configurar el agente</button>
                  </div>
                </article>

                <article className="card a-protecc">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico blue"><Icon name="shield" size={16} /></span>
                      <div className="cht"><h3>Protección del agente</h3><span className="kicker">Siempre activa</span></div>
                    </div>
                  </div>
                  <div className="panelbody">
                    <div className="metric"><span><i className="dotg" /> Anti-spam inteligente</span><b>{stats ? '20 msg/min máx.' : '—'}</b></div>
                    <div className="metric"><span><i className="doty" /> Modo horario</span><b>{stats ? (stats.withinHours ? 'En horario' : 'Fuera de horario') : '—'}</b></div>
                    <div className="metric"><span><i className="dotr" /> Escalado a humano</span><b>Aviso push + WhatsApp</b></div>
                    <div className="metric"><span><i className="dotb" /> Vía oficial de Meta</span><b>Sin riesgo de baneo</b></div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('metrics')}>Ver métricas del agente</button>
                  </div>
                </article>

                <article className="card a-prueba">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico green"><Icon name="brain" size={16} /></span>
                      <div className="cht"><h3>Pruébalo ahora</h3><span className="kicker">Simulador en vivo</span></div>
                    </div>
                  </div>
                  <div className="panelbody">
                    <div className="pgrid">
                    <div className="row"><div className="thumb">🪙</div><div className="grow"><b>&quot;precio btc&quot;</b><small>Cotización real al instante</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">⏰</div><div className="grow"><b>&quot;alerta eth &gt;= 4000&quot;</b><small>Aviso por WhatsApp al cruzar</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">📦</div><div className="grow"><b>"stock bajo"</b><small>Existencias reales de tiendamax.org</small></div><button className="button" onClick={() => setView('tienda')}>Abrir tienda</button></div>
                    <div className="row"><div className="thumb">🎤</div><div className="grow"><b>Nota de voz</b><small>Transcripción con IA</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">💱</div><div className="grow"><b>&quot;100 usd a mxn&quot;</b><small>Conversor de divisas en vivo</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">🔘</div><div className="grow"><b>Menú con botones</b><small>Escribe &quot;hola&quot; y NOVA despliega opciones</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    </div>
                  </div>
                </article>

                <article className="card a-flujo">
                  <div className="cardhead">
                    <div className="chleft">
                      <span className="chico cyan"><Icon name="refresh" size={16} /></span>
                      <div className="cht"><h3>Flujo del agente</h3><span className="kicker">Loop NOVA · WhatsApp</span></div>
                    </div>
                  </div>
                  <div className="panelbody">
                    <div className="flowsteps">
                      <div className="fstep"><b>01</b><span>El usuario escribe por WhatsApp</span></div>
                      <div className="fstep"><b>02</b><span>Webhook oficial (Cloud API)</span></div>
                      <div className="fstep"><b>03</b><span>Anti-spam + control de horario</span></div>
                      <div className="fstep"><b>04</b><span>Detecta el tipo: texto · voz · imagen</span></div>
                      <div className="fstep"><b>05</b><span>Intención: cripto · alerta · tienda · humano</span></div>
                      <div className="fstep"><b>06</b><span>IA conversacional + motor</span></div>
                      <div className="fstep"><b>07</b><span>Responde gratis por WhatsApp</span></div>
                      <div className="fstep"><b>08</b><span>Todo queda registrado y exportable aquí</span></div>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          )}

          {view === 'agente' && <AgentView onState={setOrb} />}
          {view === 'tienda' && <ShopView />}
          {view === 'trading' && <TradingView />}
          {view === 'convos' && <ConvosView />}
          {view === 'criptos' && <CriptoView />}
          {view === 'metrics' && <MetricsView />}
          {view === 'sched' && <SchedView />}
          {view === 'ajustes' && <SettingsView />}

          <div className="footerbrand">
            <div className="fbrand">
              <div className="orbmini" />
              <div><b style={{ letterSpacing: 3 }}>NOVA</b><br />Agente WhatsApp + Cripto + Tienda + Trading · PWA {NOVA_VERSION} · modo offline · actualización automática</div>
            </div>
            <div className="muted">API oficial de Meta · gratis y sin riesgo</div>
          </div>
        </main>
      </div>

      {toast && (
        <button className="toast" onClick={() => { setView('convos'); setToast(''); }} role="alert">
          <Icon name="bell" size={15} />
          <span>{toast}</span>
        </button>
      )}
    </div>
  );
}
