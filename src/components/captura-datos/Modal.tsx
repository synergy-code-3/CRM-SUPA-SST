"use client";

import { X } from "lucide-react";

export function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onCerrar}>
      <div
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">{titulo}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-muted hover:bg-silver/40">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
