/* ============================================================
   NOVA PWA v002 — app.js (núcleo)
   Estado, almacenamiento, router, esfera, voz (Web Speech API),
   toasts, tema, reloj, instalación y service worker.
   ============================================================ */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------- Almacenamiento local con prefijo nova: ---------- */
const NOVA = {
  VERSION: 'v002',
  keys: { SAVED: 'nova:settings', CHAT: 'nova:chat', TASKS: 'nova:tasks',
          EVENTS: 'nova:events', MEM: 'nova:memory', ROUTINES: 'nova:routines',
          PRODUCTS: 'nova:products', SWITCH: 'nova:switches', THEME: 'nova:theme',
          TOLDiOS: 'nova:ios-hint' },
  listeners: {},
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); },
  emit(ev, data) { (this.listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); },

  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} },

  settings: {},
  saveSettings() { this.set(this.keys.SAVED, this.settings); }
};

const DEFAULT_SETTINGS = {
  wake: 'nova', wakeMode: false, voiceURI: '', rate: 1, persona: 'profesional',
  confirmSensitive: true, theme: 'minimal'
};

function loadSettings() {
  NOVA.settings = Object.assign({}, DEFAULT_SETTINGS, NOVA.get(NOVA.keys.SAVED, {}));
}

/* ---------- Tema ---------- */
const THEMES = [
  { id: 'minimal',     name: 'Minimal',     dot: 'radial-gradient(circle at 35% 30%,#fff,#66e7ff 15%,#5a72ff 50%,#8f38ff 75%)' },
  { id: 'glass',       name: 'Glass',       dot: 'radial-gradient(circle at 35% 30%,#fff,#5eead4 20%,#38bdf8 55%,#0ea5e9 80%)' },
  { id: 'holographic', name: 'Holographic', dot: 'radial-gradient(circle at 35% 30%,#fff,#67e8f9 18%,#a78bfa 52%,#f472b6 80%)' },
  { id: 'darkluxury',  name: 'Dark Luxury', dot: 'radial-gradient(circle at 35% 30%,#fffbe8,#e7c977 22%,#b08d3f 58%,#6b5320 85%)' },
  { id: 'aurora',      name: 'Aurora',      dot: 'radial-gradient(circle at 35% 30%,#eafff4,#4ade80 20%,#22d3ee 55%,#818cf8 82%)' },
  { id: 'crystal',     name: 'Crystal',     dot: 'radial-gradient(circle at 35% 30%,#ffffff,#93c5fd 22%,#60a5fa 55%,#c4b5fd 85%)' }
];
function applyTheme(id) {
  document.body.dataset.theme = THEMES.some(t => t.id === id) ? id : 'minimal';
  NOVA.settings.theme = document.body.dataset.theme;
  NOVA.set(NOVA.keys.THEME, NOVA.settings.theme);
  const sel = $('#setTheme'); if (sel) sel.value = NOVA.settings.theme;
  $$('#themeGrid .themecard').forEach(c => c.classList.toggle('active', c.dataset.theme === NOVA.settings.theme));
}

