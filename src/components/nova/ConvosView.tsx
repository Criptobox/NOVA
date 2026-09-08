'use client';

/* NOVA v004 — Conversaciones reales del agente (WhatsApp + simulador).
   NUEVO: el dueño responde como humano desde aquí y puede pausar/reactivar
   el bot por contacto. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentButtons, Bubble, CsvButton, fmtClock } from './ui';

interface Contact {
  id: string; waId: string; name: string; channel: string; lastSeen: string; botPaused: boolean;
  lastMessage: { body: string; role: string; kind: string; createdAt: string } | null;
}
interface Msg {
  id: string; role: string; kind: string; body: string; meta: string | null; createdAt: string;
}
interface InterMeta {
  botones?: { id: string; title: string }[];
  lista?: { title: string; rows: { id: string; title: string; description?: string }[] };
  transcripcion?: string;
}

export function ConvosView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [sel, setSel] = useState<Contact | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/contacts', { cache: 'no-store' });
      const d = await r.json();
      setContacts(d.contacts || []);
      setSel(prev => (d.contacts || []).find((c: Contact) => c.id === prev?.id) || (d.contacts || [])[0] || null);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void load(); const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  useEffect(() => {
    if (!sel) return;
    let alive = true;
    const loadMsgs = async () => {
      try {
        const r = await fetch(`/api/messages?contactId=${sel.id}`, { cache: 'no-store' });
        const d = await r.json();
        if (alive) setMsgs(d.messages || []);
      } catch { /* silencioso */ }
    };
    void loadMsgs();
    const t = setInterval(loadMsgs, 8000);
    return () => { alive = false; clearInterval(t); };
  }, [sel]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  /* v004 — Responder como humano (rol "owner") */
  const sendAsOwner = useCallback(async () => {
    const t = draft.trim();
    if (!t || !sel || sending) return;
    setSending(true);
    setDraft('');
    try {
      await fetch('/api/human-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: sel.id, text: t }),
      });
      const r = await fetch(`/api/messages?contactId=${sel.id}`, { cache: 'no-store' });
      const d = await r.json();
      setMsgs(d.messages || []);
      void load();
    } catch { setDraft(t); }
    finally { setSending(false); }
  }, [draft, sel, sending, load]);

  /* v004 — Pausar / reactivar el bot para este contacto */
  const toggleBot = useCallback(async () => {
    if (!sel || toggling) return;
    setToggling(true);
    try {
      await fetch('/api/contacts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sel.id, botPaused: !sel.botPaused }),
      });
      void load();
    } catch { /* silencioso */ }
    finally { setToggling(false); }
  }, [sel, toggling, load]);

  return (
    <section className="view active" id="view-convos">
      <div className="viewhead">
        <h2>Conversaciones</h2>
        <p>Todas las conversaciones del agente por WhatsApp y simulador. Escribe abajo para responder tú mismo como humano — el bot queda en pausa para ese contacto hasta que lo reactives.</p>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        <article className="card">
          <div className="cardhead"><h3>Contactos ({contacts.length})</h3><span className="muted">{contacts.filter(c => c.channel === 'whatsapp').length} WHATSAPP</span><CsvButton what="conversaciones" title="Exportar conversaciones a CSV" /></div>
          <div className="list" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            {contacts.length ? contacts.map(c => (
              <div key={c.id} className="row" onClick={() => setSel(c)} style={{ cursor: 'pointer', background: sel?.id === c.id ? 'rgba(40,113,220,.14)' : 'transparent', borderRadius: 10 }}>
                <div className="thumb">{c.channel === 'simulador' ? '◇' : '✆'}</div>
                <div className="grow">
                  <b>{c.name}{c.botPaused ? ' · 👤' : ''}</b>
                  <small>{c.lastMessage ? `${c.lastMessage.role === 'user' ? '' : c.lastMessage.role === 'owner' ? 'TÚ: ' : 'NOVA: '}${c.lastMessage.body.slice(0, 42)}` : 'sin mensajes'}</small>
                </div>
                {c.botPaused ? <span className="tag yellow">HUMANO</span> : null}
                <span className={`tag ${c.channel === 'whatsapp' ? '' : 'blue'}`}>{c.channel === 'whatsapp' ? 'WA' : 'SIM'}</span>
              </div>
            )) : <div className="empty"><span className="big">✆</span>Aún no hay conversaciones. Escribe al agente en el simulador.</div>}
          </div>
        </article>
        <article className="card">
          <div className="cardhead">
            <h3>{sel ? sel.name : 'Elige una conversación'}</h3>
            {sel && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className="muted">{sel.waId}</span>
                {sel.botPaused
                  ? <button className="chip" onClick={toggleBot} disabled={toggling}>🤖 Reactivar bot</button>
                  : <button className="chip" onClick={toggleBot} disabled={toggling}>👤 Tomar como humano</button>}
              </div>
            )}
          </div>
          <div className="conversation" style={{ maxHeight: '52vh', overflowY: 'auto' }} ref={logRef}>
            {sel && msgs.map(m => {
              let meta: React.ReactNode = null;
              let inter: InterMeta | null = null;
              try {
                const mm: InterMeta = m.meta ? JSON.parse(m.meta) : null;
                if (mm?.transcripcion) meta = <small style={{ display: 'block', opacity: .8, marginBottom: 4 }}>🎤 transcripción: “{mm.transcripcion}”</small>;
                if (mm?.botones?.length || mm?.lista?.rows?.length) inter = mm;
              } catch { /* sin meta */ }
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : m.role === 'owner' ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                  <Bubble
                    role={m.role}
                    body={m.body}
                    meta={meta}
                    ts={fmtClock(m.createdAt)}
                  />
                  {m.role === 'agent' && inter && <AgentButtons botones={inter.botones} lista={inter.lista} />}
                </div>
              );
            })}
            {sel && !msgs.length && <div className="empty">Sin mensajes todavía.</div>}
            {!sel && <div className="empty"><span className="big">◉</span>Selecciona un contacto para ver la conversación.</div>}
          </div>
          {sel && (
            <div className="humanbar" style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
              <div className="muted" style={{ fontSize: 9, marginBottom: 6 }}>
                {sel.botPaused
                  ? '👤 Modo humano activo — tus mensajes salen como Dueño. Escribe "continuar" desde el chat del usuario o pulsa "Reactivar bot" para devolver el control a NOVA.'
                  : '💬 Responde como dueño (saldrá con tu sello TÚ). Al enviar, el bot se pausa para este contacto.'}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void sendAsOwner(); }}
                  placeholder="Escribe tu respuesta como humano…"
                  aria-label="Responder como dueño"
                  disabled={sending}
                  style={{ flex: 1 }}
                />
                <button className="button" onClick={() => void sendAsOwner()} disabled={sending || !draft.trim()}>
                  {sending ? 'Enviando…' : 'Responder'}
                </button>
              </div>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
