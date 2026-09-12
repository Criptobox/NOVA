/* ============================================================
   NOVA v011 — tick perezoso (lazy tick) para Vercel serverless
   · En serverless no hay proceso permanente (los setInterval no
     sobreviven): cada petición "empuja" la ejecución de las
     tareas vencidas (alertas, recordatorios, resumen, trading,
     sniper) sin necesidad de servicios externos.
   · Se dispara con: cada mensaje de WhatsApp (webhook) y con
     cada refresco del panel (/api/stats, cada 60 s).
   · Vercel Cron añade un barrido diario nativo (vercel.json)
     para recoger tareas aunque nadie haya abierto nada.
   · Acelerado e idempotente: mínimo 40 s entre ciclos, nunca
     dos ciclos en paralelo y runTick no duplica envíos.
   ============================================================ */
import { runTick } from './scheduler';

const g = globalThis as unknown as { __novaLazyAt?: number; __novaLazyBusy?: Promise<void> | null };

const MIN_MS = 40_000;

export async function lazyTickRun(): Promise<void> {
  // En desarrollo local ya corre el setInterval del planificador: evitar doble tick
  if (process.env.NODE_ENV === 'development') return;
  if (g.__novaLazyBusy) {
    await g.__novaLazyBusy;
    return;
  }
  const now = Date.now();
  if (g.__novaLazyAt && now - g.__novaLazyAt < MIN_MS) return;
  g.__novaLazyAt = now;
  g.__novaLazyBusy = runTick()
    .catch((e) => console.error('[NOVA lazyTick]', e))
    .finally(() => { g.__novaLazyBusy = null; });
  await g.__novaLazyBusy;
}

/** Versión "dispara y olvida" para usar dentro de after() de next/server */
export function lazyTickKick(): void {
  void lazyTickRun().catch(() => {});
}
