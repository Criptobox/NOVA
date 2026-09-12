/* ============================================================
   NOVA v003 — cerebro IA (GLM vía z-ai-web-dev-sdk)
   · Respuesta conversacional con memoria de contexto
   · Transcripción de notas de voz (ASR)
   · Análisis de imágenes (VLM)
   Solo backend: nunca importar desde el cliente.
   ============================================================ */
import ZAI from 'z-ai-web-dev-sdk';
import { PERSONAS } from './settings';
import { money2 } from './prices';
import type { CoinRow } from './prices';

export interface ChatTurn { role: 'user' | 'agent'; body: string }

function systemPrompt(persona: string, marketContext?: string): string {
  const p = PERSONAS[persona] || PERSONAS.profesional;
  return [
    `Eres NOVA, un agente personal de IA que atiende usuarios por WhatsApp. Personalidad: ${p.desc}.`,
    'Responde SIEMPRE en español, de forma breve y natural (estilo WhatsApp: 2-5 frases, sin markdown pesado, sin títulos).',
    'Puedes ayudar con conversación general, dudas, ideas y pequeños consejos.',
    'Conoces comandos del bot que puedes sugerir: "precio btc", "top 10", "portafolio", "alerta eth >= 4000", "alertas", "recordar X a las 15:00", "100 usd a mxn" (divisas), "resumen cripto", "ayuda".',
    'Si el usuario pide hablar con una persona humana u operador, responde exactamente: [ESCALAR_HUMANO]',
    marketContext ? `Datos actuales del mercado cripto que puedes usar si son relevantes: ${marketContext}` : '',
    'Nunca inventes precios de criptomonedas: si te preguntan por precios y no tienes datos, sugiere el comando "precio <moneda>".',
  ].filter(Boolean).join(' ');
}

function marketCtx(rows: CoinRow[]): string {
  if (!rows.length) return '';
  const top = [...rows].sort((a, b) => b.chg - a.chg).slice(0, 3)
    .map(r => `${r.sym} ${money2(r.price)} (${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%)`).join(', ');
  return `precios USD: ${top}`;
}

/* Respuesta conversacional. Devuelve null si la IA está desactivada o falla. */
export async function aiReply(opts: {
  persona: string;
  history: ChatTurn[];
  userText: string;
  rows?: CoinRow[];
  aiEnabled: boolean;
  contactName: string;
}): Promise<{ text: string; escalate: boolean } | null> {
  if (!opts.aiEnabled) return null;
  try {
    const zai = await ZAI.create();
    const history = opts.history.slice(-12).map<Record<string, string>>(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.body,
    }));
    const completion = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt(opts.persona, opts.rows ? marketCtx(opts.rows) : undefined) },
        ...history,
        { role: 'user', content: `${opts.contactName}: ${opts.userText}` },
      ] as Parameters<typeof zai.chat.completions.create>[0]['messages'],
      thinking: { type: 'disabled' },
    });
    const text = (completion.choices[0]?.message?.content || '').trim();
    if (!text) return null;
    if (text.includes('[ESCALAR_HUMANO]')) return { text: '', escalate: true };
    return { text: text.slice(0, 900), escalate: false };
  } catch (err) {
    console.error('[NOVA AI] error:', err);
    return null;
  }
}

/* Transcripción de audio → texto */
export async function transcribeAudio(fileBase64: string): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const res = await zai.audio.asr.create({ file_base64: fileBase64 });
    const t = (res?.text || '').trim();
    return t || null;
  } catch (err) {
    console.error('[NOVA ASR] error:', err);
    return null;
  }
}

/* Descripción de imagen (VLM) — recibe data URL (data:image/...;base64,..) o https */
export async function describeImage(imageUrl: string, question?: string): Promise<string | null> {
  try {
    const zai = await ZAI.create();
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: question || 'Describe esta imagen de forma breve y útil en español (2-4 frases). Si ves texto, transcríbelo. Si es un producto, menciona detalles relevantes.' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ] as Parameters<typeof zai.chat.completions.create>[0]['messages'],
      thinking: { type: 'disabled' },
    });
    const text = (completion.choices[0]?.message?.content || '').trim();
    return text || null;
  } catch (err) {
    console.error('[NOVA VLM] error:', err);
    return null;
  }
}
