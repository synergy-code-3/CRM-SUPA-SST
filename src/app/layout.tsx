import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/lib/session-context";
import { TemaProvider } from "@/lib/theme-context";
import { PwaRegister } from "@/components/PwaRegister";

// Corre antes de la hidratación para que <html> ya tenga el data-theme
// correcto en el primer pintado — si esto se hiciera en un useEffect de
// TemaProvider, se vería un parpadeo claro→oscuro al cargar.
const SCRIPT_TEMA_INICIAL = `
try {
  var t = localStorage.getItem("crm-tema");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CRM CS",
  description: "CRM de Club Sinergético — clientes, accesos y actividad.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CRM CS",
  },
};

// viewportFit: "cover" es lo que permite que la app se dibuje debajo del
// notch/Dynamic Island (pantalla completa) en vez de solo hasta el borde
// seguro — a cambio, el propio layout tiene que dejarle espacio de verdad
// con env(safe-area-inset-*) (ver globals.css y Sidebar.tsx) para que nada
// quede tapado por el notch.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a2a6e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} noise antialiased`}>
        <PwaRegister />
        <TemaProvider>
          <SessionProvider>{children}</SessionProvider>
        </TemaProvider>
      </body>
    </html>
  );
}
