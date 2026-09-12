/* ============================================================
   NOVA v003 — protecciones del agente
   · Anti-spam: ventana deslizante por contacto (memoria)
   · Modo horario: responde 24/7 o solo dentro del horario
   ============================================================ */
import { getSettings } from './settings';

const g = globalThis as unknown as {
  __novaHits?: Map<string, number[]>;
  __novaOutOfHours?: Map<string, number>;
};
g.__novaHits = g.__novaHits || new Map();
g.__novaOutOfHours = g.__novaOutOfHours || new Map();

/* Ventana deslizante de 60 s por contacto */
export function checkRate(waId: string): { allowed: boolean; perMin: number; remaining: number } {
  const now = Date.now();
  const hits = (g.__novaHits!.get(waId) || []).filter(t => now - t < 60000);
  return { allowed: true, perMin: hits.length, remaining: hits };
}

export async function rateCheck(waId: string): Promise<{ allowed: boolean; perMin: number }> {
  const s = await getSettings();
  const limit = Math.max(3, s.maxMsgsPerMin);
  const now = Date.now();
  const hits = (g.__novaHits!.get(waId) || []).filter(t => now - t < 60000);
  if (hits.length >= limit) {
    return { allowed: false, perMin: hits.length };
  }
  hits.push(now);
  g.__novaHits!.set(waId, hits);
  return { allowed: true, perMin: hits.length };
}

/* ¿Estamos dentro del horario de atención? */
export function withinHours(s: { mode247: boolean; startHour: number; endHour: number }): boolean {
  if (s.mode247) return true;
  const h = new Date().getHours();
  if (s.startHour <= s.endHour) return h >= s.startHour && h < s.endHour;
  return h >= s.startHour || h < s.endHour; // horario nocturno cruzando medianoche
}

/* Aviso de fuera de horario: como máximo 1 cada 60 min por contacto */
export function shouldNoticeOutOfHours(waId: string): boolean {
  const last = g.__novaOutOfHours!.get(waId) || 0;
  if (Date.now() - last < 60 * 60000) return false;
  g.__novaOutOfHours!.set(waId, Date.now());
  return true;
}
