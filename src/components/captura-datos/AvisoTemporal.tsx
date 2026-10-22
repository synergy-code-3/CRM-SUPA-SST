"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const DURACION_MS = 8000;
const TICK_MS = 100;

interface AvisoTemporalProps {
  /** El aviso se quita solo; se llama con él al terminar el tiempo o al darle a la X. */
  onCerrar: () => void;
  peligro?: boolean;
  duracionMs?: number;
  children: React.ReactNode;
}

/** Aviso con cuenta regresiva: la barra se vacía, se pausa con el cursor encima y se puede cerrar con la X. */
export function AvisoTemporal({ onCerrar, peligro, duracionMs = DURACION_MS, children }: AvisoTemporalProps) {
  const [restante, setRestante] = useState(duracionMs);
  const [pausado, setPausado] = useState(false);
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setRestante((r) => Math.max(0, r - TICK_MS)), TICK_MS);
    return () => clearInterval(t);
  }, [pausado]);

  useEffect(() => {
    if (restante === 0) alCerrar.current();
  }, [restante]);

  const colores = peligro ? "border-danger/30 bg-danger/10 text-danger" : "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return (
    <div
      role={peligro ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className={`relative overflow-hidden rounded-lg border text-sm ${colores}`}
    >
      <div className="flex items-start gap-2 px-3 py-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span className="flex-1">{children}</span>
        <span className="mt-0.5 text-xs tabular-nums opacity-70" aria-hidden="true">{Math.ceil(restante / 1000)} s{pausado ? " ⏸" : ""}</span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="rounded p-0.5 hover:bg-black/10">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="h-1 bg-black/10" aria-hidden="true">
        <div className="h-full bg-current opacity-60 transition-[width] duration-100 ease-linear" style={{ width: `${(restante / duracionMs) * 100}%` }} />
      </div>
    </div>
  );
}
