'use client';

/* NOVA v006 — El Cerebro: sustituye a la esfera.
   · Silueta de cerebro con red neuronal interna (nodos + conexiones con flujo)
   · Neuronas satélite alrededor conectadas por sinapsis con impulsos viajeros
   · El color de la actividad cambia según el estado del agente
   (en espera · detectando · escuchando · pensando · respondiendo · ejecutando) */

export type OrbState = 'standby' | 'detectando' | 'escuchando' | 'pensando' | 'hablando' | 'ejecutando';

export const STATE_TEXT: Record<OrbState, { t: string; s: string }> = {
  standby: { t: 'En vigilancia', s: 'NOVA observa tus canales 24/7. Habla con el simulador o espera mensajes reales de WhatsApp.' },
  detectando: { t: 'Mensaje detectado', s: 'Analizando el contenido y la intención del mensaje entrante…' },
  escuchando: { t: 'Escuchando', s: 'Dictado continuo activo: cada frase que dices se convierte en un comando.' },
  pensando: { t: 'Procesando', s: 'Consultando memoria, mercado cripto y herramientas del agente…' },
  hablando: { t: 'Respondiendo', s: 'Enviando la respuesta al usuario por WhatsApp, gratis y por la vía oficial.' },
  ejecutando: { t: 'Ejecutando', s: 'Creando alertas, programando recordatorios o avisando al equipo humano.' },
};

/* ---------- Geometría del cerebro ---------- */
const BRAIN_D =
  'M 120 34 C 100 22 72 26 60 44 C 40 46 28 64 32 82 C 20 94 18 116 28 130 ' +
  'C 24 150 36 168 56 172 C 62 188 80 198 98 192 C 106 200 120 202 130 196 ' +
  'L 138 194 C 140 206 150 214 162 212 C 174 210 182 200 178 188 ' +
  'C 192 180 200 164 196 148 C 210 136 214 112 204 98 C 210 78 198 58 178 52 ' +
  'C 168 36 140 26 120 34 Z';

const GYRI = [
  'M 52 84 C 66 74 80 84 92 74',
  'M 100 52 C 108 66 128 62 134 76',
  'M 48 124 C 64 116 76 130 92 122',
  'M 104 148 C 118 138 134 148 148 138',
  'M 150 96 C 162 88 176 96 186 88',
  'M 146 198 C 154 190 166 190 174 196',
];

const NODES: [number, number, number][] = [
  // x, y, r
  [64, 86, 3], [96, 66, 3], [134, 60, 3.5], [172, 74, 3], [188, 104, 3],
  [178, 140, 3], [150, 166, 3], [112, 178, 3], [74, 152, 3],
  [100, 112, 4.5], [140, 116, 5], [66, 120, 3],
];

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 0],
  [0, 9], [1, 9], [8, 9], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10],
  [9, 10], [11, 9], [11, 8], [11, 0],
];

/* Neuronas satélite alrededor: x, y, ancla en el borde del cerebro, dirección, duración, retardo */
const SATS = [
  { x: 30, y: 34, ax: 54, ay: 56, out: true, dur: 3.2, delay: 0 },
  { x: 128, y: 8, ax: 124, ay: 30, out: false, dur: 3.8, delay: 0.6 },
  { x: 230, y: 50, ax: 196, ay: 68, out: true, dur: 3.4, delay: 1.1 },
  { x: 248, y: 128, ax: 209, ay: 124, out: false, dur: 3.0, delay: 0.3 },
  { x: 224, y: 210, ax: 186, ay: 184, out: true, dur: 3.6, delay: 1.6 },
  { x: 128, y: 234, ax: 124, ay: 198, out: false, dur: 3.3, delay: 0.9 },
  { x: 32, y: 208, ax: 56, ay: 176, out: true, dur: 3.5, delay: 0.4 },
  { x: 10, y: 120, ax: 26, ay: 122, out: false, dur: 3.1, delay: 1.3 },
];

export function NeuroBrain({ state }: { state: OrbState }) {
  return (
    <svg
      className={`brain b-${state}`}
      viewBox="0 0 260 244"
      role="img"
      aria-label={`Cerebro neuronal de NOVA — estado: ${STATE_TEXT[state].t}`}
    >
      <defs>
        <radialGradient id="brainFill" cx="36%" cy="30%" r="85%">
          <stop offset="0%" stopColor="rgba(120,220,255,.17)" />
          <stop offset="55%" stopColor="rgba(80,112,255,.10)" />
          <stop offset="100%" stopColor="rgba(12,22,52,.03)" />
        </radialGradient>
      </defs>

      {/* Sinapsis hacia las neuronas satélite */}
      <g className="n-syns">
        {SATS.map((s, i) => (
          <line key={`syn${i}`} className="n-syn" x1={s.ax} y1={s.ay} x2={s.x} y2={s.y} />
        ))}
      </g>

      {/* Impulsos viajeros por las sinapsis */}
      <g className="n-pulses">
        {SATS.map((s, i) => (
          <circle key={`pl${i}`} className="n-pulse" r="2.3">
            <animateMotion
              dur={`${s.dur}s`}
              begin={`${s.delay}s`}
              repeatCount="indefinite"
              path={s.out ? `M ${s.ax} ${s.ay} L ${s.x} ${s.y}` : `M ${s.x} ${s.y} L ${s.ax} ${s.ay}`}
            />
          </circle>
        ))}
      </g>

      {/* Silueta del cerebro */}
      <path className="n-body" d={BRAIN_D} />
      <g className="n-gyri">
        {GYRI.map((d, i) => <path key={`g${i}`} className="n-gyrus" d={d} />)}
      </g>

      {/* Red neuronal interna */}
      <g className="n-net">
        {EDGES.map(([a, b], i) => (
          <line
            key={`e${i}`} className="n-edge"
            x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]}
            style={{ animationDelay: `${(i % 5) * 0.32}s` }}
          />
        ))}
        {NODES.map(([x, y, r], i) => (
          <circle
            key={`n${i}`} className="n-node" cx={x} cy={y} r={r}
            style={{ animationDelay: `${(i % 6) * 0.45}s` }}
          />
        ))}
      </g>

      {/* Neuronas satélite alrededor */}
      <g className="n-sats">
        {SATS.map((s, i) => (
          <g key={`sat${i}`} className="n-satg">
            <circle className="n-satring" cx={s.x} cy={s.y} r="7" style={{ animationDelay: `${s.delay}s` }} />
            <circle className="n-sat" cx={s.x} cy={s.y} r="3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export function Hero({ state }: { state: OrbState }) {
  const st = STATE_TEXT[state];
  return (
    <div className="hero-inner">
      <div className={`brain-stage b-${state}`}>
        <NeuroBrain state={state} />
      </div>
      <div className="state">
        <strong>{st.t}</strong>
        <p>{st.s}</p>
      </div>
      <div className="wake">Agente WhatsApp · <b>API oficial · gratis</b> · sin riesgo</div>
    </div>
  );
}
