"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";

export type OpcionCombobox = { valor: string; etiqueta: string; nota?: string };

export function ComboboxBuscador({
  opciones,
  valor,
  onChange,
  placeholder = "Seleccionar…",
  disabled,
  etiquetaVacio,
}: {
  opciones: OpcionCombobox[];
  valor: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  disabled?: boolean;
  // Si se pasa, agrega una primera opción que limpia la selección (valor "").
  etiquetaVacio?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [posicion, setPosicion] = useState<{ top: number; left: number; width: number } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      const fuera =
        raiz.current && !raiz.current.contains(e.target as Node) && (!panel.current || !panel.current.contains(e.target as Node));
      if (fuera) {
        setAbierto(false);
        setBusqueda("");
      }
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  // El menú se renderiza en un portal a document.body (no dentro de la
  // tarjeta/tabla) para que una tabla con scroll horizontal (overflow-x-auto,
  // como en Moderación de Community Manager) no lo recorte ni fuerce un
  // scroll vertical diminuto dentro de la tarjeta. La posición se recalcula
  // mientras está abierto para seguir al botón si la página o un contenedor
  // interno hace scroll.
  useLayoutEffect(() => {
    if (!abierto) return;
    function actualizar() {
      const rect = boton.current?.getBoundingClientRect();
      if (!rect) return;
      setPosicion({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    actualizar();
    window.addEventListener("scroll", actualizar, true);
    window.addEventListener("resize", actualizar);
    return () => {
      window.removeEventListener("scroll", actualizar, true);
      window.removeEventListener("resize", actualizar);
    };
  }, [abierto]);

  const conVacio =
    etiquetaVacio !== undefined ? [{ valor: "", etiqueta: etiquetaVacio }, ...opciones] : opciones;
  const seleccionada = conVacio.find((o) => o.valor === valor);
  const filtradas = busqueda.trim()
    ? conVacio.filter((o) => o.etiqueta.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : conVacio;

  return (
    <div ref={raiz} className="relative">
      <button
        ref={boton}
        type="button"
        disabled={disabled}
        onClick={() => setAbierto((a) => !a)}
        className="flex w-full items-center justify-between rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-left text-sm outline-none ring-primary/30 transition focus:ring-2 disabled:opacity-50"
      >
        <span className={seleccionada ? "text-foreground" : "text-muted"}>
          {seleccionada ? seleccionada.etiqueta : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
      </button>

      {abierto &&
        posicion &&
        createPortal(
          <div
            ref={panel}
            style={{ position: "fixed", top: posicion.top, left: posicion.left, width: posicion.width }}
            className="z-50 overflow-hidden rounded-lg border border-silver bg-surface shadow-lg"
          >
            <div className="flex items-center gap-1.5 border-b border-silver px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {filtradas.length === 0 && (
                <p className="px-3 py-2 text-sm text-muted">Sin resultados</p>
              )}
              {filtradas.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => {
                    onChange(o.valor);
                    setAbierto(false);
                    setBusqueda("");
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-surface-2 ${
                    o.valor === valor ? "text-primary" : "text-foreground"
                  }`}
                >
                  <span>{o.etiqueta}</span>
                  {o.nota && <span className="text-xs text-muted">{o.nota}</span>}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
