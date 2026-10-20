"use client";

import { Construction } from "lucide-react";
import { useSesion } from "@/lib/session-context";

// Mientras se construye la sección de verdad, solo admin ve el contenido
// real — coordinador/abeja ven este placeholder. Quitar este gate (dejar
// pasar a todos los roles) es la señal de que la sección ya está lista.
// Mismo criterio que Community Manager (ver su layout.tsx).
export default function CapturaDatosLayout({ children }: { children: React.ReactNode }) {
  const { usuario } = useSesion();

  if (usuario?.rol !== "admin") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-silver bg-surface px-6 py-16 text-center">
        <Construction className="h-8 w-8 text-muted" strokeWidth={1.5} />
        <h1 className="text-base font-medium text-foreground">Captura de Datos</h1>
        <p className="text-sm text-muted">Esta sección está en construcción.</p>
      </div>
    );
  }

  return <>{children}</>;
}
