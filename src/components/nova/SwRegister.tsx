'use client';

/* NOVA v008 — Service Worker + auto-actualización + instalación PWA + avisos push.
   · Busca versiones nuevas del SW al abrir, al volver a la app y cada 30 min
     (sin depender de navegaciones: funciona en la PWA instalada desde el icono).
   · Cuando una versión nueva toma el control (skipWaiting en sw.js), recarga la
     página UNA sola vez → los cambios se aplican solos, sin refresco manual.
   · El botón "Avisos" pide permiso, suscribe el navegador y guarda la
     suscripción en el servidor: cuando alguien pide un humano, el motor
     envía una notificación push real aunque el panel esté en segundo plano. */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from './Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function urlB64ToUint8Array(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const norm = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(norm);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export async function enablePush(): Promise<'granted' | 'denied' | 'error'> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return 'error';
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const r = await fetch('/api/push', { cache: 'no-store' });
    const d = await r.json();
    if (!d.ok || !d.key) return 'error';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(d.key) as BufferSource,
      });
    }
    const save = await fetch('/api/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return save.ok ? 'granted' : 'error';
  } catch {
    return 'error';
  }
}

/* Botón de avisos push (topbar y Ajustes) */
export function PushBell({ compact = false }: { compact?: boolean }) {
  const [st, setSt] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSt(Notification.permission === 'granted' && localStorage.getItem('nova:push') === '1' ? 'on'
      : Notification.permission === 'granted' ? 'on' : 'off');
  }, []);

  const activate = useCallback(async () => {
    if (busy || st === 'on') return;
    setBusy(true);
    const res = await enablePush();
    if (res === 'granted') {
      localStorage.setItem('nova:push', '1');
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('NOVA · avisos activados', {
        body: 'Te avisaremos aquí en cuanto alguien pida hablar con un humano.',
        icon: '/icons/icon-192.png', badge: '/icons/favicon-64.png', tag: 'nova-on',
      });
    }
    setSt(res === 'granted' ? 'on' : 'off');
    setBusy(false);
  }, [busy, st]);

  if (st === 'on') {
    return (
      <span className={`pushbtn on${compact ? ' compact' : ''}`} title="Avisos push activados: te enterarás al instante cuando alguien pida un humano">
        <Icon name="bellOn" size={14} />{compact ? null : 'Avisos activos'}
      </span>
    );
  }
  return (
    <button
      className={`pushbtn${compact ? ' compact' : ''}`}
      onClick={() => void activate()} disabled={busy}
      title="Activa las notificaciones: aviso inmediato cuando alguien pida hablar con un humano"
    >
      <Icon name="bell" size={14} />{compact ? null : busy ? 'Activando…' : 'Activar avisos'}
    </button>
  );
}

export const NOVA_VERSION = 'v014';

export function SwRegister() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;

    /* v008 — cuando una versión NUEVA del SW toma el control, recargar una sola vez.
       En la primera visita (sin controller previo) no se recarga. */
    try { sessionStorage.removeItem('nova:reload'); } catch { /* noop */ }
    let hadController = !!sw.controller;
    const onCtrl = () => {
      if (!hadController) { hadController = true; return; }
      try {
        if (sessionStorage.getItem('nova:reload') === '1') return;
        sessionStorage.setItem('nova:reload', '1');
        sessionStorage.setItem('nova:justUpdated', NOVA_VERSION);
      } catch { /* noop */ }
      window.location.reload();
    };
    sw.addEventListener('controllerchange', onCtrl);

    let cleanup: (() => void) | undefined;
    sw.register('/sw.js').then((reg) => {
      const tick = () => { reg.update().catch(() => { /* silencioso */ }); };
      void tick();
      const iv = setInterval(tick, 30 * 60 * 1000);
      const onVis = () => { if (document.visibilityState === 'visible') tick(); };
      document.addEventListener('visibilitychange', onVis);
      cleanup = () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
    }).catch(() => { /* silencioso */ });

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => {
      sw.removeEventListener('controllerchange', onCtrl);
      window.removeEventListener('beforeinstallprompt', onPrompt);
      cleanup?.();
    };
  }, []);

  return (
    <>
      <PushBell compact />
      {canInstall && deferred && (
        <button
          className="iconbtn install"
          onClick={() => { void deferred.prompt(); setCanInstall(false); }}
        >
          ⬇ Instalar app
        </button>
      )}
    </>
  );
}
