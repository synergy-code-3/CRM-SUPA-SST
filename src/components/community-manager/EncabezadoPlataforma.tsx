"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Facebook, Instagram, Music2, GraduationCap, LayoutGrid } from "lucide-react";
import type { Plataforma } from "@/lib/community-manager";

const ICONO_PLATAFORMA: Record<Plataforma, typeof LayoutGrid> = {
  facebook: Facebook,
  instagram: Instagram,
  tiktok: Music2,
  skool: GraduationCap,
};

type Props = {
  plataforma: Plataforma | null;
  titulo: React.ReactNode;
  subtitulo: string;
  extra?: React.ReactNode;
};

function Contenido({ plataforma, titulo, subtitulo, extra }: Props) {
  const Icono = plataforma ? ICONO_PLATAFORMA[plataforma] : LayoutGrid;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-primary-dim text-primary-deep">
          <Icono className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{titulo}</h1>
          <p className="text-sm text-muted">{subtitulo}</p>
        </div>
      </div>
      {extra}
    </div>
  );
}

// Encabezado compartido de Estadísticas/Moderación: no se mueve con el
// scroll y no deja ver nada "detrás". Va fijo (position:fixed, medido con
// JS y montado en un portal a <body> — el mismo truco que ya funciona en
// ComboboxBuscador) en vez de sticky, para no depender de ningún contexto
// de overflow/stacking ambiguo. El fondo arranca justo en el borde
// superior de <main> (sin sumarle su padding-top) para que no quede
// ningún hueco por donde se asome la tarjeta de abajo; ese mismo padding
// se aplica como padding-top AL FONDO fijo, así el texto queda exactamente
// en la misma posición de siempre — solo el fondo se estira hacia arriba
// para taparlo todo.
export function EncabezadoPlataforma(props: Props) {
  const marcador = useRef<HTMLDivElement>(null);
  const [estilo, setEstilo] = useState<{ top: number; left: number; width: number; padTop: number } | null>(null);

  useLayoutEffect(() => {
    const el = marcador.current;
    if (!el) return;
    const mainEl = el.closest("main");

    function actualizar() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (mainEl) {
        const mainRect = mainEl.getBoundingClientRect();
        const padTop = parseFloat(getComputedStyle(mainEl).paddingTop) || 0;
        setEstilo({ top: mainRect.top, left: rect.left, width: rect.width, padTop });
      } else {
        setEstilo({ top: rect.top, left: rect.left, width: rect.width, padTop: 0 });
      }
    }

    actualizar();
    const ro = new ResizeObserver(actualizar);
    if (mainEl) ro.observe(mainEl);
    window.addEventListener("resize", actualizar);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", actualizar);
    };
  }, []);

  return (
    <div ref={marcador}>
      <div className="invisible" aria-hidden="true">
        <div className="border-b border-silver/70 bg-background pb-4">
          <Contenido {...props} />
        </div>
      </div>
      {estilo &&
        createPortal(
          <div
            style={{ position: "fixed", top: estilo.top, left: estilo.left, width: estilo.width, paddingTop: estilo.padTop, zIndex: 30 }}
            className="border-b border-silver/70 bg-background pb-4"
          >
            <Contenido {...props} />
          </div>,
          document.body
        )}
    </div>
  );
}