/* ---------- Toasts ---------- */
function toast(msg, type = '', ms = 3200, action) {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span>${msg}</span>`;
  if (action) {
    const b = document.createElement('button'); b.textContent = action.label;
    b.onclick = () => { action.fn(); t.remove(); };
    t.appendChild(b);
  } else {
    const x = document.createElement('button'); x.textContent = '×'; x.onclick = () => t.remove();
    t.appendChild(x);
  }
  $('#toasts').appendChild(t);
  if (ms) setTimeout(() => t.remove(), ms);
  return t;
}

/* ---------- Reloj y fecha ---------- */
function startClock() {
  const clock = $('#clock'), dateLine = $('#dateLine');
  const tick = () => {
    const d = new Date();
    clock.textContent = d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    const fecha = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const online = navigator.onLine;
    dateLine.textContent = `${fecha.charAt(0).toUpperCase() + fecha.slice(1)} · ${online ? 'NOVA está lista' : 'modo offline'}`;
  };
  tick(); setInterval(tick, 1000);
}

/* ---------- Router SPA ---------- */
const RENDERERS = {}; // vistas dinámicas (las registra views.js)
let currentView = 'inicio';

function navigate(view) {
  if (!document.getElementById(`view-${view}`)) return;
  currentView = view;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (RENDERERS[view]) RENDERERS[view]();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function initRouter() {
  $$('#nav button').forEach(btn => btn.onclick = () => navigate(btn.dataset.view));
  document.addEventListener('click', e => {
    const g = e.target.closest('[data-goto]');
    if (g) navigate(g.dataset.goto);
  });
  const initial = (location.hash || '#inicio').slice(1);
  navigate(RENDERERS[initial] || document.getElementById(`view-${initial}`) ? initial : 'inicio');
}

/* ---------- Máquina de estados de la esfera ---------- */
const STATE_TEXT = {
  standby:     ['En espera',  'Di "Nova" o toca la esfera para activar tu agente personal.'],
  detectando:  ['Detectando', 'He escuchado tu palabra de activación…'],
  escuchando:  ['Escuchando', 'Te escucho. Habla con naturalidad.'],
  pensando:    ['Pensando',   'Estoy analizando tu solicitud…'],
  hablando:    ['Hablando',   'Respondiendo con voz natural.'],
  ejecutando:  ['Ejecutando', 'Realizando la acción autorizada…']
};
let orbState = 'standby';

function setOrbState(state) {
  orbState = state;
  const orb = $('#orb');
  orb.classList.remove('listening', 'thinking', 'speaking', 'executing');
  if (state === 'escuchando') orb.classList.add('listening');
  if (state === 'pensando')   orb.classList.add('thinking');
  if (state === 'hablando')   orb.classList.add('speaking');
  if (state === 'ejecutando') orb.classList.add('executing');
  const [t, s] = STATE_TEXT[state] || STATE_TEXT.standby;
  $('#stateText').textContent = t;
  $('#stateSub').textContent = s;
  $$('#statesGrid .statebox').forEach(b => b.classList.toggle('activeState', b.dataset.state === state));
  const statesTag = $('#statesTag');
  if (statesTag) statesTag.textContent = `estado: ${t.toLowerCase()}`;
}

/* ---------- Síntesis de voz (TTS) ---------- */
let voices = [];
function loadVoices() {
  voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  const sel = $('#setVoice');
  if (!sel) return;
  const es = voices.filter(v => /^es/i.test(v.lang));
  const list = es.length ? es : voices;
  sel.innerHTML = '<option value="">Automática (español)</option>' +
    list.map(v => `<option value="${v.voiceURI}">${v.name} · ${v.lang}</option>`).join('');
  sel.value = NOVA.settings.voiceURI || '';
}
function pickVoice() {
  if (!voices.length) loadVoices();
  if (NOVA.settings.voiceURI) {
    const v = voices.find(v => v.voiceURI === NOVA.settings.voiceURI);
    if (v) return v;
  }
  return voices.find(v => /^es/i.test(v.lang) && /google/i.test(v.name))
      || voices.find(v => /^es/i.test(v.lang)) || null;
}
function speak(text, onend) {
  setOrbState('hablando');
  if (!window.speechSynthesis) { setTimeout(onend, 900); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = pickVoice(); if (v) u.voice = v;
  u.lang = v ? v.lang : 'es-ES';
  u.rate = NOVA.settings.rate || 1;
  u.pitch = 1.02;
  u.onend = () => { onend && onend(); };
  u.onerror = () => { onend && onend(); };
  speechSynthesis.speak(u);
  // red de seguridad por si el motor no dispara onend
  setTimeout(() => { if (!speechSynthesis.speaking && orbState === 'hablando') onend && onend(); }, 12000);
}

/* ---------- Reconocimiento de voz (STT) ---------- */
const SRClass = window.SpeechRecognition || window.webkitSpeechRecognition || null;
let recog = null, listening = false, wakeLoop = null;

function createRecog(oneShot) {
  const r = new SRClass();
  r.lang = 'es-ES';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.continuous = !oneShot;
  return r;
}

function startListening() {
  if (!SRClass) {
    toast('🎙 Tu navegador no soporta reconocimiento de voz. Prueba Chrome o Edge.', 'warn', 4200);
    return;
  }
  if (listening) return stopListening();
  if (NOVA.settings.wakeMode) { toggleWakeMode(false); }
  recog = createRecog(true);
  let finalText = '';
  recog.onstart = () => { listening = true; setOrbState('escuchando');
    $('#voiceBtn').textContent = '⏹ Detener voz'; $('#micBtn')?.classList.add('rec');
    $('#bigVoicebar')?.classList.remove('off'); };
  recog.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) finalText += t + ' '; else interim += t;
    }
    const preview = (finalText + interim).trim();
    if (preview) $('#stateSub').textContent = `“${preview}”`;
  };
  recog.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
      toast('🚫 Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones.', 'err', 5000);
    else if (e.error === 'no-speech') toast('🔇 No escuché nada. Inténtalo de nuevo.', 'warn');
  };
  recog.onend = () => {
    listening = false; $('#voiceBtn').textContent = '🎙 Activar voz';
    $('#micBtn')?.classList.remove('rec'); $('#bigVoicebar')?.classList.add('off');
    const text = finalText.trim();
    if (text) handleCommand(text);
    else setOrbState('standby');
  };
  try { recog.start(); } catch { /* ya activo */ }
}
function stopListening() { try { recog && recog.stop(); } catch {} }

/* Modo Wake Word (experimental): escucha continua buscando la palabra clave */
function toggleWakeMode(on) {
  NOVA.settings.wakeMode = on; NOVA.saveSettings();
  $('#setWakeMode').textContent = on ? 'Activado (escucha continua)' : 'Desactivado';
  if (wakeLoop) { try { wakeLoop.stop(); } catch {} wakeLoop = null; }
  if (!on) return;
  if (!SRClass) { toast('Wake Word requiere Chrome/Edge.', 'warn'); NOVA.settings.wakeMode = false; return; }
  const loop = createRecog(false);
  loop.onresult = e => {
    if (listening || orbState !== 'standby') return;
    const res = e.results[e.results.length - 1];
    const text = res[0].transcript.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const wake = (NOVA.settings.wake || 'nova').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (text.includes(wake)) {
      setOrbState('detectando');
      speak('Sí, dime', () => { setTimeout(() => startListening(), 250); });
    }
  };
  loop.onend = () => { if (NOVA.settings.wakeMode) { try { loop.start(); } catch {} } };
  loop.onerror = ev => { if (ev.error === 'not-allowed') { NOVA.settings.wakeMode = false; NOVA.saveSettings(); $('#setWakeMode').textContent = 'Desactivado'; } };
  wakeLoop = loop;
  try { loop.start(); toast(`⌁ Wake word "${NOVA.settings.wake}" activa. Di su nombre para despertar a NOVA.`, 'ok', 4000); } catch {}
}

/* ---------- Interruptores persistentes ---------- */
function initSwitches() {
  const saved = NOVA.get(NOVA.keys.SWITCH, {});
  $$('[data-switch]').forEach(sw => {
    const key = sw.dataset.switch;
    sw.classList.toggle('on', !!saved[key]);
    sw.onclick = () => {
      const now = !sw.classList.contains('on');
      sw.classList.toggle('on', now);
      saved[key] = now;
      NOVA.set(NOVA.keys.SWITCH, saved);
      if (key === 'priv_push' && now) enableNotifications();
      toast(now ? 'Opción activada' : 'Opción desactivada', 'ok', 1600);
    };
  });
}

/* ---------- Notificaciones ---------- */
function enableNotifications() {
  if (!('Notification' in window)) { toast('Este navegador no soporta notificaciones.', 'warn'); return; }
  Notification.requestPermission().then(p => {
    if (p === 'granted') { toast('🔔 Notificaciones activadas', 'ok');
      try { new Notification('NOVA', { body: 'Perfecto, te avisaré cuando pase algo importante.', icon: 'icons/icon-192.png' }); } catch {}
    } else toast('Permiso de notificaciones denegado.', 'warn');
  });
}

/* ---------- Chat ---------- */
function chatHistory() { return NOVA.get(NOVA.keys.CHAT, []); }
function pushChat(who, text) {
  const h = chatHistory();
  h.push({ who, text, ts: Date.now() });
  while (h.length > 60) h.shift();
  NOVA.set(NOVA.keys.CHAT, h);
  renderChat();
}
function renderChat() {
  const log = $('#chatLog'), mini = $('#miniChat');
  if (!log) return;
  const h = chatHistory();
  const fmt = ({ who, text, ts }) => {
    const time = new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    return `<div class="bubble ${who}">${who === 'nova' ? '<b>NOVA</b><br>' : ''}${escapeHTML(text)}<span class="ts">${time}</span></div>`;
  };
  log.innerHTML = h.map(fmt).join('') || '<div class="empty"><span class="big">◉</span>Di “Nova” o escribe un mensaje para comenzar.</div>';
  log.scrollTop = log.scrollHeight;
  if (mini) mini.innerHTML = h.slice(-3).map(fmt).join('') || '<div class="bubble nova"><b>NOVA</b><br>Hola, ¿en qué puedo ayudarte hoy?</div>';
}
function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function novaReply(text, extra) {
  pushChat('nova', text);
  if (extra && extra.action) {
    // La acción se ejecuta en paralelo a la voz (respuesta inmediata)
    setOrbState('ejecutando');
    setTimeout(() => { try { extra.action(); } catch (e) { console.error(e); } setOrbState('standby'); }, 900);
    speak(text, () => { if (orbState === 'hablando') setOrbState('standby'); });
  } else {
    speak(text, () => setOrbState('standby'));
  }
}

/* ---------- Personalidad ---------- */
const PERSONAS = {
  profesional: { name: 'Profesional', desc: 'Directa · analítica · estratégica', wrap: t => t },
  casual:      { name: 'Casual',      desc: 'Cercana · relajada · amigable',   wrap: t => t.replace(/\.$/, '') + ' 😊' },
  creativa:    { name: 'Creativa',    desc: 'Inspiradora · visual · cálida',   wrap: t => `✦ ${t}` },
  tecnica:     { name: 'Técnica',     desc: 'Precisa · estructurada · breve',  wrap: t => t }
};
function personaWrap(t) { const p = PERSONAS[NOVA.settings.persona] || PERSONAS.profesional; return p.wrap(t); }

/* ---------- Motor de intenciones (local, sin servidor) ---------- */
function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
const JOKES = [
  '¿Por qué los programadores prefieren el modo oscuro? Porque la luz atrae a los insectos.',
  'Me dijeron que contara hasta tres. Uno, dos, tres... listo, ya soy una PWA muy rápida.',
  '¿Qué le dijo un bit al otro? Nos vemos en el bus.',
  'Mi memoria nunca olvida... salvo cuando el usuario borra el almacenamiento local.'
];

function handleCommand(raw) {
  const text = raw.trim();
  if (!text) return;
  pushChat('user', text);
  setOrbState('pensando');
  const q = norm(text);
  const wake = norm(NOVA.settings.wake || 'nova');
  const cmd = q.startsWith(wake) ? q.slice(wake.length).trim() : q;

  setTimeout(() => {
    // — Navegación —
    const views = { inicio: 'inicio', conversacion: 'conversación', memoria: 'memoria', calendario: 'calendario',
                    agenda: 'calendario', tareas: 'tareas', automatizaciones: 'automatizaciones', rutinas: 'automatizaciones',
                    archivos: 'archivos', tiendamax: 'tiendamax', tienda: 'tiendamax', criptos: 'criptos', cripto: 'criptos',
                    wallet: 'criptos', navegador: 'navegador', plugins: 'plugins' };
    const mOpen = cmd.match(/(?:abre|abrir|muestra|ensename|ve a|ir a)\s+(?:la\s+|el\s+|mi\s+)?([a-z]+)/);
    if (mOpen && views[mOpen[1]]) {
      const target = views[mOpen[1]];
      return novaReply(personaWrap(`Abriendo ${views[mOpen[1]]}.`), { action: () => { navigate(target); setOrbState('standby'); } });
    }
    // — Tareas: agregar —
    const mTask = cmd.match(/(?:agrega|anade|añade|crea|nueva)\s+(?:una\s+)?tarea\s+(.+)/);
    if (mTask) {
      return novaReply(personaWrap(`Tarea agregada: ${mTask[1]}.`), { action: () => { addTaskFromVoice(mTask[1]); setOrbState('standby'); } });
    }
    // — Memoria: recordar —
    const mMem = cmd.match(/(?:recuerda que|recuerda|no olvides)\s+(.+)/);
    if (mMem) {
      return novaReply(personaWrap(`Guardado en mi memoria: ${mMem[1]}.`), { action: () => { addMemoryFromVoice(mMem[1]); setOrbState('standby'); } });
    }
    // — Tema —
    const mTheme = cmd.match(/tema\s+(minimal|glass|holografic\w*|dark\s*luxury|aurora|crystal)/);
    if (mTheme) {
      const map = { holografic: 'holographic', 'dark luxury': 'darkluxury' };
      const key = map[mTheme[1]] || mTheme[1].replace(/\s/g, '');
      return novaReply(personaWrap(`Cambiando al tema ${key}.`), { action: () => { applyTheme(key); setOrbState('standby'); } });
    }
    // — Consultas —
    if (/venta|ingres|pedid/.test(cmd)) return novaReply(personaWrap(salesAnswer()));
    if (/tarea|pendiente|todo|por hacer/.test(cmd)) return novaReply(personaWrap(tasksAnswer()));
    if (/agenda|calendario|reunion|evento|citau|cita|hoy/.test(cmd)) return novaReply(personaWrap(calendarAnswer()));
    if (/que hora|hora es/.test(cmd)) return novaReply(personaWrap(`Son las ${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.`));
    if (/que dia|fecha de hoy/.test(cmd)) return novaReply(personaWrap(`Hoy es ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.`));
    if (/clima|tiempo hace|temperatura/.test(cmd)) return novaReply(personaWrap('La tarjeta del clima es una demo por ahora. En la versión con backend puedo conectar un servicio meteorológico real.'));
    if (/chiste/.test(cmd)) return novaReply(personaWrap(JOKES[Math.floor(Math.random() * JOKES.length)]));
    if (/gracias/.test(cmd)) return novaReply(personaWrap('Para eso estoy. ¿Algo más?'));
    if (/instalar|instala/.test(cmd)) return novaReply(personaWrap('Abriendo el diálogo de instalación.'), { action: () => { promptInstall(); setOrbState('standby'); } });
    if (/que sabes de mi|mi memoria|recuerdos/.test(cmd)) return novaReply(personaWrap(memoryAnswer()));
    // — Cripto (crypto.js) —
    if (/cripto|bitcoin|btc\b|ethereum|eth\b|solana|sol\b|cardano|dogecoin|altcoin|token/.test(cmd))
      return novaReply(personaWrap((window.cryptoAnswerFn || (() => 'El módulo cripto aún se está cargando.'))(cmd)));
    if (/ayuda|que puedes hacer|comandos/.test(cmd))
      return novaReply(personaWrap('Puedo: consultar ventas y tareas, leer tu agenda, agregar tareas, recordar datos, dar precios de cripto como "precio de bitcoin", abrir secciones como "abre tareas", cambiar el tema, contar chistes y funcionar sin conexión. Di "ayuda" cuando quieras esta lista.'));
    if (/^(hola|buenas|hey|que tal|holaa+)/.test(cmd))
      return novaReply(personaWrap('Hola, ¿en qué puedo ayudarte hoy?'));
    if (/notificacion/.test(cmd)) return novaReply(personaWrap('Enviando una notificación de prueba.'), { action: () => { enableNotifications(); setOrbState('standby'); } });

    // — Fallback —
    novaReply(personaWrap('Aún aprendo ese comando. Prueba con "¿cómo van las ventas?", "agrega tarea comprar café", "abre calendario" o "ayuda".'));
  }, 500 + Math.random() * 600);
}

/* Respuestas que leen los datos reales de la app (definidas por views.js) */
function salesAnswer()    { return (typeof window.salesAnswerFn === 'function') ? window.salesAnswerFn() : 'Hoy llevas $4,280 en 42 pedidos, un 18% más que ayer. (datos demo)'; }
function tasksAnswer()    { return (typeof window.tasksAnswerFn === 'function') ? window.tasksAnswerFn() : 'No hay gestor de tareas cargado todavía.'; }
function calendarAnswer() { return (typeof window.calendarAnswerFn === 'function') ? window.calendarAnswerFn() : 'No hay agenda cargada todavía.'; }
function memoryAnswer()   { return (typeof window.memoryAnswerFn === 'function') ? window.memoryAnswerFn() : 'Mi memoria está vacía por ahora.'; }
function addTaskFromVoice(t)   { if (window.addTaskFn) window.addTaskFn(t); }
function addMemoryFromVoice(t) { if (window.addMemoryFn) window.addMemoryFn(t); }

/* ---------- Instalación PWA ---------- */
let deferredPrompt = null;
function initInstall() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferredPrompt = e;
    $('#installBtn').hidden = false;
  });
  $('#installBtn').onclick = () => promptInstall();
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null; $('#installBtn').hidden = true;
    toast('✦ NOVA instalada. Búscala en tu escritorio o menú de apps.', 'ok', 5000);
  });
  // Pista en iOS (no soporta beforeinstallprompt)
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (isIOS && !standalone && !NOVA.get(NOVA.keys.TOLDiOS, false)) {
    NOVA.set(NOVA.keys.TOLDiOS, true);
    toast('📱 En iPhone: toca Compartir y luego "Añadir a pantalla de inicio".', '', 9000);
  }
}
function promptInstall() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; $('#installBtn').hidden = true; }); }
  else toast('Ya está instalada, o tu navegador no requiere confirmación. En iOS usa Compartir → "Añadir a pantalla de inicio".', 'warn', 6000);
}

/* ---------- Online / Offline ---------- */
function initConnection() {
  const badge = $('#offlineBadge');
  const upd = () => badge.classList.toggle('show', !navigator.onLine);
  window.addEventListener('online', () => { upd(); toast('🌐 Conexión restablecida', 'ok'); upd(); });
  window.addEventListener('offline', () => { upd(); toast('◌ Sin conexión: NOVA sigue funcionando offline.', 'warn'); });
  upd();
}

/* ---------- Service Worker + actualizaciones ---------- */
let waitingWorker = null;
function initSW() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = nw; $('#updateBar').classList.add('show');
        }
      });
    });
  }).catch(err => console.warn('SW no registrado:', err));
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  $('#updateBtn').onclick = () => { waitingWorker && waitingWorker.postMessage({ type: 'SKIP_WAITING' }); };
  $('#updateDismiss').onclick = () => $('#updateBar').classList.remove('show');
}

/* ---------- Modal de ajustes ---------- */
function initSettings() {
  const modal = $('#modal');
  const open = () => {
    $('#setWake').value = NOVA.settings.wake;
    $('#setWakeMode').textContent = NOVA.settings.wakeMode ? 'Activado (escucha continua)' : 'Desactivado';
    $('#setRate').value = NOVA.settings.rate; $('#setRateV').textContent = Number(NOVA.settings.rate).toFixed(1);
    $('#setPersona').value = NOVA.settings.persona;
    $('#setTheme').value = NOVA.settings.theme;
    $('#setConfirm').textContent = NOVA.settings.confirmSensitive ? 'Sí (recomendado)' : 'No';
    modal.classList.add('open');
    loadVoices();
  };
  $('#settingsBtn').onclick = open;
  $('#close').onclick = () => modal.classList.remove('open');
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.classList.remove('open'); });

  $('#setWake').addEventListener('change', e => { NOVA.settings.wake = e.target.value.trim() || 'nova'; NOVA.saveSettings(); if (NOVA.settings.wakeMode) toggleWakeMode(true); });
  $('#setWakeMode').parentElement.addEventListener('click', () => toggleWakeMode(!NOVA.settings.wakeMode));
  $('#setVoice').addEventListener('change', e => { NOVA.settings.voiceURI = e.target.value; NOVA.saveSettings(); });
  $('#setRate').addEventListener('input', e => { NOVA.settings.rate = parseFloat(e.target.value); $('#setRateV').textContent = NOVA.settings.rate.toFixed(1); NOVA.saveSettings(); });
  $('#setPersona').addEventListener('change', e => { NOVA.settings.persona = e.target.value; NOVA.saveSettings(); updatePersonaCard(); });
  $('#setTheme').addEventListener('change', e => applyTheme(e.target.value));
  $('#setConfirm').parentElement.addEventListener('click', () => { NOVA.settings.confirmSensitive = !NOVA.settings.confirmSensitive; NOVA.saveSettings(); $('#setConfirm').textContent = NOVA.settings.confirmSensitive ? 'Sí (recomendado)' : 'No'; });
  $('#notifyTest').onclick = e => { e.stopPropagation(); enableNotifications(); };
  $('#exportData').onclick = e => {
    e.stopPropagation();
    const data = {}; Object.values(NOVA.keys).forEach(k => { const v = NOVA.get(k, null); if (v !== null) data[k] = v; });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `nova-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(a.href);
  };
  $('#resetData').onclick = e => {
    e.stopPropagation();
    if (!confirm('¿Borrar TODOS los datos guardados por NOVA en este dispositivo?')) return;
    Object.keys(localStorage).filter(k => k.startsWith('nova:')).forEach(k => localStorage.removeItem(k));
    location.reload();
  };
  if (window.speechSynthesis) speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}
