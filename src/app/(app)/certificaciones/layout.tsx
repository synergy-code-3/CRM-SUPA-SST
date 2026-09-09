"use client";

import { Construction } from "lucide-react";
import { useSesion } from "@/lib/session-context";

// Compuerta temporal mientras se construye esta sección — solo admin ve el
// trabajo en progreso, coordinador/abeja ven este placeholder. Se quita
// (este archivo completo) en el commit que da por terminada Certificaciones.
export default function CertificacionesLayout({ children }: { children: React.ReactNode }) {
  const { usuario } = useSesion();

  if (usuario?.rol !== "admin") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
        <Construction className="h-10 w-10 text-muted" strokeWidth={1.5} />
        <h1 className="text-lg font-semibold text-foreground">Certificaciones — en construcción</h1>
        <p className="max-w-sm text-sm text-muted">Estamos armando esta sección. Vuelve pronto.</p>
      </div>
    );
  }

  return <>{children}</>;
}
