'use client';

/* NOVA v006 — Dashboard principal: cerebro neuronal, CSV, push y PWA */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Hero, type OrbState } from '@/components/nova/Brain';
import { AgentView } from '@/components/nova/AgentView';
import { CriptoView } from '@/components/nova/CriptoView';
import { ConvosView } from '@/components/nova/ConvosView';
import { MetricsView } from '@/components/nova/MetricsView';
import { SchedView } from '@/components/nova/SchedView';
import { SettingsView } from '@/components/nova/SettingsView';
import { CoinAvatar, money, downloadCsv } from '@/components/nova/ui';
import { SwRegister } from '@/components/nova/SwRegister';
import { Icon, type IconName } from '@/components/nova/Icon';

type View = 'inicio' | 'agente' | 'convos' | 'criptos' | 'metrics' | 'sched' | 'ajustes';

const NAV: { id: View; icon: IconName; label: string }[] = [
  { id: 'inicio', icon: 'home', label: 'Inicio' },
  { id: 'agente', icon: 'brain', label: 'Agente' },
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
}
interface HomeRow { id: string; sym: string; name: string; price: number; chg: number }

export default function NovaDashboard() {
  const [view, setView] = useState<View>('inicio');
  const [orb, setOrb] = useState<OrbState>('standby');
  const [clock, setClock] = useState('--:--');
  const [stats, setStats] = useState<Stats | null>(null);
  const [top, setTop] = useState<HomeRow[]>([]);
  const [toast, setToast] = useState('');
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
      const [rs, rp] = await Promise.all([
        fetch('/api/stats', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/crypto/prices', { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (rs.ok) setStats(rs);
      if (rp.ok) {
        const rows: HomeRow[] = rp.rows || [];
        setTop([...rows].sort((a, b) => b.chg - a.chg).slice(0, 3));
      }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void loadStats(); const t = setInterval(() => void loadStats(), 60000); return () => clearInterval(t); }, [loadStats]);

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
              <div className="date">{dateLine.charAt(0).toUpperCase() + dateLine.slice(1)} · NOVA v006</div>
            </div>
            <div className="top-actions">
              <div className={`pill ${stats?.waMode === 'live' ? 'ok' : 'sim'}`}>
                {stats?.waMode === 'live' ? 'WhatsApp EN VIVO' : 'WhatsApp: simulador'}{stats && !stats.withinHours ? ' · fuera de horario' : ''}
              </div>
              <span className={`pill ${stats?.scheduler.running ? 'ok' : ''}`} style={{ display: stats?.scheduler.running ? undefined : 'none' }}>
                Planificador activo
              </span>
              <SwRegister />
            </div>
          </header>

          {/* ---------- INICIO ---------- */}
          {view === 'inicio' && (
            <section className="view active">
              <div className="grid">
                <article className="card hero">
                  <Hero state={orb} />
                  <div className="hero-footer">
                    <div className="mini">Anti-spam</div>
                    <div className="mini">Modo horario</div>
                    <div className="mini">Notas de voz</div>
                    <div className="mini">Imágenes IA</div>
                    <div className="mini">Divisas</div>
                    <div className="mini">Botones WA</div>
                  </div>
                </article>

                <article className="card">
                  <div className="cardhead"><h3>Agente hoy</h3><span className="muted">ÚLTIMAS 24 H</span></div>
                  <div className="stats">
                    <div className="stat"><label>Contactos</label><strong>{stats?.contacts ?? '—'}</strong></div>
                    <div className="stat"><label>Mensajes 24 h</label><strong>{stats?.msgs24h ?? '—'}</strong></div>
                    <div className="stat"><label>Alertas vivas</label><strong>{stats?.alertsActive ?? '—'}</strong></div>
                    <div className="stat"><label>Programados</label><strong>{stats?.jobsOn ?? '—'}</strong></div>
                  </div>
                </article>

                <article className="card">
                  <div className="cardhead"><h3>Cripto · portafolio</h3><span className={stats?.cryptoLive ? 'up' : 'muted'}>{stats?.cryptoLive ? '● EN VIVO' : '○ SIN DATOS'}</span></div>
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

                <article className="card">
                  <div className="cardhead"><h3>Datos y avisos</h3><span className="muted">TUS DATOS, TUS REGLAS</span></div>
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

                <article className="card">
                  <div className="cardhead"><h3>Protección del agente</h3><span className="muted">SIEMPRE ACTIVA</span></div>
                  <div className="panelbody">
                    <div className="metric"><span><i className="dotg" /> Anti-spam inteligente</span><b>{stats ? '20 msg/min máx.' : '—'}</b></div>
                    <div className="metric"><span><i className="doty" /> Modo horario</span><b>{stats ? (stats.withinHours ? 'En horario' : 'Fuera de horario') : '—'}</b></div>
                    <div className="metric"><span><i className="dotr" /> Escalado a humano</span><b>Aviso push + WhatsApp</b></div>
                    <div className="metric"><span><i className="dotb" /> Vía oficial de Meta</span><b>Sin riesgo de baneo</b></div>
                    <button className="button" style={{ width: '100%', marginTop: 10 }} onClick={() => setView('metrics')}>Ver métricas del agente</button>
                  </div>
                </article>

                <article className="card">
                  <div className="cardhead"><h3>Pruébalo ahora</h3><span className="muted">SIMULADOR EN VIVO</span></div>
                  <div className="panelbody">
                    <div className="row"><div className="thumb">🪙</div><div className="grow"><b>&quot;precio btc&quot;</b><small>Cotización real al instante</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">⏰</div><div className="grow"><b>&quot;alerta eth &gt;= 4000&quot;</b><small>Aviso por WhatsApp al cruzar</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">🎤</div><div className="grow"><b>Nota de voz</b><small>Transcripción con IA</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">💱</div><div className="grow"><b>&quot;100 usd a mxn&quot;</b><small>Conversor de divisas en vivo</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                    <div className="row"><div className="thumb">🔘</div><div className="grow"><b>Menú con botones</b><small>Escribe &quot;hola&quot; y NOVA despliega opciones</small></div><button className="button" onClick={() => setView('agente')}>Probar</button></div>
                  </div>
                </article>

                <article className="card wide">
                  <div className="cardhead"><h3>Flujo del agente</h3><span className="muted">LOOP NOVA · WHATSAPP</span></div>
                  <div className="panelbody">
                    <div className="muted flowline" style={{ lineHeight: 1.9, fontSize: 11 }}>
                      <b>01</b> El usuario escribe por WhatsApp → <b>02</b> Webhook oficial (Cloud API) → <b>03</b> Anti-spam + horario → <b>04</b> Detecta el tipo (texto · voz · imagen) → <b>05</b> Intención: cripto · alerta · recordatorio · humano → <b>06</b> IA conversacional → <b>07</b> Responde gratis por WhatsApp → <b>08</b> Todo queda registrado y exportable aquí.
                    </div>
                  </div>
                </article>
              </div>
            </section>
          )}

          {view === 'agente' && <AgentView onState={setOrb} />}
          {view === 'convos' && <ConvosView />}
          {view === 'criptos' && <CriptoView />}
          {view === 'metrics' && <MetricsView />}
          {view === 'sched' && <SchedView />}
          {view === 'ajustes' && <SettingsView />}

          <div className="footerbrand">
            <div className="fbrand">
              <div className="orbmini" />
              <div><b style={{ letterSpacing: 3 }}>NOVA</b><br />Agente WhatsApp + Cripto · PWA v006</div>
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