function updatePersonaCard() {
  const p = PERSONAS[NOVA.settings.persona] || PERSONAS.profesional;
  $('#personaName').textContent = `Personalidad: ${p.name}`;
  $('#personaDesc').textContent = p.desc;
}

/* ---------- Atajo de teclado ---------- */
function initShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !e.repeat && !/input|textarea|select/i.test(document.activeElement.tagName)) {
      e.preventDefault(); startListening();
    }
  });
}

/* ---------- Grid de temas (tarjeta del inicio) ---------- */
function renderThemeGrid() {
  const grid = $('#themeGrid');
  if (!grid) return;
  grid.innerHTML = THEMES.map(t => `
    <button class="themecard ${t.id === NOVA.settings.theme ? 'active' : ''}" data-theme="${t.id}">
      <span class="dot" style="background:${t.dot}"></span>${t.name}
    </button>`).join('');
  $$('#themeGrid .themecard').forEach(c => c.onclick = () => {
    applyTheme(c.dataset.theme);
    toast(`Tema ${c.dataset.theme} aplicado`, 'ok', 1600);
  });
}

/* ---------- Tilt 3D de la esfera (solo puntero fino) ---------- */
function initOrbTilt() {
  const stage = $('.orb-stage'), orb = $('#orb');
  if (!stage || !orb) return;
  if (!matchMedia('(pointer:fine)').matches) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  stage.addEventListener('pointermove', e => {
    const r = stage.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    orb.style.transform = `rotateX(${(-dy * 9).toFixed(2)}deg) rotateY(${(dx * 9).toFixed(2)}deg)`;
  });
  stage.addEventListener('pointerleave', () => { orb.style.transform = ''; });
}

