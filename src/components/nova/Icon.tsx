'use client';

/* NOVA v006 — Set de iconos SVG de trazo (24×24, stroke 1.8).
   Reemplaza los glifos de texto por iconos consistentes y nítidos. */
import type { CSSProperties } from 'react';

export type IconName =
  | 'home' | 'brain' | 'chat' | 'coins' | 'chart' | 'clock' | 'gear'
  | 'download' | 'bell' | 'bellOn' | 'user' | 'shield' | 'bolt' | 'check';

const PATHS: Record<IconName, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-8.5Z" />,
  brain: (
    <>
      <path d="M12 5.2c-1-1.5-3.4-1.8-4.7-.5C5.6 4.5 4 6 4.2 8c-1.2.8-1.6 2.5-.8 3.7-.9 1.2-.6 3 .6 3.9 0 1.7 1.4 3 3.1 2.9.8 1.2 2.5 1.5 3.6.7.5-.3.8-.7 1.3-1.2V5.2Z" />
      <path d="M12 5.2c1-1.5 3.4-1.8 4.7-.5 1.7-.2 3.3 1.3 3.1 3.3 1.2.8 1.6 2.5.8 3.7.9 1.2.6 3-.6 3.9 0 1.7-1.4 3-3.1 2.9-.8 1.2-2.5 1.5-3.6.7-.5-.3-.8-.7-1.3-1.2V5.2Z" />
      <path d="M8.6 8.4c.9.3 1.6 1 1.7 2M14.9 8l-1.3 2.5m3.8-.2c-.9.3-1.9 0-2.5-.7M8.2 13.6c1 .1 1.9.8 2.1 1.8m5.4-2.2c-.8.5-1.2 1.4-1.1 2.3" />
    </>
  ),
  chat: <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-4.1 3.4A.6.6 0 0 1 4 20V6Z" />,
  coins: (
    <>
      <ellipse cx="9" cy="7.5" rx="5.5" ry="2.8" />
      <path d="M3.5 7.5v4c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-4" />
      <path d="M14.5 9.6c3 .1 6 1.3 6 2.9v4c0 1.5-2.5 2.8-5.5 2.8S9.5 18 9.5 16.5v-2" />
    </>
  ),
  chart: <path d="M4 4v15a1 1 0 0 0 1 1h15M8 15l3.5-4 3 2.5L19 8" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.6l1 2.1a6.6 6.6 0 0 1 2.2.9l2.3-.6 1.4 2.4-1.5 1.8a6.8 6.8 0 0 1 0 2.4l1.5 1.8-1.4 2.4-2.3-.6a6.6 6.6 0 0 1-2.2.9l-1 2.3h-.1l-1-2.3a6.6 6.6 0 0 1-2.2-.9l-2.3.6-1.4-2.4 1.5-1.8a6.8 6.8 0 0 1 0-2.4L5 8.4l1.4-2.4 2.3.6a6.6 6.6 0 0 1 2.2-.9l1-2.1Z" />
    </>
  ),
  download: <path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" />,
  bell: <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5a.5.5 0 0 1-.4.8H4.9a.5.5 0 0 1-.4-.8L6 16Zm4 3.3a2.2 2.2 0 0 0 4 0" />,
  bellOn: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2.5a.5.5 0 0 1-.4.8H4.9a.5.5 0 0 1-.4-.8L6 16Zm4 3.3a2.2 2.2 0 0 0 4 0" />
      <path d="M18.5 3.5 20 5m0-1.5L18.5 5M4.7 3.9 6 5.2m0-1.3L4.7 5.2" opacity=".8" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  shield: <path d="M12 3.5 5.5 6v5.2c0 4.3 2.8 7.4 6.5 9.3 3.7-1.9 6.5-5 6.5-9.3V6L12 3.5Z" />,
  bolt: <path d="M13 3 5.5 13.5h5L11 21l7.5-10.5h-5L13 3Z" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
};

export function Icon({ name, size = 18, style, className }: {
  name: IconName; size?: number; style?: CSSProperties; className?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" style={style} className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
