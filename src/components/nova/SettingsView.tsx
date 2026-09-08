'use client';

/* NOVA v006 — Ajustes del agente + conexión WhatsApp Cloud API + avisos push */
import { useCallback, useEffect, useState } from 'react';
import { PushBell } from './SwRegister';
import { Icon } from './Icon';

interface Settings {
  persona: string; mode247: boolean; startHour: number; endHour: number;
  maxMsgsPerMin: number; ownerWa: string; aiEnabled: boolean;
  dailySummaryOn: boolean; dailySummaryHour: number;
  waToken: string; waPhoneId: string; waVerifyToken: string;
}
interface Status {
  mode: string; tokenSet: boolean; phoneIdSet: boolean; verifyToken: string;
  scheduler: { running: boolean; mode: string };
}

export function SettingsView() {
  const [s, setS] = useState<Settings | null>(null);
  const [st, setSt] = useState<Status | null>(null);
  const [saved, setSaved] = useState('');
  const [origin, setOrigin] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      const d = await r.json();
      if (d.ok) { setS(d.settings); setSt(d.status); }
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void load(); setOrigin(window.location.origin); }, [load]);

  const put = async (patch: Partial<Settings>) => {
    if (s) setS({ ...s, ...patch });
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    setSaved('Ajustes guardados ✓');
    setTimeout(() => setSaved(''), 2500);
    void load();
  };

  if (!s) return <div className="empty">Cargando ajustes…</div>;

  return (
    <section className="view active" id="view-ajustes">
      <div className="viewhead">
        <h2>Ajustes del agente</h2>
        <p>Conecta WhatsApp por la vía oficial (Cloud API de Meta): gratis para responder a tus usuarios y sin riesgo de baneo.</p>
      </div>

      <article className="card">
        <div className="cardhead">
          <h3>Conexión WhatsApp (oficial · Cloud API)</h3>
          {st?.mode === 'live' ? <span className="tag">● EN VIVO</span> : <span className="tag yellow">● MODO SIMULADOR</span>}
        </div>
        <div className="panelbody">
          <div className="formgrid">
            <div className="field"><label>Token de acceso (Meta · permanente)</label>
              <input value={s.waToken} onChange={e => setS({ ...s, waToken: e.target.value })} placeholder="EAAG…" type="password" /></div>
            <div className="field"><label>Phone Number ID</label>
              <input value={s.waPhoneId} onChange={e => setS({ ...s, waPhoneId: e.target.value })} placeholder="1234567890" /></div>
            <div className="field"><label>Verify token (para el webhook)</label>
              <input value={s.waVerifyToken} onChange={e => setS({ ...s, waVerifyToken: e.target.value })} /></div>
            <div className="field"><label>Número del dueño (formato internacional, ej. 5215500000000)</label>
              <input value={s.ownerWa} onChange={e => setS({ ...s, ownerWa: e.target.value })} placeholder="521…" /></div>
          </div>
          <button className="button green" style={{ width: '100%' }} onClick={() => void put(s)}>Guardar credenciales</button>
          {saved && <div style={{ marginTop: 8 }}><span className="tag">{saved}</span></div>}

          <div style={{ marginTop: 14, padding: '12px 14px', border: '1px solid rgba(95,168,255,.18)', borderRadius: 13, background: 'rgba(5,15,29,.55)', fontSize: 11, lineHeight: 1.8 }}>
            <b style={{ fontSize: 12 }}>Cómo activar el modo en vivo (gratis, sin riesgo):</b><br />
            1. Crea una app gratuita en <b>developers.facebook.com</b> → producto <b>WhatsApp</b>.<br />
            2. Copia el <b>Token de acceso</b> y el <b>Phone Number ID</b> y pégalo arriba.<br />
            3. En Meta → Configuración → Webhook, usa estos datos:<br />
            &nbsp;&nbsp;• URL del callback: <code style={{ color: '#5bdcff' }}>{origin ? `${origin}/api/webhook/whatsapp` : '(este dominio)/api/webhook/whatsapp'}</code><br />
            &nbsp;&nbsp;• Verify token: <code style={{ color: '#5bdcff' }}>{st?.verifyToken || 'nova-verify'}</code><br />
            4. Suscríbete al campo <b>messages</b>. Listo: NOVA responde sola a tus usuarios.<br />
            <span className="muted">Responder a usuarios que escriben primero es 100% gratis (mensajes de servicio). Cero riesgo de baneo: es la vía oficial.</span>
          </div>
        </div>
      </article>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <article className="card">
          <div className="cardhead"><h3>Notificaciones push</h3><span className="muted">WEB PUSH · SIN SERVICIOS EXTERNOS</span></div>
          <div className="panelbody">
            <p className="muted" style={{ margin: '0 0 10px', lineHeight: 1.6 }}>
              <Icon name="bell" size={12} style={{ verticalAlign: '-2px' }} /> Recibe un aviso instantáneo en este dispositivo cuando un contacto pida hablar con un humano, aunque el panel esté cerrado o en segundo plano.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <PushBell />
              <button
                className="button"
                onClick={async () => { await fetch('/api/push/test', { method: 'POST' }); }}
                title="Envía una notificación de prueba a este dispositivo"
              >Probar aviso</button>
            </div>
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 10 }}>
              Funciona con el navegador instalado como app (PWA) o abierto en una pestaña. Los avisos viajan cifrados vía Web Push estándar.
            </p>
          </div>
        </article>
        <article className="card">
          <div className="cardhead"><h3>Comportamiento</h3></div>
          <div className="panelbody">
            <div className="field"><label>Personalidad</label>
              <select value={s.persona} onChange={e => void put({ persona: e.target.value })}>
                <option value="profesional">Profesional · directa</option>
                <option value="casual">Casual · cercana</option>
                <option value="creativa">Creativa · inspiradora</option>
                <option value="tecnica">Técnica · precisa</option>
              </select></div>
            <div className="metric"><span>Modo 24/7</span>
              <span className={`switch${s.mode247 ? ' on' : ''}`} onClick={() => void put({ mode247: !s.mode247 })} /></div>
            <div className="metric"><span>Respuestas con IA (GLM)</span>
              <span className={`switch${s.aiEnabled ? ' on' : ''}`} onClick={() => void put({ aiEnabled: !s.aiEnabled })} /></div>
          </div>
        </article>
        <article className="card">
          <div className="cardhead"><h3>Horario y anti-spam</h3><span className="muted">{st?.scheduler.running ? 'PLANIFICADOR ACTIVO' : 'INICIANDO…'}</span></div>
          <div className="panelbody">
            <div className="formgrid">
              <div className="field"><label>Hora apertura</label>
                <select value={s.startHour} onChange={e => void put({ startHour: parseInt(e.target.value, 10) })}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}
                </select></div>
              <div className="field"><label>Hora cierre</label>
                <select value={s.endHour} onChange={e => void put({ endHour: parseInt(e.target.value, 10) })}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>)}
                </select></div>
            </div>
            <div className="field"><label>Máximo de mensajes por usuario / minuto (anti-spam): {s.maxMsgsPerMin}</label>
              <input type="range" min={5} max={60} value={s.maxMsgsPerMin} onChange={e => setS({ ...s, maxMsgsPerMin: parseInt(e.target.value, 10) })} onMouseUp={() => void put({ maxMsgsPerMin: s.maxMsgsPerMin })} onTouchEnd={() => void put({ maxMsgsPerMin: s.maxMsgsPerMin })} /></div>
            <p className="muted" style={{ margin: 0 }}>Fuera del horario, el agente guarda los mensajes y avisa una vez por hora.</p>
          </div>
        </article>
      </div>
    </section>
  );
}
