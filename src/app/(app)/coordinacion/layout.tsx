"use client";

import { Construction } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";

// Workspace solo-admin (permiso verCoordinacion) — quien no lo tenga ve
// este aviso en vez del contenido, aunque entre directo por URL (el
// Sidebar ya ni le muestra el workspace, esto es la segunda barrera).
export default function CoordinacionLayout({ children }: { children: React.ReactNode }) {
  const { usuario } = useSesion();

  if (!usuario || !tienePermiso(usuario.rol, "verCoordinacion")) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-silver bg-surface px-6 py-16 text-center">
        <Construction className="h-8 w-8 text-muted" strokeWidth={1.5} />
        <h1 className="text-base font-medium text-foreground">Coordinación Académica</h1>
        <p className="text-sm text-muted">No tienes acceso a esta sección.</p>
      </div>
    );
  }

  return <>{children}</>;
}
