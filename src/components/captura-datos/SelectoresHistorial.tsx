"use client";

import { useEffect, useRef, useState } from "react";
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

const MAX_BUSQUEDA = 50;

const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function useCerrarAlClicFuera() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, []);
  return ref;
}

const enfocarBuscador = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
  if (e.currentTarget.open) e.currentTarget.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
};

function Buscador({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <input
      type="search"
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      maxLength={MAX_BUSQUEDA}
      placeholder="Buscar…"
      aria-label="Buscar en la lista"
      className="mb-1 w-full rounded border border-silver bg-surface px-2 py-1 text-sm"
    />
  );
}

const filtrarPorTexto = <T extends { nombre: string }>(opciones: T[], texto: string): T[] => {
  const q = normalizar(texto.trim());
  return q ? opciones.filter((o) => normalizar(o.nombre).includes(q)) : opciones;
};

const PANEL = "absolute z-20 mt-1 max-h-72 w-56 overflow-y-auto rounded-lg border border-silver bg-surface p-2 shadow-lg";

export function SelectorLista({ valor, onCambio, opciones, todas, etiqueta }: { valor: string; onCambio: (v: string) => void; opciones: { id: string; nombre: string }[]; todas: string; etiqueta: string }) {
  const ref = useCerrarAlClicFuera();
  const [texto, setTexto] = useState("");
  const visibles = filtrarPorTexto(opciones, texto);
  const elegir = (id: string) => {
    onCambio(id);
    setTexto("");
    if (ref.current) ref.current.open = false;
  };
  const actual = opciones.find((o) => o.id === valor)?.nombre ?? todas;
  return (
    <details ref={ref} onToggle={enfocarBuscador} className="group relative w-44 max-w-full">
      <summary className={`${CAMPO} flex cursor-pointer list-none items-center justify-between gap-2`} aria-label={etiqueta}>
        <span className="truncate">{actual}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition group-open:rotate-180" />
      </summary>
      <div className={PANEL}>
        <Buscador valor={texto} onCambio={setTexto} />
        {!texto && <button type="button" onClick={() => elegir("")} className="block w-full rounded px-1.5 py-1 text-left text-sm hover:bg-silver/40">{todas}</button>}
        {visibles.map((o) => (
          <button key={o.id} type="button" onClick={() => elegir(o.id)} className={`block w-full rounded px-1.5 py-1 text-left text-sm hover:bg-silver/40 ${o.id === valor ? "font-semibold text-primary" : ""}`}>{o.nombre}</button>
        ))}
        {!visibles.length && <p className="px-1.5 py-1 text-sm text-muted">Sin resultados</p>}
      </div>
    </details>
  );
}

export function SelectorMultiple<T extends string>({ valores, onCambio, opciones, etiqueta }: { valores: T[]; onCambio: (v: T[]) => void; opciones: { id: T; nombre: string }[]; etiqueta: string }) {
  const alternar = (id: T) => onCambio(valores.includes(id) ? valores.filter((x) => x !== id) : [...valores, id]);
  const ref = useCerrarAlClicFuera();
  const [texto, setTexto] = useState("");
  const visibles = filtrarPorTexto(opciones, texto);
  return (
    <details ref={ref} onToggle={enfocarBuscador} className="group relative">
      <summary className={`${CAMPO} flex cursor-pointer list-none items-center gap-2`} aria-label={etiqueta}>
        {valores.length ? `${etiqueta} (${valores.length})` : etiqueta}
        <ChevronDown className="h-4 w-4 text-muted transition group-open:rotate-180" />
      </summary>
      <div className={`${PANEL} space-y-0.5`}>
        <Buscador valor={texto} onCambio={setTexto} />
        {visibles.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-silver/40">
            <input type="checkbox" checked={valores.includes(o.id)} onChange={() => alternar(o.id)} /> {o.nombre}
          </label>
        ))}
        {!visibles.length && <p className="px-1.5 py-1 text-sm text-muted">Sin resultados</p>}
      </div>
    </details>
  );
}