/* ---------- Init ---------- */
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  applyTheme(NOVA.get(NOVA.keys.THEME, NOVA.settings.theme));
  startClock();
  initRouter();
  initSwitches();
  initSettings();
  initInstall();
  initConnection();
  initSW();
  initShortcuts();
  updatePersonaCard();
  renderThemeGrid();
  initOrbTilt();
  renderChat();
  setOrbState('standby');

  $('#voiceBtn').onclick = () => startListening();
  $('#orb').onclick = () => startListening();
  $('#micBtn').onclick = () => startListening();
  $('#sendBtn').onclick = sendChat;
  $('#chatInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
  $$('.chip').forEach(c => c.onclick = () => handleCommand(c.dataset.say));
  $('#testVoiceBtn').onclick = () => speak(personaWrap('Hola, soy Nova, tu agente personal. Todo funciona perfectamente.'), () => setOrbState('standby'));

  // barra de voz animada (13 barras)
  const vb = $('#bigVoicebar');
  if (vb && !vb.children.length) vb.innerHTML = Array.from({ length: 13 }, () => '<i></i>').join('');

  if (!SRClass) {
    const tag = $('#engineTag');
    if (tag) tag.textContent = 'voz no disponible en este navegador · usa texto';
  }
});
function sendChat() {
  const inp = $('#chatInput');
  const v = inp.value.trim();
  if (!v) return;
  inp.value = '';
  handleCommand(v);
}
