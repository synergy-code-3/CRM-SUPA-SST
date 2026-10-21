"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  titulo: string;
  onCerrar: () => void;
  /** true mientras se guarda: no se puede cerrar para no creer que se canceló algo que ya va en camino. */
  bloqueado?: boolean;
  children: React.ReactNode;
}

export function Modal({ titulo, onCerrar, bloqueado = false, children }: ModalProps) {
  const idTitulo = useId();
  const dialogo = useRef<HTMLDivElement>(null);
  const empezoEnFondo = useRef(false);
  // Los padres pasan funciones nuevas en cada render: se leen desde un ref para que el efecto (y el foco) corra solo al abrir.
  const actual = useRef({ onCerrar, bloqueado });
  actual.current = { onCerrar, bloqueado };

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    dialogo.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !actual.current.bloqueado) actual.current.onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      previo?.focus();
    };
  }, []);

  // Se cierra solo si el clic empezó Y terminó en el fondo (arrastrar para seleccionar texto no debe cerrarlo).
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => { empezoEnFondo.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (empezoEnFondo.current && e.target === e.currentTarget && !bloqueado) onCerrar(); }}
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={idTitulo} className="text-base font-semibold text-foreground">{titulo}</h2>
          <button onClick={onCerrar} disabled={bloqueado} aria-label="Cerrar" className="rounded-lg p-1 text-muted hover:bg-silver/40 disabled:opacity-40">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
