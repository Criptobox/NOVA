/* ============================================================
   NOVA v005 — MOTOR DEL AGENTE
   Pipeline: anti-spam → pausa-humano → tipo de mensaje
   (texto/audio/imagen) → botones interactivos → intenciones
   (cripto · divisas · recordatorios · humano) → IA → escalado.
   v005: solo datos reales — nunca precios inventados.
   ============================================================ */
import { db } from '@/lib/db';
import { getSettings } from './settings';
import { rateCheck, withinHours, shouldNoticeOutOfHours } from './guard';
import { ensureContact, saveMessage, deliverTo, notifyOwner, systemNote, type DeliverOpts } from './notify';
import { CATALOG, findCoin, getPrices, money, money2, fmtAmt, symOf, nameOf, priceOf } from './prices';
import { aiReply, transcribeAudio, describeImage } from './ai';
import { waMode, fetchWaMedia } from './whatsapp';
import { parseFxIntent, convertCurrency, formatFxReply } from './fx';
import { parseShopCommand, shopReply, type ShopCommand } from './shop';
import { pushAll } from './push';
import type { NovaSettings } from './settings';
import { getTradingCfg, updateTradingCfg, tradingStatusText, tradesSummaryText, evaluateSymbol, manualOrder } from './trading';
import { getSignal } from './analysis';

export interface InboundMessage {
  waId: string;
  name?: string;
  channel: 'whatsapp' | 'simulador';
  kind: 'text' | 'audio' | 'image';
  text?: string;
  audioBase64?: string;
  imageUrl?: string; // data URL o https
  interactiveId?: string; // v004: respuesta a botón/lista de WhatsApp
}

export interface EngineResult {
  handled: boolean;
  blocked?: string;
  replies: string[];
}

/* ---------- Menús interactivos (gratis en la ventana 24 h) ---------- */
const cmdId = (cmd: string) => `cmd|${cmd}`;
export function commandFromInteractive(id: string): string | null {
  return id.startsWith('cmd|') ? id.slice(4).trim() || null : null;
}

const MENU_LIST = {
  title: 'Menú NOVA',
  rows: [
    { id: cmdId('precio btc'), title: '🪙 Precio en vivo', description: 'Ej: BTC, ETH, SOL, ADA…' },
    { id: cmdId('top 10'), title: '🏆 Top del día', description: 'Las 5 que más suben en 24 h' },
    { id: cmdId('portafolio'), title: '💼 Mi portafolio', description: 'Valor total de tus criptos' },
    { id: cmdId('alertas'), title: '⏰ Mis alertas', description: 'Avisos de precio vigilados' },
    { id: cmdId('resumen cripto'), title: '🌅 Resumen cripto', description: 'Suben y bajan del mercado' },
    { id: cmdId('stock bajo'), title: '📦 Stock de la tienda', description: 'TiendaMax: existencias, ventas y reposiciones' },
    { id: cmdId('estado trading'), title: '📈 Trading', description: 'Motor, modo y posiciones abiertas' },
    { id: cmdId('100 usd a mxn'), title: '💱 Convertir divisas', description: 'Ej: 100 usd a mxn, 50 eur a cop' },
    { id: cmdId('recordar tarea a las 15:00'), title: '⏱ Crear recordatorio', description: 'Escribe luego tu tarea y hora' },
    { id: cmdId('hablar con un humano'), title: '👤 Hablar con humano', description: 'Te comunico con el equipo' },
  ],
};

const MENU_BUTTONS = [
  { id: cmdId('precio btc'), title: '🪙 Precio BTC' },
  { id: cmdId('portafolio'), title: '💼 Portafolio' },
  { id: cmdId('ayuda'), title: '🤖 Ver menú' },
];

