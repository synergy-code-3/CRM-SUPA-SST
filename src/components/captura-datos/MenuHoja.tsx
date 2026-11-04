"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, MoreVertical, Pencil, Trash2 } from "lucide-react";

const ITEM = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-silver/40 disabled:opacity-50";

interface Props {
  onVer: () => void;
  /** Sin esto no se muestra "Editar" (evento cerrado, hoja de otra persona o no válida). */
  onEditar?: () => void;
  /** Sin esto no se muestra "Borrar" (solo admin con el evento abierto). */
  onBorrar?: () => void;
  deshabilitado?: boolean;
}

/** Menú de tres puntos de la tarjeta de una hoja: Ver, Editar y Borrar. */
export function MenuHoja({ onVer, onEditar, onBorrar, deshabilitado }: Props) {
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  const elegir = (accion: () => void) => () => { setAbierto(false); accion(); };

  return (
    <div ref={raiz} className="relative z-10 shrink-0">
      <button onClick={() => setAbierto((a) => !a)} disabled={deshabilitado} aria-label="Acciones de la hoja" aria-haspopup="menu" aria-expanded={abierto} className="rounded-lg p-1 text-muted hover:bg-silver/40 disabled:opacity-50">
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-36 overflow-hidden rounded-lg border border-silver bg-surface py-1 shadow-lg">
          <button role="menuitem" onClick={elegir(onVer)} className={ITEM}><Eye className="h-4 w-4" /> Ver</button>
          {onEditar && <button role="menuitem" onClick={elegir(onEditar)} className={ITEM}><Pencil className="h-4 w-4" /> Editar</button>}
          {onBorrar && <button role="menuitem" onClick={elegir(onBorrar)} className={`${ITEM} text-danger`}><Trash2 className="h-4 w-4" /> Borrar</button>}
        </div>
      )}
    </div>
  );
}
