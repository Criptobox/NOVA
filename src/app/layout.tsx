import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

/* v008 — Tipografías: Inter (texto) + Space Grotesk (títulos/números) */
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "NOVA — Agente WhatsApp + Cripto",
  description:
    "NOVA v008: agente inteligente para WhatsApp (API oficial, gratis y sin riesgo) con cripto en datos reales, control por voz de tu tienda (eliminar stock, reponer, ventas), cerebro neuronal en vivo, exportación CSV, avisos push al pedir un humano y dashboard PWA con actualización automática.",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.variable} ${grotesk.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
