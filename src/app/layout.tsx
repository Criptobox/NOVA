import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/* v008 — Tipografías: Inter (texto) + Space Grotesk (títulos/números) */
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "NOVA — Agente WhatsApp + Cripto",
  description:
    "NOVA v013: agente inteligente para WhatsApp (API oficial, gratis y sin riesgo) con cripto en datos reales, control por voz de tu tienda, trading automatizado en modo simulación, modo offline con comandos locales, cerebro neuronal en vivo, CSV y avisos push. Listo para GitHub + Vercel (todo dentro de Vercel: base de datos integrada, cron nativo y modo offline).",
  applicationName: "NOVA",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "NOVA",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#030711",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* v013 — Tema claro/oscuro: se aplica ANTES de pintar para evitar parpadeos.
   Orden: localStorage · nova:theme → prefers-color-scheme → oscuro. */
const THEME_INIT = `(function(){try{var t=localStorage.getItem('nova:theme');if(t!=='light'&&t!=='dark'){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';}document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'#f4f1e9':'#030711');}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${grotesk.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
