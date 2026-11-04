"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

const BOTON = "inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm disabled:opacity-50";

/** Anterior / Siguiente con "Página x de y"; no se muestra si todo cabe en una página. */
export function Paginador({ pagina, paginas, total, onCambio }: { pagina: number; paginas: number; total: number; onCambio: (pagina: number) => void }) {
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <button onClick={() => onCambio(pagina - 1)} disabled={pagina === 0} className={BOTON}><ChevronLeft className="h-4 w-4" /> Anterior</button>
      <span className="text-xs text-muted">Página {pagina + 1} de {paginas} · {total} en total</span>
      <button onClick={() => onCambio(pagina + 1)} disabled={pagina >= paginas - 1} className={BOTON}>Siguiente <ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}
