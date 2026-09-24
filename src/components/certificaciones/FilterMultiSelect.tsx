"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Search } from "lucide-react";

export function FilterMultiSelect({
  label,
  opciones,
  seleccionados,
  onChange,
  buscable = false,
}: {
  label: string;
  opciones: { value: string; label: string }[];
  seleccionados: string[];
  onChange: (valores: string[]) => void;
  buscable?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  function alternar(valor: string) {
    if (seleccionados.includes(valor)) onChange(seleccionados.filter((v) => v !== valor));
    else onChange([...seleccionados, valor]);
  }

  const opcionesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return opciones;
    return opciones.filter((o) => o.label.toLowerCase().includes(texto));
  }, [opciones, busqueda]);

  const textoBoton =
    seleccionados.length === 0
      ? label
      : seleccionados.length === 1
        ? (opciones.find((o) => o.value === seleccionados[0])?.label ?? label)
        : `${label} (${seleccionados.length})`;

  return (
    <div className="relative w-full sm:w-auto">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex w-full items-center justify-between gap-1.5 truncate rounded-full border px-4 py-2 text-xs font-medium outline-none transition-all duration-500 ease-spring sm:w-auto sm:justify-start ${
          seleccionados.length > 0
            ? "border-primary/50 bg-primary-dim text-primary-deep"
            : "border-silver-deep/60 bg-surface-2 text-muted"
        }`}
      >
        <span className="truncate">{textoBoton}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
      </button>

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setAbierto(false);
              setBusqueda("");
            }}
          />
          <div className="animate-fade-in absolute z-20 mt-2 w-56 rounded-2xl border border-silver-deep/60 bg-surface-2 p-2 shadow-lg">
            {buscable && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-silver-deep/60 bg-surface px-3 py-2">
                <Search className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
                <input
                  autoFocus
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar…"
                  className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
                />
              </div>
            )}

            {seleccionados.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="mb-1 flex w-full items-center rounded-lg px-3 py-1.5 text-left text-xs font-medium text-danger hover:bg-danger/10"
              >
                Limpiar selección
              </button>
            )}

            <div className="max-h-56 overflow-y-auto">
              {opcionesFiltradas.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">Sin resultados.</p>
              ) : (
                opcionesFiltradas.map((opcion) => (
                  <label
                    key={opcion.value}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors duration-200 hover:bg-primary-dim"
                  >
                    <input
                      type="checkbox"
                      checked={seleccionados.includes(opcion.value)}
                      onChange={() => alternar(opcion.value)}
                      className="h-4 w-4 rounded border-silver-deep/60 accent-primary"
                    />
                    {opcion.label}
                  </label>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
