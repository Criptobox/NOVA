'use client';

/* NOVA v005 — Simulador del agente: habla con NOVA por el motor real.
   Renderiza también los menús con botones/listas como en WhatsApp real.
   v005: dictado continuo que NO se apaga solo (auto-reinicio) y
   envía cada frase final como comando — modo despierta-por-voz. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentButtons, Bubble, fmtClock } from './ui';
import type { OrbState } from './Brain';

interface Msg {
  id: string; role: string; kind: string; body: string; meta: string | null; createdAt: string;
}

const CHIPS = [
  ['hola', '👋 Saludar (menú)'],
  ['stock bajo', '📦 Stock bajo tienda'],
  ['reponer 10 batería must', '📥 Reponer stock'],
  ['venta de 2 batería a 300', '💰 Registrar venta'],
  ['precio btc', '🪙 Precio BTC'],
  ['100 usd a mxn', '💱 100 USD → MXN'],
  ['50 eur a cop', '💱 50 EUR → COP'],
  ['top 10', '🏆 Top del día'],
  ['portafolio', '💼 Portafolio'],
  ['alerta eth >= 4000', '⏰ Crear alerta'],
  ['alertas', '👁 Ver alertas'],
  ['recordar llamar a Ana a las 15:00', '⏰ Recordatorio'],
  ['resumen cripto', '🌅 Resumen'],
  ['cuéntame un chiste', '😄 Chiste'],
  ['humano', '👤 Hablar con humano'],
  ['ayuda', '🤖 Ayuda'],
];

interface InterMeta { botones?: { id: string; title: string }[]; lista?: { title: string; rows: { id: string; title: string; description?: string }[] }; transcripcion?: string }

/* Tipos mínimos del reconocimiento de voz del navegador */
interface SRResultItem { isFinal: boolean; 0: { transcript: string } }
interface SREvent { resultIndex: number; results: { length: number } & Record<number, SRResultItem> }
interface SRInstance {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
}
type SRCtor = new () => SRInstance;

