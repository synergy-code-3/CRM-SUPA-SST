"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

const DURACION_MS = 8000;
const TICK_MS = 100;
const ID_CONTENEDOR = "avisos-captura-datos";

/**
 * Contenedor fijo arriba de la ventana donde se apilan los avisos. Se crea una sola vez y fuera de cualquier panel
 * (con scroll u overflow), para que el aviso siempre se vea y quede por encima de los modales (z-50).
 */
function contenedorDeAvisos(): HTMLElement {
  let el = document.getElementById(ID_CONTENEDOR);
  if (!el) {
    el = document.createElement("div");
    el.id = ID_CONTENEDOR;
    el.className = "pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4";
    document.body.appendChild(el);
  }
  return el;
}
const sinSuscripcion = () => () => {};

interface AvisoTemporalProps {
  /** El aviso se quita solo; se llama con él al terminar el tiempo o al darle a la X. */
  onCerrar: () => void;
  peligro?: boolean;
  /** Aviso de éxito (verde). */
  positivo?: boolean;
  duracionMs?: number;
  children: React.ReactNode;
}

/**
 * Aviso emergente (arriba de la ventana) con cuenta regresiva: la barra se vacía, se pausa con el cursor encima y se
 * puede cerrar con la X.
 */
export function AvisoTemporal({ onCerrar, peligro, positivo, duracionMs = DURACION_MS, children }: AvisoTemporalProps) {
  const [restante, setRestante] = useState(duracionMs);
  const [pausado, setPausado] = useState(false);
  const alCerrar = useRef(onCerrar);
  alCerrar.current = onCerrar;
  // En el servidor no hay documento: ahí no se dibuja nada, y en el navegador se dibuja en el contenedor fijo.
  const destino = useSyncExternalStore(sinSuscripcion, contenedorDeAvisos, () => null);

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setRestante((r) => Math.max(0, r - TICK_MS)), TICK_MS);
    return () => clearInterval(t);
  }, [pausado]);

  useEffect(() => {
    if (restante === 0) alCerrar.current();
  }, [restante]);

  if (!destino) return null;

  const colores = peligro ? "border-danger/30 bg-danger/10 text-danger" : positivo ? "border-success/30 bg-success/10 text-success" : "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return createPortal(
    // Capa sólida debajo del color translúcido: flotando sobre la pantalla el texto debe leerse bien.
    <div
      role={peligro ? "alert" : "status"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="pointer-events-auto w-full max-w-md overflow-hidden rounded-lg bg-surface shadow-lg"
    >
      <div className={`relative overflow-hidden rounded-lg border text-sm ${colores}`}>
        <div className="flex items-start gap-2 px-3 py-2">
          {positivo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
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
    </div>,
    destino
  );
}