/* ---------- Textos de ayuda ---------- */
const HELP = `🤖 *NOVA · Agente WhatsApp*

Puedo ayudarte con:
🪙 *Cripto*
• "precio btc" → precio en vivo
• "top 10" → mejores del día
• "portafolio" → valor de tu portafolio
• "alerta eth >= 4000" → te aviso si cruza
• "alertas" → ver tus alertas
• "borrar alerta 2" → eliminar
• "resumen cripto" → resumen del mercado
💱 *Divisas*
• "100 usd a mxn" → conversión en vivo
• "50 euros a dolares", "200 gbp a eur"…
⏰ *Recordatorios*
• "recordar llamar a Ana a las 15:00"
• "recordar gym a las 7:00 am mañana"
• "recordar tomar agua a las 9 todos los dias"
📦 *Tu tienda (TiendaMax)*
• "stock de batería must" → existencias reales de tiendamax.org
• "stock bajo" / "agotados" → qué falta reponer
• "reponer 10 batería must" → suma stock y lo sube a tu tienda
• "elimina 3 ventilador" → resta stock (merma, rotura…)
• "venta de 2 batería a 300" → registra la venta y descuenta
• "deja el stock de luces en 5" → fija un valor exacto
📈 *Trading* (simulación por defecto)
• "estado trading" → motor, modo y posiciones abiertas
• "señal btc" / "analiza eth" → indicadores y score
• "activar trading" / "pausar trading" (solo el dueño)
• "compra btc" / "vende eth" → orden manual (sim/testnet)
• "resumen operaciones" → últimas operaciones y PnL
👤 *Humano*
• "humano" o "operador" → te comunico con una persona

Escríbeme con naturalidad, también entiendo preguntas generales 😊`;

const OUT_OF_HOURS = (s: NovaSettings) =>
  `🌙 Estamos fuera del horario de atención (${s.startHour}:00 a ${s.endHour}:00). Tu mensaje queda guardado y te respondo en cuanto abramos. Para emergencias escribe "humano".`;

/* ---------- Respuestas de cripto (solo datos reales) ---------- */
async function replyPrecio(args: { id: string; sym: string; name: string }): Promise<string> {
  const { row } = await priceOf(args.id);
  if (!row) return `Ahora mismo no puedo consultar el precio de ${args.name} (sin conexión con el mercado). Prueba en unos minutos 🙏`;
  const up = row.chg >= 0;
  const hold = await db.holding.findUnique({ where: { coinId: args.id } });
  return `${args.name} (${args.sym}) cotiza en *${money2(row.price)}* USD, ${up ? 'sube' : 'baja'} un *${Math.abs(row.chg).toFixed(2)}%* en 24 h.` +
    (hold && hold.amt > 0 ? `\n📦 Tienes ${fmtAmt(hold.amt)} ${args.sym} ≈ *${money(hold.amt * row.price)}*.` : '');
}

async function replyTop(): Promise<string> {
  const { rows } = await getPrices();
  if (!rows.length) return 'Ahora mismo no tengo conexión con el mercado, así que prefiero no inventarte datos. Prueba en unos minutos 🙏';
  const best = [...rows].sort((a, b) => b.chg - a.chg).slice(0, 5);
  const lines = best.map((r, i) => `${i + 1}. *${r.sym}* ${money2(r.price)} · ${r.chg >= 0 ? '🟢 +' : '🔴 '}${r.chg.toFixed(2)}%`);
  return `🏆 *Top del día* (24 h):\n${lines.join('\n')}`;
}