export function AgentView({ onState }: { onState: (s: OrbState) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [micOn, setMicOn] = useState(false);       // v005: dictado continuo activo
  const [noteRec, setNoteRec] = useState(false);   // nota de voz grabando
  const [err, setErr] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recogRef = useRef<SRInstance | null>(null);
  const micOnRef = useRef(false);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/contacts', { cache: 'no-store' });
      const d = await r.json();
      const sim = (d.contacts || []).find((c: { waId: string }) => c.waId === 'sim-user-1');
      if (!sim) return;
      const r2 = await fetch(`/api/messages?contactId=${sim.id}`, { cache: 'no-store' });
      const d2 = await r2.json();
      setMsgs(d2.messages || []);
    } catch { /* silencioso */ }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  const send = useCallback(async (payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true); setErr('');
    onState('pensando');
    try {
      const r = await fetch('/api/bot/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!d.ok) setErr(d.error || 'Error del motor');
      onState(d.ok ? 'hablando' : 'standby');
      await refresh();
    } catch {
      setErr('No se pudo conectar con el motor del agente.');
      onState('standby');
    } finally {
      setBusy(false);
      // v005: si el dictado sigue activo, la esfera vuelve a “escuchando”
      setTimeout(() => onState(micOnRef.current ? 'escuchando' : 'standby'), 2600);
    }
  }, [busy, onState, refresh]);

  const sendText = useCallback(() => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    void send({ text: t });
  }, [text, busy, send]);

  /* ---------- v005: DICTADO CONTINUO (no se apaga solo) ----------
     · continuous + interimResults: escucha frases largas sin cortarse
     · onend → se reinicia solo mientras esté activado (silencios, pausas)
     · cada frase final se envía como comando automáticamente
     · el texto parcial se muestra en vivo en el campo de escribir */
  const stopMic = useCallback(() => {
    micOnRef.current = false;
    setMicOn(false);
    if (restartRef.current) { clearTimeout(restartRef.current); restartRef.current = null; }
    try { recogRef.current?.stop(); } catch { /* ya estaba parado */ }
    recogRef.current = null;
    onState('standby');
  }, [onState]);

  const startMic = useCallback(() => {
    if (micOnRef.current) return;
    if (noteRec) { setErr('Termina la nota de voz primero.'); return; }
    const w = window as unknown as { webkitSpeechRecognition?: SRCtor; SpeechRecognition?: SRCtor };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { setErr('Tu navegador no soporta dictado continuo. Usa Chrome o Edge, o envía una nota de voz con 🎤.'); return; }
    let rec: SRInstance;
    try { rec = new SR(); } catch { setErr('No se pudo iniciar el micrófono.'); return; }
    rec.lang = 'es-MX';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const t = (res[0]?.transcript || '').trim();
        if (res.isFinal) {
          if (t) void send({ text: t }); // frase final → comando automático
        } else {
          interim += t + ' ';
        }
      }
      setText(interim); // vista previa en vivo (queda limpia al enviar)
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        setErr('Permiso de micrófono denegado. Actívalo en tu navegador.');
        micOnRef.current = false;
        setMicOn(false);
        onState('standby');
      }
      /* no-speech / network / aborted → onend reintenta solo */
    };
    rec.onend = () => {
      if (micOnRef.current) {
        // ★ clave v005: el navegador corta tras el silencio → aquí se reactiva
        if (restartRef.current) clearTimeout(restartRef.current);
        restartRef.current = setTimeout(() => {
          if (!micOnRef.current) return;
          try { rec.start(); } catch { /* carrera start/end: el próximo onend reintenta */ }
        }, 350);
      }
    };
    recogRef.current = rec;
    micOnRef.current = true;
    setMicOn(true);
    setErr('');
    onState('escuchando');
    try { rec.start(); } catch { /* ya iniciado */ }
  }, [noteRec, send, onState]);

  /* Al salir de la vista se apaga todo */
  useEffect(() => () => {
    micOnRef.current = false;
    if (restartRef.current) clearTimeout(restartRef.current);
    try { recogRef.current?.stop(); } catch { /* noop */ }
    try { mediaRef.current?.stop(); } catch { /* noop */ }
  }, []);

  /* Grabar nota de voz real → ASR en el servidor */
  const toggleVoiceNote = useCallback(async () => {
    if (noteRec) {
      mediaRef.current?.stop();
      return;
    }
    if (micOnRef.current) stopMic(); // el dictado y la grabación no pueden pelearse por el micro
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        setNoteRec(false);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        const buf = await blob.arrayBuffer();
        let binary = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = `data:audio/webm;base64,${btoa(binary)}`;
        void send({ kind: 'audio', audioBase64: b64 });
      };
      mediaRef.current = rec;
      setNoteRec(true);
      onState('escuchando');
      rec.start();
      setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, 12000);
    } catch {
      setErr('No se pudo acceder al micrófono.');
      onState('standby');
    }
  }, [noteRec, send, onState, stopMic]);

  /* Imagen → VLM en el servidor */
  const onImage = useCallback(async (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => void send({ kind: 'image', imageUrl: String(reader.result) });
    reader.readAsDataURL(f);
  }, [send]);

  return (
    <section className="view active" id="view-agente">
      <div className="viewhead">
        <h2>Agente NOVA · simulador</h2>
        <p>Habla con el agente igual que un usuario de WhatsApp. Usa el mismo motor que el webhook real: cripto, alertas, recordatorios, voz e imágenes. Con 🎙 activas el dictado continuo: sigue escuchando y envía cada frase como comando.</p>
      </div>
      <article className="card">
        <div className="cardhead">
          <h3>Chat con NOVA</h3>
          <span className="muted">{busy ? 'PROCESANDO…' : 'MOTOR EN VIVO'}</span>
        </div>
        <div className="chatwrap">
          <div className="chatlog" ref={logRef}>
            {msgs.length === 0 && (
              <div className="empty">
                <span className="big">◇</span>
                Todavía no hay mensajes. Escribe algo o toca un comando de abajo para probar al agente.
              </div>
            )}
            {msgs.map(m => {
              let meta: React.ReactNode = null;
              let inter: InterMeta | null = null;
              try {
                const mm: InterMeta = m.meta ? JSON.parse(m.meta) : null;
                if (mm?.transcripcion) meta = <small style={{ display: 'block', opacity: .8, marginBottom: 4 }}>🎤 transcripción: “{mm.transcripcion}”</small>;
                if (mm?.botones?.length || mm?.lista?.rows?.length) inter = mm;
              } catch { /* sin meta */ }
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '100%' }}>
                  <Bubble
                    role={m.role}
                    body={m.body}
                    meta={meta}
                    ts={fmtClock(m.createdAt)}
                  />
                  {m.role === 'agent' && inter && (
                    <AgentButtons
                      botones={inter.botones}
                      lista={inter.lista}
                      onCmd={(cmd) => { if (cmd && !busy) void send({ text: cmd }); }}
                    />
                  )}
                </div>
              );
            })}
            {busy && <div className="bubble nova" style={{ opacity: .6 }}>NOVA está escribiendo…</div>}
          </div>
          {err && <div className="bubble system" style={{ margin: '0 12px 8px' }}>⚠ {err}</div>}
          {micOn && (
            <div className="miclive" role="status">
              <i /> Escuchando de forma continua — habla con pausas, cada frase se envía sola · toca 🎙 para apagar
            </div>
          )}
          <div className="chips">
            {CHIPS.map(([cmd, label]) => (
              <button key={cmd} className="chip" onClick={() => { setText(''); void send({ text: cmd }); }}>{label}</button>
            ))}
          </div>
          <div className="chatinput">
            <button className={`micbtn${micOn ? ' rec' : ''}`} onClick={micOn ? stopMic : startMic} aria-label="Dictado continuo" aria-pressed={micOn} title="Dictado continuo: queda escuchando y envía cada frase (tócalo de nuevo para apagar)">🎙</button>
            <button className={`micbtn${noteRec ? ' rec' : ''}`} onClick={() => void toggleVoiceNote()} aria-label="Nota de voz" title="Enviar nota de voz (transcripción con IA)">🎤</button>
            <label className="micbtn" style={{ display: 'grid', placeItems: 'center' }} title="Enviar imagen (análisis con IA)">
              🖼
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { void onImage(e.target.files?.[0] || null); e.target.value = ''; }} />
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendText(); }}
              placeholder='Escribe: "precio btc", "alerta eth >= 4000", "recordar…" o habla con naturalidad'
              aria-label="Mensaje para NOVA"
              disabled={busy}
            />
            <button className="sendbtn" onClick={sendText} disabled={busy}>Enviar</button>
          </div>
        </div>
      </article>
    </section>
  );
}
