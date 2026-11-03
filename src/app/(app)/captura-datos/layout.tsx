"use client";

import { ShieldAlert } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";

// Solo admin (permiso verCapturaDatos): quien no lo tenga ve este aviso aunque entre directo por URL.
export default function CapturaDatosLayout({ children }: { children: React.ReactNode }) {
  const { usuario } = useSesion();

  if (!usuario || !tienePermiso(usuario.rol, "verCapturaDatos")) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-silver bg-surface px-6 py-16 text-center">
        <ShieldAlert className="h-8 w-8 text-muted" strokeWidth={1.5} />
        <h1 className="text-base font-medium text-foreground">Captura de Datos</h1>
        <p className="text-sm text-muted">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  return <>{children}</>;
}
