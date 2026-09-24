"use client";

import { useState } from "react";
import { ChevronDown, LoaderCircle, Check, X as XIcon } from "lucide-react";

export type BulkActionOption = {
  key: string;
  label: string;
  onSelect: () => void | Promise<void>;
  activo?: boolean;
  quitar?: boolean;
};

export function BulkActionMenu({
  label,
  icon: Icon,
  options,
  disabled = false,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  options: BulkActionOption[];
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);

  async function elegir(opcion: BulkActionOption) {
    if (procesando) return;
    setProcesando(opcion.key);
    try {
      await opcion.onSelect();
    } finally {
      setProcesando(null);
      setAbierto(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition-all duration-500 ease-spring hover:bg-primary/20 disabled:opacity-40"
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2} />
        {label}
        <ChevronDown className="h-3 w-3" strokeWidth={2} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="animate-fade-in absolute left-0 top-full z-50 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-silver-deep/60 bg-surface p-2 shadow-lg">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted">No hay opciones disponibles.</p>
            ) : (
              options.map((opcion) => (
                <button
                  key={opcion.key}
                  type="button"
                  onClick={() => elegir(opcion)}
                  disabled={procesando !== null}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-foreground transition-colors duration-200 hover:bg-primary-dim disabled:opacity-50"
                >
                  {procesando === opcion.key ? (
                    <LoaderCircle className="h-3.5 w-3.5 flex-none animate-spin" strokeWidth={2} />
                  ) : opcion.quitar ? (
                    <XIcon className="h-3.5 w-3.5 flex-none text-danger" strokeWidth={2} />
                  ) : (
                    <Check className="h-3.5 w-3.5 flex-none text-success" strokeWidth={2} />
                  )}
                  <span className="truncate">{opcion.label}</span>
                  {opcion.activo && <span className="ml-auto h-1.5 w-1.5 flex-none rounded-full bg-primary" />}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