async function replyPortafolio(): Promise<string> {
  const { rows } = await getPrices();
  if (!rows.length) return 'Ahora mismo no puedo consultar precios en vivo, así que no puedo valorar tu portafolio con datos reales. Prueba en unos minutos 🙏';
  const holds = await db.holding.findMany();
  if (!holds.length) return 'Tu portafolio está vacío. Dime por ejemplo: "vigila sol" y lo agrego, o gestionalo desde el dashboard.';
  let total = 0, chgUSD = 0;
  const lines: string[] = [];
  for (const h of holds) {
    const r = rows.find(x => x.id === h.coinId);
    if (!r || h.amt <= 0) { lines.push(`• ${h.sym}: sin datos`); continue; }
    const v = h.amt * r.price;
    total += v;
    chgUSD += v * (r.chg / 100);
    lines.push(`• *${h.sym}* ${fmtAmt(h.amt)} ≈ ${money(v)} (${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%)`);
  }
  const pct = total - chgUSD ? (chgUSD / (total - chgUSD)) * 100 : 0;
  return `💼 *Tu portafolio: ~${money(total)}*\n${lines.join('\n')}\n\n24 h: ${chgUSD >= 0 ? '🟢 +' : '🔴 −'}${money(Math.abs(chgUSD)).slice(1)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
}

async function replyResumen(): Promise<string> {
  const { rows } = await getPrices();
  if (!rows.length) return 'Sin conexión con el mercado ahora mismo — no te voy a inventar el resumen 😉. Prueba en unos minutos.';
  const sorted = [...rows].sort((a, b) => b.chg - a.chg);
  const best = sorted.slice(0, 3), worst = sorted.slice(-3).reverse();
  const holds = await db.holding.findMany();
  let total = 0;
  for (const h of holds) {
    const r = rows.find(x => x.id === h.coinId);
    if (r) total += h.amt * r.price;
  }
  const fmt = (r: typeof rows[number]) => `${r.sym} ${r.chg >= 0 ? '+' : ''}${r.chg.toFixed(1)}%`;
  return `🌅 *Resumen cripto*\n📈 Suben: ${best.map(fmt).join(' · ')}\n📉 Bajan: ${worst.map(fmt).join(' · ')}${total > 0 ? `\n💼 Tu portafolio: ~${money(total)}` : ''}`;
}

/* ---------- Alertas ---------- */
async function createAlert(text: string, createdBy?: string): Promise<string> {
  const coin = findCoin(text.replace(/alerta|vigila|avisa/gi, ' '));
  const numMatch = text.match(/([\d][\d.,]*)/);
  if (!coin || !numMatch) return 'No entendí la alerta. Ejemplos: "alerta eth >= 4000", "alerta bitcoin por debajo de 90000".';
  const price = parseFloat(numMatch[1].replace(/,/g, ''));
  if (!(price > 0)) return 'Ese precio no parece válido. Ejemplo: "alerta eth >= 4000".';
  const dir = /(<=|<|baja|caye|debajo|menor)/i.test(text) ? 'below' : 'above';
  const a = await db.priceAlert.create({
    data: { coinId: coin.id, sym: coin.sym, dir, price, createdBy: createdBy || null },
  });
  return `⏰ Alerta creada: *${coin.sym} ${dir === 'above' ? '≥' : '≤'} ${money2(price)}*. Te aviso aquí en cuanto ocurra.`;
}

async function listAlerts(waId: string): Promise<string> {
  const alerts = await db.priceAlert.findMany({ where: { createdBy: waId }, orderBy: { createdAt: 'desc' }, take: 15 });
  if (!alerts.length) return 'No tienes alertas creadas. Crea una con: "alerta btc >= 120000".';
  const lines = alerts.map((a, i) => {
    const st = a.fired ? '🔥 activada' : a.on ? '👁 vigilando' : '💤 apagada';
    return `${i + 1}. *${a.sym} ${a.dir === 'above' ? '≥' : '≤'} ${money2(a.price)}* — ${st}`;
  });
  return `⏰ *Tus alertas*:\n${lines.join('\n')}\n\nBorra una con "borrar alerta 2".`;
}

async function deleteAlert(text: string, waId: string): Promise<string> {
  const n = parseInt(text.match(/(\d+)/)?.[1] || '0', 10);
  const alerts = await db.priceAlert.findMany({ where: { createdBy: waId }, orderBy: { createdAt: 'desc' } });
  if (!n || !alerts[n - 1]) return 'Dime qué alerta borrar, por ejemplo: "borrar alerta 1". Verlas: "alertas".';
  await db.priceAlert.delete({ where: { id: alerts[n - 1].id } });
  return `🗑 Alerta ${n} (${alerts[n - 1].sym}) borrada.`;
}

/* ---------- Recordatorios ---------- */
async function createReminder(text: string, waId: string, name?: string): Promise<string> {
  const m = text.match(/(?:recordar|recordatorio|recue?rdame)\s+(.+?)\s+(?:a las|@|a la[s]? )\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|h)?\s*(hoy|mañana|manana)?\s*(todos los dias|diario|todos los d[ií]as)?/i);
  if (!m) return 'No entendí el recordatorio. Ejemplos: "recordar llamar a Ana a las 15:00", "recordar gym a las 7 am mañana", "recordar tomar agua a las 9 todos los dias".';
  const what = m[1].trim();
  let hour = parseInt(m[2], 10);
  const min = parseInt(m[3] || '0', 10);
  const ampm = (m[4] || '').toLowerCase();
  const day = (m[5] || 'hoy').toLowerCase();
  const repeat = m[6] ? 'daily' : 'none';
  if (ampm === 'pm' && hour < 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  if (hour > 23 || min > 59) return 'Esa hora no parece válida. Ejemplo: "recordar llamar a Ana a las 15:30".';
  const when = new Date();
  when.setHours(hour, min, 0, 0);
  if (day.startsWith('mañana') || day.startsWith('manana')) when.setDate(when.getDate() + 1);
  else if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
  await db.scheduledJob.create({
    data: { kind: 'reminder', label: what.slice(0, 60), body: `⏰ *Recordatorio*: ${what}`, target: waId, when, repeat },
  });
  const dayTxt = repeat === 'daily' ? 'todos los días' : when.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
  return `✅ Listo, ${name || ''}. Te recuerdo *"${what}"* ${dayTxt} a las *${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}*.`;
}

/* ---------- Escalado a humano ---------- */
async function escalate(s: NovaSettings, waId: string, name: string, lastMsg: string): Promise<string> {
  const notice = `🔔 *Escalado a humano*\n${name} (${waId}) pidió hablar con una persona.\nÚltimo mensaje: "${lastMsg.slice(0, 200)}"\n\nPuedes responderle desde el dashboard → Conversaciones (el bot queda en pausa para este contacto).`;
  const r = await notifyOwner(s, notice, 'note');
  // v006: aviso push al dashboard del dueño (aunque WhatsApp no esté configurado)
  void pushAll({
    title: '🔔 Un contacto pide un humano',
    body: `${name}: "${lastMsg.slice(0, 90)}" — responde desde Conversaciones.`,
    url: '/#convos',
    tag: 'nova-escalate',
  }).catch(() => { /* sin suscripciones: se ignora */ });
  if (!r.ok && 'reason' in r && r.reason === 'sin ownerWa configurado') {
    return 'Quiero avisarle a una persona del equipo, pero todavía no hay un número configurado como responsable. Puedes indicarlo en el dashboard, sección Ajustes ("Número del dueño").';
  }
  return '👤 Ya avisé a una persona humana del equipo. Te escribirá aquí en cuanto pueda. Mientras tanto, ¿te ayudo con algo más?';
}

/* ---------- Pipeline principal ---------- */
export async function processInbound(msg: InboundMessage): Promise<EngineResult> {
  const t0 = Date.now();
  const s = await getSettings();
  const name = msg.name || msg.waId;

  // 1) Anti-spam
  const rate = await rateCheck(msg.waId);
  if (!rate.allowed) {
    return { handled: true, blocked: 'rate-limit', replies: [] };
  }

  // 2) Contacto + mensaje entrante
  const contact = await ensureContact(msg.waId, name, msg.channel);

  // 3) Audio → ASR
  let text = (msg.text || '').trim();
  const meta: Record<string, unknown> = { perMin: rate.perMin };

  // Botón/lista interactivo → comando equivalente
  const intentStatic: string | null = msg.interactiveId ? 'menu_boton' : null;
  if (msg.interactiveId) {
    const cmd = commandFromInteractive(msg.interactiveId);
    if (cmd) {
      text = cmd;
      meta.boton = msg.interactiveId;
    }
  }

  if (msg.kind === 'audio' && msg.audioBase64) {
    const ta = Date.now();
    const tr = await transcribeAudio(msg.audioBase64);
    meta.transcripcion = tr || '(no se pudo transcribir)';
    if (!tr) {
      await saveMessage(contact.id, 'user', 'audio', '🎤 (nota de voz)', meta);
      const reply = '🎧 Escuché tu nota de voz, pero no pude transcribirla. ¿Puedes escribírmelo como texto?';
      await deliverTo(s, msg.waId, name, reply, { intent: 'audio_asr', latencyMs: Date.now() - ta });
      return { handled: true, replies: [reply] };
    }
    text = tr;
  }

  await saveMessage(contact.id, 'user', msg.kind === 'audio' ? 'audio' : msg.kind === 'image' ? 'image' : 'text', text || (msg.kind === 'image' ? '🖼 (imagen)' : ''), meta);

  // 4) Imagen → VLM
  if (msg.kind === 'image' && msg.imageUrl) {
    const ti = Date.now();
    const desc = await describeImage(msg.imageUrl);
    const reply = desc ? `🖼 Vi tu imagen: ${desc}` : '🖼 Recibí tu imagen pero no pude analizarla en este momento.';
    await deliverTo(s, msg.waId, name, reply, { intent: 'imagen_vlm', latencyMs: Date.now() - ti });
    return { handled: true, replies: [reply] };
  }

  if (!text) return { handled: true, replies: [] };

  // 4.5) Modo humano: el dueño tomó esta conversación
  if (contact.botPaused) {
    const t = text.toLowerCase();
    if (/^(continuar|continua|reanudar|reanuda|activa(?:r)? (?:el )?bot|bot on|volver al bot|vuelve el bot)/.test(t)) {
      await db.contact.update({ where: { id: contact.id }, data: { botPaused: false } });
      const reply = `🤖 ¡Aquí estoy de nuevo, ${name}! Te atiendo como siempre.`;
      await deliverTo(s, msg.waId, name, reply, { intent: 'reactivar_bot', latencyMs: Date.now() - t0, list: MENU_LIST });
      await systemNote(contact.id, '🤖 Bot reactivado: NOVA responde automáticamente de nuevo.');
      return { handled: true, replies: [reply] };
    }
    await systemNote(contact.id, '👤 Modo humano activo: mensaje guardado. NOVA no responde automáticamente — el dueño puede contestar desde Conversaciones (o escribe "continuar" para volver con el bot).');
    return { handled: true, blocked: 'pausa-humano', replies: [] };
  }

  // 5) Modo horario
  if (!withinHours(s)) {
    if (shouldNoticeOutOfHours(msg.waId)) {
      const reply = OUT_OF_HOURS(s);
      await deliverTo(s, msg.waId, name, reply, { intent: 'fuera_horario' });
      await systemNote(contact.id, '🌙 Fuera de horario: aviso automático enviado (el mensaje quedó guardado).');
      return { handled: true, replies: [reply] };
    }
    await systemNote(contact.id, '🌙 Fuera de horario: mensaje guardado sin respuesta automática.');
    return { handled: true, blocked: 'fuera-de-horario', replies: [] };
  }

  // 6) Intenciones / comandos
  const t = text.toLowerCase();
  let reply: string | null = null;
  let intent = intentStatic || 'conversacion_ia';
  let opts: DeliverOpts = { intent };
  let shopCmd: ShopCommand | null = null;

  if (/^(ayuda|help|menu|menú|comandos|start)/.test(t) && t.length < 30) {
    intent = intentStatic || 'ayuda';
    reply = HELP;
    opts = { intent, buttons: MENU_BUTTONS, list: MENU_LIST };
  } else if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|qué tal|que tal)/.test(t) && t.length < 40) {
    intent = intentStatic || 'saludo';
    reply = `¡Hola, ${name}! 👋 Soy *NOVA*, tu agente personal. ¿Qué te ayudo a hacer hoy?`;
    opts = { intent, list: MENU_LIST };
  } else if ((shopCmd = parseShopCommand(t)) !== null) {
    // v007 — Tienda TiendaMax: antes de cripto para que "cuánto stock hay…" no la capture el precio
    const writeIntent = ['venta', 'reposicion', 'eliminacion', 'ajuste'].includes(shopCmd.intent);
    if (writeIntent && s.ownerWa && msg.waId !== s.ownerWa) {
      intent = `tienda_denegada`;
      reply = '🔒 La gestión de stock de la tienda (ventas, reposiciones, mermas) está reservada al dueño. Si eres tú, pon tu número en Ajustes → "Número del dueño" del dashboard.';
    } else {
      intent = `tienda_${shopCmd.intent}`;
      reply = await shopReply(s, text, shopCmd, 'voz');
    }
  } else if (/(trading)/.test(t) && /(activar?|enciende|encender|empezar|arrancar?|pausar?|apagar?|detener|parar?)\b/.test(t)) {
    // v010 — Trading: activar/pausar (solo el dueño)
    const isOn = /(activar?|enciende|encender|empezar|arrancar?)/.test(t);
    if (s.ownerWa && msg.waId !== s.ownerWa) {
      intent = 'trading_denegado';
      reply = '🔒 El módulo de trading solo lo controla el dueño. Si eres tú, pon tu número en Ajustes → "Número del dueño".';
    } else {
      await updateTradingCfg({ on: isOn });
      intent = isOn ? 'trading_activar' : 'trading_pausar';
      reply = (isOn ? '🤖 *Trading ACTIVADO*. ' : '⏸ *Trading pausado* (las posiciones abiertas conservan su stop-loss). ') + await tradingStatusText();
    }
  } else if (/estado\s+trading|^trading$|c[oó]mo va el trading|como va el trading/.test(t)) {
    intent = 'trading_estado';
    reply = await tradingStatusText();
  } else if (/resumen\s+(de\s+)?(operaciones|trading)|operaciones\s+(de\s+)?(trading|hoy)/.test(t)) {
    intent = 'trading_operaciones';
    reply = await tradesSummaryText();
  } else if (/^(comprar?|vender|vende)\s+/.test(t)) {
    // v010 — Orden manual (solo dueño; solo sim/testnet por seguridad)
    if (s.ownerWa && msg.waId !== s.ownerWa) {
      intent = 'trading_denegado';
      reply = '🔒 Las órdenes de trading solo las puede dar el dueño.';
    } else {
      const side = /^(comprar?)/.test(t) ? 'BUY' as const : 'SELL' as const;
      const coin = findCoin(t);
      if (!coin) {
        reply = 'Dime qué moneda, por ejemplo: "compra btc" o "vende eth". El importe es el tamaño de posición configurado en el panel → Trading.';
      } else {
        const symbol = `${coin.sym}USDT`;
        const r = await manualOrder(symbol, side);
        intent = `trading_manual_${side.toLowerCase()}`;
        reply = r.detail + '\n⚠️ Esto no es asesoría financiera.';
      }
    }
  } else if (/^(se[nñ]al|an[aá]lisis|analiza|analizar|analisar)\s+(de\s+)?/.test(t)) {
    // v010 — Señal técnica de un par
    intent = 'trading_senal';
    const coin = findCoin(t);
    if (!coin) {
      reply = 'Dime qué moneda analizar, por ejemplo: "señal btc" o "analiza sol".';
    } else if (['USDT', 'USDC', 'DAI'].includes(coin.sym)) {
      reply = `Las stablecoins como ${coin.sym} no se analizan: su precio es siempre ~1 USDT 😉`;
    } else {
      const symbol = `${coin.sym}USDT`;
      const sig = await getSignal(symbol);
      reply = sig
        ? `📈 *${symbol}*\nSeñal: *${sig.action.toUpperCase()}* (score ${sig.score}, confianza ${sig.confidence}%)\n${sig.breakdown.join('\n')}\nPrecio: ${money2(sig.price)}\n⚠️ No es asesoría financiera — decide tú.`
        : `Ahora mismo no puedo calcular la señal de ${symbol} (sin conexión con Binance). Prueba en unos minutos 🙏`;
    }
  } else if (/evalua(?:r)? (?:el )?trading|revisa (?:el )?trading ahora/.test(t)) {
    // v010 — Ciclo manual del motor
    if (s.ownerWa && msg.waId !== s.ownerWa) {
      intent = 'trading_denegado';
      reply = '🔒 Solo el dueño puede pedir una evaluación del motor.';
    } else {
      const cfg = await getTradingCfg();
      if (!cfg.on) {
        reply = 'El motor está pausado. Actívalo con "activar trading" y volverá a evaluar cada ciclo.';
      } else {
        const symbols = cfg.symbols.split(',');
        intent = 'trading_eval';
        const outs: string[] = [];
        for (const s2 of symbols.slice(0, 5)) {
          const r = await evaluateSymbol(s2.trim());
          outs.push(r.detail);
        }
        reply = `🤖 Evaluación completada:\n${outs.join('\n')}`;
      }
    }
  } else if (/^(precio|cu[aá]nto|cotizaci[oó]n|valor)/.test(t) || /precio de|cuanto vale|cuánto vale/.test(t)) {
    intent = 'precio';
    const coin = findCoin(t);
    reply = coin ? await replyPrecio(coin) : 'Dime qué moneda, por ejemplo: "precio btc". Catálogo: btc, eth, sol, ada, xrp, bnb y más.';
  } else if (/(^| )(top|mejores|suben)( |$)|top \d+/.test(t)) {
    intent = 'top';
    reply = await replyTop();
  } else if (/portafolio|mis criptos|cuanto tengo|cuánto tengo/.test(t)) {
    intent = 'portafolio';
    reply = await replyPortafolio();
  } else if (/(resumen|como va el mercado|cómo va el mercado)/.test(t)) {
    intent = 'resumen';
    reply = await replyResumen();
  } else if (/^alertas?$|^mis alertas|ver alertas/.test(t) && !/(borrar|quita|crea|>=|<=)/.test(t)) {
    intent = 'alertas_listar';
    reply = await listAlerts(msg.waId);
  } else if (/(borrar|quita|elimina).*(alerta)/.test(t)) {
    intent = 'alertas_borrar';
    reply = await deleteAlert(t, msg.waId);
  } else if (/(alerta|vigila|avisa)/.test(t) && /(\d)/.test(t)) {
    intent = 'alerta_crear';
    reply = await createAlert(t, msg.waId);
  } else if (/(recordar|recu[eé]rdame|recordatorio)/.test(t)) {
    intent = 'recordatorio';
    reply = await createReminder(t, msg.waId, name);
  } else if (/(humano|persona real|operador|hablar con alguien|atenci[oó]n humana)/.test(t)) {
    intent = 'humano';
    reply = await escalate(s, msg.waId, name, text);
  } else {
    const fx = parseFxIntent(t);
    if (fx) {
      intent = 'divisas';
      const r = await convertCurrency(fx.amount, fx.from, fx.to);
      reply = r.ok
        ? formatFxReply(r)
        : r.reason === 'sin-red'
          ? '💱 No pude obtener el tipo de cambio ahora mismo (sin conexión a la API de divisas). Prueba en unos minutos.'
          : '💱 No reconocí alguna de las divisas. Ejemplos: "100 usd a mxn", "50 eur a gbp", "200 pesos mexicanos a dolares".';
    } else if (/(gracias|thank)/.test(t) && t.length < 25) {
      intent = 'gracias';
      reply = `¡Con gusto, ${name}! 😊 Aquí estoy cuando me necesites.`;
    }
  }

  // 7) Fallback → IA conversacional
  if (!reply) {
    const history = await db.message.findMany({
      where: { contactId: contact.id, role: { in: ['user', 'agent'] } },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });
    const { rows } = await getPrices();
    const ai = await aiReply({
      persona: s.persona,
      history: history.reverse().map(m => ({ role: m.role as 'user' | 'agent', body: m.body })),
      userText: text,
      rows,
      aiEnabled: s.aiEnabled,
      contactName: name,
    });
    if (ai) {
      if (ai.escalate) { intent = 'humano'; reply = await escalate(s, msg.waId, name, text); }
      else reply = ai.text;
    } else {
      reply = 'Ahora mismo estoy con capacidad limitada 🤖. Puedo ayudarte con cripto ("precio btc"), divisas ("100 usd a mxn"), recordatorios ("recordar X a las 9") o escribir *ayuda* para ver más.';
    }
  }

  // 8) Entregar respuesta (con métricas de intención y latencia)
  opts = { ...opts, intent, latencyMs: Date.now() - t0 };
  const r = await deliverTo(s, msg.waId, name, reply, opts);
  if (!r.delivered && r.error) {
    await systemNote(contact.id, `⚠️ No se pudo enviar por WhatsApp real: ${r.error}`);
  }
  return { handled: true, replies: [reply] };
}

/* Procesa media entrante del webhook real (Cloud API) */
export async function processWaWebhookValue(value: {
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: Array<Record<string, unknown>>;
  statuses?: unknown[];
}): Promise<number> {
  let count = 0;
  for (const m of value.messages || []) {
    const from = String(m.from || '');
    const profileName = value.contacts?.[0]?.profile?.name;
    const type = String(m.type || 'text');
    let inbound: InboundMessage | null = null;
    if (type === 'text') {
      inbound = { waId: from, name: profileName, channel: 'whatsapp', kind: 'text', text: String((m.text as { body?: string })?.body || '') };
    } else if (type === 'interactive') {
      // v004: respuesta a botones o listas — el payload trae el id que definimos
      const inter = m.interactive as { button_reply?: { id?: string }; list_reply?: { id?: string } } | undefined;
      const bid = inter?.button_reply?.id || inter?.list_reply?.id;
      if (bid) inbound = { waId: from, name: profileName, channel: 'whatsapp', kind: 'text', interactiveId: bid };
    } else if (type === 'audio' || type === 'voice') {
      const mediaId = String((m.audio as { id?: string })?.id || (m.voice as { id?: string })?.id || '');
      const s = await getSettings();
      const media = mediaId ? await fetchWaMedia(mediaId, s) : null;
      inbound = { waId: from, name: profileName, channel: 'whatsapp', kind: 'audio', audioBase64: media?.base64 };
    } else if (type === 'image') {
      const mediaId = String((m.image as { id?: string })?.id || '');
      const s = await getSettings();
      const media = mediaId ? await fetchWaMedia(mediaId, s) : null;
      if (media) {
        inbound = { waId: from, name: profileName, channel: 'whatsapp', kind: 'image', imageUrl: `data:${media.mime};base64,${media.base64}` };
      }
    }
    if (inbound) {
      await processInbound(inbound);
      count++;
    }
  }
  return count;
}

export { CATALOG, symOf, nameOf };
