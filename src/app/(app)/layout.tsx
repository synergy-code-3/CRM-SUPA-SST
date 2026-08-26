"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { AccesoPendiente } from "@/components/AccesoPendiente";
import { FiltrosMovilProvider } from "@/lib/filtros-movil-context";
import { useSesion } from "@/lib/session-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { usuario, cargando } = useSesion();
  const router = useRouter();

  // El middleware solo garantiza que el JWT es válido en el momento de
  // cargar la página — si la sesión se invalida DESPUÉS (token_version
  // cambió, la cuenta se borró, etc.), /api/auth/me empieza a devolver 401
  // y usuario se queda en null sin que el middleware se entere (ya no hay
  // ninguna petición de página de por medio para que la intercepte). Sin
  // este redirect, la pantalla se quedaba en blanco para siempre en vez de
  // mandar de vuelta a /login.
  useEffect(() => {
    if (!cargando && !usuario) router.replace("/login");
  }, [cargando, usuario, router]);

  // Mientras se resuelve la sesión (o mientras el redirect de arriba
  // termina de disparar) no se monta nada del CRM, para no llamar a la API
  // de cada página con una sesión que ya sabemos que no sirve.
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
