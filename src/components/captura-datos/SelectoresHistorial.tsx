"use client";

import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/captura-datos/cliente";
import { useSesion } from "@/lib/session-context";
import { useDatosEnCache } from "@/lib/captura-datos/useDatosEnCache";

export const CAMPO = "rounded-lg border border-silver bg-surface px-3 py-1.5 text-sm";

export interface OpcionesHistorial {
  eventos: { id: string; nombre: string }[];
  admins: { id: string; nombre: string }[];
}

/** Eventos existentes y admins para los filtros (se piden una vez por pestaña). */
export function useOpcionesHistorial(): OpcionesHistorial | null {
  const { usuario } = useSesion();
  return useDatosEnCache<OpcionesHistorial>(usuario?.id, "historial:opciones", () => api<OpcionesHistorial>("/api/captura-datos/historial/opciones")).datos;
}

export function SelectorLista({ valor, onCambio, opciones, todas, etiqueta }: { valor: string; onCambio: (v: string) => void; opciones: { id: string; nombre: string }[]; todas: string; etiqueta: string }) {
  return (
    <select value={valor} onChange={(e) => onCambio(e.target.value)} aria-label={etiqueta} className={`${CAMPO} w-44 max-w-full`}>
      <option value="">{todas}</option>
      {opciones.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
    </select>
  );
}

export function SelectorMultiple<T extends string>({ valores, onCambio, opciones, etiqueta }: { valores: T[]; onCambio: (v: T[]) => void; opciones: { id: T; nombre: string }[]; etiqueta: string }) {
  const alternar = (id: T) => onCambio(valores.includes(id) ? valores.filter((x) => x !== id) : [...valores, id]);
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);
  return (
    <details ref={ref} className="group relative">
      <summary className={`${CAMPO} flex cursor-pointer list-none items-center gap-2`} aria-label={etiqueta}>
        {valores.length ? `${etiqueta} (${valores.length})` : etiqueta}
        <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className="absolute z-20 mt-1 max-h-64 w-56 space-y-0.5 overflow-y-auto rounded-lg border border-silver bg-surface p-2 shadow-lg">
        {opciones.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-silver/40">
            <input type="checkbox" checked={valores.includes(o.id)} onChange={() => alternar(o.id)} /> {o.nombre}
          </label>
        ))}
      </div>
    </details>
  );
}
