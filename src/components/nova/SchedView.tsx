'use client';

/* NOVA v003 — Mensajes programados: recordatorios + resumen diario */
import { useCallback, useEffect, useState } from 'react';
import { fmtClock } from './ui';

interface Job {
  id: string; kind: string; label: string; body: string; target: string;
  when: string; repeat: string; lastRun: string | null; on: boolean; createdAt: string;
}

export function SchedView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [repeat, setRepeat] = useState('none');
  const [target, setTarget] = useState('owner');
  const [summaryOn, setSummaryOn] = useState(false);
  const [summaryHour, setSummaryHour] = useState(9);
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const [rj, rs] = await Promise.all([
        fetch('/api/scheduled', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/settings', { cache: 'no-store' }).then(r => r.json()),
      ]);
      if (rj.ok) setJobs(rj.jobs || []);
      if (rs.ok) { setSummaryOn(rs.settings.dailySummaryOn); setSummaryHour(rs.settings.dailySummaryHour); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const addJob = async () => {
    if (!label.trim() || !time) return;
    const when = new Date(time);
    await fetch('/api/scheduled', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'reminder', label: label.trim(), when: when.toISOString(), repeat, target }),
    });
    setLabel(''); setTime('');
    void load();
  };
  const toggle = async (j: Job) => {
    await fetch('/api/scheduled', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: j.id, on: !j.on }) });
    void load();
  };
  const del = async (id: string) => {
    await fetch(`/api/scheduled?id=${id}`, { method: 'DELETE' });
    void load();
  };
  const saveSummary = async (on: boolean, hour: number) => {
    setSummaryOn(on); setSummaryHour(hour);
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dailySummaryOn: on, dailySummaryHour: hour }) });
    setSaved('Resumen diario actualizado ✓');
    setTimeout(() => setSaved(''), 2500);
    void load();
  };

  return (
    <section className="view active" id="view-sched">
      <div className="viewhead">
        <h2>Mensajes programados</h2>
        <p>El planificador interno corre cada 60 s: entrega recordatorios, el resumen diario de cripto y vigila las alertas de precio.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr' }}>
        <article className="card">
          <div className="cardhead"><h3>Programados ({jobs.filter(j => j.on).length} activos)</h3><span className="muted">PLANIFICADOR 60s</span></div>
          <div className="list" style={{ maxHeight: '54vh', overflowY: 'auto' }}>
            {jobs.length ? jobs.map(j => (
              <div className="alertrow" key={j.id}>
                <div className="thumb">{j.kind === 'summary' ? '🌅' : '⏰'}</div>
                <div className="grow">
                  <b>{j.label}</b>
                  <small>
                    {j.repeat === 'daily' ? 'todos los días' : new Date(j.when).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtClock(j.when)} · a {j.target === 'owner' ? 'dueño' : j.target}
                    {j.lastRun ? ` · última vez ${fmtClock(j.lastRun)}` : ''}
                  </small>
                </div>
                <span className={`tag ${j.on ? (j.kind === 'summary' ? 'blue' : '') : 'yellow'}`}>{j.on ? 'ACTIVO' : 'PAUSADO'}</span>
                <span className="switch on" style={{ opacity: j.on ? 1 : .5 }} onClick={() => void toggle(j)} />
                <button className="button danger" onClick={() => void del(j.id)}>×</button>
              </div>
            )) : <div className="empty"><span className="big">↻</span>Sin mensajes programados. Crea recordatorios abajo o pídeselos al agente por WhatsApp.</div>}
          </div>
        </article>
        <div>
          <article className="card">
            <div className="cardhead"><h3>Nuevo recordatorio</h3></div>
            <div className="panelbody">
              <div className="field"><label>Qué recordar</label>
                <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Llamar a Ana" /></div>
              <div className="field"><label>Cuándo</label>
                <input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></div>
              <div className="formgrid">
                <div className="field"><label>Repetir</label>
                  <select value={repeat} onChange={e => setRepeat(e.target.value)}>
                    <option value="none">Una vez</option>
                    <option value="daily">Todos los días</option>
                  </select></div>
                <div className="field"><label>Destino</label>
                  <select value={target} onChange={e => setTarget(e.target.value)}>
                    <option value="owner">Dueño</option>
                  </select></div>
              </div>
              <button className="button green" style={{ width: '100%' }} onClick={() => void addJob()}>＋ Programar</button>
              <p className="muted" style={{ margin: '8px 0 0' }}>Consejo: también puedes crearlos por WhatsApp diciendo “recordar X a las 15:00”.</p>
            </div>
          </article>
          <article className="card" style={{ marginTop: 12 }}>
            <div className="cardhead"><h3>Resumen diario de cripto</h3><span className="muted">DIFUSIÓN</span></div>
            <div className="panelbody">
              <div className="metric">
                <span>Enviar cada día a los contactos de WhatsApp</span>
                <span className={`switch${summaryOn ? ' on' : ''}`} onClick={() => void saveSummary(!summaryOn, summaryHour)} />
              </div>
              <div className="field">
                <label>Hora del envío</label>
                <select value={summaryHour} onChange={e => void saveSummary(summaryOn, parseInt(e.target.value, 10))}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}
                </select>
              </div>
              {saved && <span className="tag">{saved}</span>}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
