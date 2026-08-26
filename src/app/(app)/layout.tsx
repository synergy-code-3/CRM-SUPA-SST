"use client";

import { Sidebar } from "@/components/Sidebar";
import { AccesoPendiente } from "@/components/AccesoPendiente";
import { FiltrosMovilProvider } from "@/lib/filtros-movil-context";
import { useSesion } from "@/lib/session-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useSesion();

  // Igual que antes: mientras se resuelve la sesión (o si no hay ninguna —
  // el middleware ya redirigió a /login en ese caso) no se monta nada del
  // CRM, para no disparar de más las llamadas a la API de cada página.
  if (cargando || !usuario) return null;

  // Cuenta pendiente de aprobación: ni Sidebar ni el contenido de la
  // página se montan — solo la pantalla de "acceso pendiente".
  if (!usuario.activo) return <AccesoPendiente />;

  return (
    <FiltrosMovilProvider>
      <div className="flex min-h-screen flex-col bg-background bg-mesh md:flex-row">
        <Sidebar />
        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 md:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </FiltrosMovilProvider>
  );
}
