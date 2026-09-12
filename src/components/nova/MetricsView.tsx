'use client';

/* NOVA v004 — Métricas del agente: actividad diaria, intenciones top,
   tiempo de respuesta y contactos activos. */
import { useCallback, useEffect, useState } from 'react';
import { CsvButton } from './ui';

interface Metrics {
  serie: { day: string; user: number; agent: number }[];
  intents: { intent: string; label: string; count: number }[];
  avgLatencyMs: number;
  latencySamples: number;
  activeToday: number;
  active7: number;
  escalados7: number;
  totalContacts: number;
  byChannel: { channel: string; count: number }[];
  paused: number;
}

export function MetricsView() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/metrics', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) { setM(d); setErr(''); } else setErr('No se pudieron cargar las métricas.');
    } catch { setErr('No se pudo conectar con el servidor de métricas.'); }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30000);
    return () => clearInterval(t);
  }, [load]);

  const maxDay = m ? Math.max(1, ...m.serie.map(d => d.user + d.agent)) : 1;
  const maxIntent = m ? Math.max(1, ...m.intents.map(i => i.count)) : 1;
  const total7 = m ? m.serie.slice(-7).reduce((a, d) => a + d.user + d.agent, 0) : 0;
  const lat = m && m.avgLatencyMs > 0
    ? m.avgLatencyMs < 1000 ? `${m.avgLatencyMs} ms` : `${(m.avgLatencyMs / 1000).toFixed(1)} s`
    : '—';

  return (
    <section className="view active" id="view-metrics">
      <div className="viewhead">
        <h2>Métricas del agente</h2>
        <p>Cómo está trabajando NOVA: actividad de los últimos 14 días, intenciones más usadas, tiempo de respuesta y escalados a humano.</p>
      </div>
      {err && <article className="card"><div className="empty">⚠ {err}</div></article>}
      {!m && !err && <article className="card"><div className="empty">Consultando métricas…</div></article>}
      {m && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <article className="card">
            <div className="cardhead"><h3>Resumen 7 días</h3><span className="muted">AUTOMÁTICO</span></div>
            <div className="stats">
              <div className="stat"><label>Mensajes 7 d</label><strong>{total7}</strong></div>
              <div className="stat"><label>Activos hoy</label><strong>{m.activeToday}</strong></div>
              <div className="stat"><label>Tiempo respuesta</label><strong>{lat}</strong></div>
              <div className="stat"><label>Escalados 7 d</label><strong>{m.escalados7}</strong></div>
            </div>
            <div className="panelbody" style={{ paddingTop: 4 }}>
              <div className="metric"><span>👥 Contactos totales</span><b>{m.totalContacts}</b></div>
              <div className="metric"><span>📅 Activos últimos 7 d</span><b>{m.active7}</b></div>
              <div className="metric"><span>👤 Conversaciones en modo humano</span><b>{m.paused}</b></div>
              {m.byChannel.map(c => (
                <div className="metric" key={c.channel}><span>{c.channel === 'whatsapp' ? '✆ Canal WhatsApp' : '◇ Canal simulador'}</span><b>{c.count}</b></div>
              ))}
            </div>
          </article>

          <article className="card">
            <div className="cardhead"><h3>Actividad · 14 días</h3><span className="muted">USUARIO vs NOVA</span><CsvButton what="metricas" title="Exportar actividad a CSV" /></div>
            <div className="panelbody">
              <div className="barchart" role="img" aria-label="Mensajes por día de los últimos 14 días">
                {m.serie.map(d => {
                  const tot = d.user + d.agent;
                  const uh = tot ? (d.user / maxDay) * 100 : 0;
                  const ah = tot ? (d.agent / maxDay) * 100 : 0;
                  return (
                    <div className="barcol" key={d.day} title={`${d.day}: ${d.user} usuario · ${d.agent} NOVA`}>
                      <div className="bars">
                        <div className="baruser" style={{ height: `${uh}%` }} />
                        <div className="baragent" style={{ height: `${ah}%` }} />
                      </div>
                      <small>{d.day.slice(8)}</small>
                    </div>
                  );
                })}
              </div>
              <div className="legendrow">
                <span><i className="dot dotuser" /> Usuario</span>
                <span><i className="dot dotagent" /> NOVA</span>
              </div>
            </div>
          </article>

          <article className="card">
            <div className="cardhead"><h3>Intenciones más usadas</h3><span className="muted">ÚLTIMOS 7 DÍAS</span><CsvButton what="intenciones" title="Exportar intenciones a CSV" /></div>
            <div className="panelbody">
              {m.intents.length ? m.intents.map(i => (
                <div className="intentrow" key={i.intent}>
                  <span className="intentlabel">{i.label}</span>
                  <div className="intentbar"><div style={{ width: `${(i.count / maxIntent) * 100}%` }} /></div>
                  <b>{i.count}</b>
                </div>
              )) : <div className="empty">Aún no hay intenciones registradas. Habla con el agente y aparecerán aquí.</div>}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
