'use client';

/* NOVA v006 — utilidades visuales compartidas + descarga CSV */
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export interface CoinRow {
  id: string; sym: string; name: string; price: number; chg: number;
  spark: number[]; cap: number;
}

export const PALETTE = ['#f7931a', '#627eea', '#9945ff', '#2a5ada', '#c2a633', '#e6007a', '#26a17b', '#8247e5', '#edc716', '#0ea5e9', '#f43f5e', '#22c55e', '#a855f7', '#f97316', '#14b8a6', '#eab308'];

export function coinColor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export function CoinAvatar({ id, sym }: { id: string; sym?: string }) {
  const s = sym || id.slice(0, 3).toUpperCase();
  const glyph = s === 'BTC' ? '₿' : s === 'ETH' ? 'Ξ' : s.slice(0, 3);
  return <div className="coinav" style={{ background: coinColor(id) }}>{glyph}</div>;
}

export function money(n: number): string {
  const v = Number(n) || 0;
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 2 });
}
export function money2(n: number): string {
  const v = Number(n) || 0;
  const dec = v !== 0 && Math.abs(v) < 0.01 ? 6 : Math.abs(v) < 1 ? 4 : 2;
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtAmt(n: number): string {
  const v = Number(n) || 0;
  if (v === 0) return '0';
  if (Math.abs(v) >= 1000) return v.toLocaleString('es-MX', { maximumFractionDigits: 0 });
  return String(+v.toFixed(6));
}
export function fmtAge(ts: number | string): string {
  const m = Math.max(1, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return `hace ${h} h`;
}
export function fmtClock(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* v006 — Descarga un CSV del servidor (compatible con Excel: BOM + ; + CRLF) */
export async function downloadCsv(what: string, label?: string): Promise<void> {
  try {
    const r = await fetch(`/api/export?what=${encodeURIComponent(what)}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('export');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nova-${what}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    if (label) console.log(`CSV ${label} descargado`);
  } catch { /* silencioso */ }
}

/* v006 — Botón pequeño de exportación para las cabeceras de tarjeta */
export function CsvButton({ what, title = 'Exportar CSV' }: { what: string; title?: string }) {
  return (
    <button className="csvbtn" onClick={() => void downloadCsv(what)} title={title} aria-label={title}>
      <Icon name="download" size={12} /> CSV
    </button>
  );
}

export function Spark({ points, up }: { points: number[]; up: boolean }) {
  if (!points || points.length < 2) return <span className="muted">—</span>;
  const w = 92, h = 26;
  const min = Math.min(...points), max = Math.max(...points), span = (max - min) || 1;
  const step = w / (points.length - 1);
  const pts = points.map((p, i) => `${(i * step).toFixed(1)},${(h - 3 - ((p - min) / span) * (h - 6)).toFixed(1)}`).join(' ');
  const color = up ? '#48e0a1' : '#ff6b86';
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} style={{ stroke: color }} />
    </svg>
  );
}

export function Bubble({ role, body, meta, ts }: { role: string; body: string; meta?: ReactNode; ts?: string }) {
  const cls = role === 'user' ? 'bubble user' : role === 'owner' ? 'bubble owner' : role === 'agent' ? 'bubble nova' : 'bubble system';
  return (
    <div className={cls}>
      {meta}
      {body}
      {ts ? <span className="ts">{ts}</span> : null}
    </div>
  );
}

/* v004 — Etiquetas de un mensaje interactivo del agente (botones/lista de WhatsApp).
   onCmd: opcional; si se pasa, las etiquetas se pueden pulsar (simulador). */
export function AgentButtons({ botones, lista, onCmd }: {
  botones?: { id: string; title: string }[];
  lista?: { title: string; rows: { id: string; title: string; description?: string }[] };
  onCmd?: (cmd: string) => void;
}) {
  if (!botones?.length && !lista?.rows?.length) return null;
  const fromId = (id: string) => id.startsWith('cmd|') ? id.slice(4) : '';
  return (
    <div className="agentbtns" aria-label="Opciones interactivas de WhatsApp">
      {lista?.rows?.length ? (
        <div className="menulist">
          <span className="menulabel">☰ {lista.title}</span>
          <div className="menurows">
            {lista.rows.slice(0, 10).map(r => (
              onCmd
                ? <button key={r.id} className="menurow" onClick={() => onCmd(fromId(r.id))} title={r.description || ''}>{r.title}<small>{r.description || ''}</small></button>
                : <div key={r.id} className="menurow static" title={r.description || ''}>{r.title}<small>{r.description || ''}</small></div>
            ))}
          </div>
        </div>
      ) : null}
      {botones?.length ? (
        <div className="btnrow">
          {botones.slice(0, 3).map(b => (
            onCmd
              ? <button key={b.id} className="quickbtn" onClick={() => onCmd(fromId(b.id))}>{b.title}</button>
              : <span key={b.id} className="quickbtn static">{b.title}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
