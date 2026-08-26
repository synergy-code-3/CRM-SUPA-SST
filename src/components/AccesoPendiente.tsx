"use client";

import Image from "next/image";
import { useEffect } from "react";
import { Clock } from "lucide-react";
import { useSesion } from "@/lib/session-context";

const INTERVALO_REVISION_MS = 5 * 1000;

// Se muestra en vez del CRM completo (Sidebar + páginas) cuando hay sesión
// pero la cuenta todavía no fue aprobada por un admin (usuario.activo ===
// false) — ver AppLayout. Reemplaza el viejo flujo donde el autoregistro
// simplemente no dejaba entrar: ahora sí entra, pero no ve nada del CRM
// hasta que un admin lo active desde Usuarios.
export function AccesoPendiente() {
  const { usuario, cerrarSesion, refrescar } = useSesion();

  // El refresco normal de la sesión es cada 5 minutos — alguien esperando
  // aquí a que lo activen no debería tener que recargar la página para
  // enterarse. Se revisa cada pocos segundos mientras esta pantalla está
  // montada; en cuanto un admin activa la cuenta, AppLayout deja de
  // mostrarla solo (usuario.activo pasa a true en el próximo refrescar()).
  useEffect(() => {
    const intervalo = setInterval(refrescar, INTERVALO_REVISION_MS);
    return () => clearInterval(intervalo);
  }, [refrescar]);

  if (!usuario) return null;

  return (
    <div className="bg-brand bg-dots fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto px-6 py-[calc(2rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core flex flex-col items-center rounded-[calc(2rem-0.5rem)] p-8 text-center">
          <div className="relative h-16 w-16">
            <div className="absolute inset-0 rounded-full bg-warning/25 blur-lg" aria-hidden="true" />
            <Image
              src="/icons/icon-192.png"
              alt="CRM CS"
              width={64}
              height={64}
              className="relative h-16 w-16 rounded-2xl"
              priority
            />
          </div>

          <span className="mt-5 inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            Acceso pendiente
          </span>

          <h1 className="mt-4 text-lg font-semibold text-foreground">¡Ya casi, {usuario.nombre.split(" ")[0]}!</h1>
          <p className="mt-2 text-sm text-muted">
            Tu cuenta ({usuario.email}) ya está creada, pero un administrador de la plataforma todavía tiene que
            darte acceso al contenido. Avísale para que te active desde Usuarios — en cuanto lo haga, vas a poder
            entrar sin hacer nada más.
          </p>

          <button
            onClick={cerrarSesion}
            className="ease-spring mt-6 w-full rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-muted transition hover:text-foreground"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
