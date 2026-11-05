"use client";

import { Loader2, Unlock } from "lucide-react";
import type { ProgresoPersonas } from "@/lib/captura-datos/colaboracion";

const CHIP = "rounded-full px-2.5 py-1 text-xs font-medium";

interface Props {
  progreso: ProgresoPersonas;
  misEnEdicion: number;
  abierto: boolean;
  liberando: boolean;
  onLiberar: () => void;
}

export function BarraColaboracion({ progreso, misEnEdicion, abierto, liberando, onLiberar }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-label="Avance por persona" className="flex flex-wrap items-center gap-1.5">
        <span className={`${CHIP} bg-primary/10 text-primary`}>Tú {progreso.tuyas}</span>
        {progreso.otras.map((p) => <span key={p.id} className={`${CHIP} bg-silver/40 text-foreground`}>{p.nombre} {p.confirmadas}</span>)}
        <span className={`${CHIP} bg-orange-500/10 text-orange-700`}>Pendientes {progreso.pendientes}</span>
      </span>
      {abierto && (
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {misEnEdicion > 0 && (
            <button onClick={onLiberar} disabled={liberando} className="inline-flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
              {liberando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Liberar mis hojas ({misEnEdicion})
            </button>
          )}
        </span>
      )}
    </div>
  );
}
