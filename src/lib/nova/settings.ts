/* ============================================================
   NOVA v003 — ajustes (singleton) y formato de personalidad
   ============================================================ */
import { db } from '@/lib/db';

export interface NovaSettings {
  id: string;
  persona: string;
  mode247: boolean;
  startHour: number;
  endHour: number;
  maxMsgsPerMin: number;
  ownerWa: string;
  aiEnabled: boolean;
  dailySummaryOn: boolean;
  dailySummaryHour: number;
  waToken: string;
  waPhoneId: string;
  waVerifyToken: string;
}

export async function getSettings(): Promise<NovaSettings> {
  let s = await db.setting.findUnique({ where: { id: 'nova' } });
  if (!s) s = await db.setting.create({ data: { id: 'nova' } });
  return s;
}

/* Variables de entorno tienen prioridad; si no, credenciales guardadas en el dashboard */
export function waCreds(s: NovaSettings) {
  return {
    token: process.env.WHATSAPP_TOKEN || s.waToken || '',
    phoneId: process.env.WHATSAPP_PHONE_ID || s.waPhoneId || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || s.waVerifyToken || 'nova-verify',
  };
}

export const PERSONAS: Record<string, { label: string; desc: string }> = {
  profesional: { label: 'Profesional · directa', desc: 'Directa, analítica y estratégica. Trata de usted o de tú de forma neutra y cordial.' },
  casual: { label: 'Casual · cercana', desc: 'Cercana, amigable y relajada. Usa un tono coloquial sin perder claridad.' },
  creativa: { label: 'Creativa · inspiradora', desc: 'Imaginativa y positiva, con toques de humor y metáforas ligeras.' },
  tecnica: { label: 'Técnica · precisa', desc: 'Precisa y factual. Datos primero, sin adornos.' },
};
