"use client";

import { useEffect, useRef } from "react";
import { Copy, FileText, Link2 } from "lucide-react";
import { ESTATUS } from "@/lib/captura-datos/fields";
import { bloqueoVigente, iniciales, type NombresUsuarios } from "@/lib/captura-datos/colaboracion";
import { esSecundaria, grupoDuplicadas, sinVincular } from "@/lib/captura-datos/duplicadas";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

const esPdf = (h: HojaCaptura) => h.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(h.origen.nombreOriginal);

interface TiraHojasProps {
  hojas: HojaCaptura[];
  actualId: string;
  usuarioId?: string;
  nombres: NombresUsuarios;
  onElegir: (id: string) => void;
  onVer: (h: HojaCaptura) => void;
  onDuplicadas: (h: HojaCaptura) => void;
}

export function TiraHojas({ hojas, actualId, usuarioId, nombres, onElegir, onVer, onDuplicadas }: TiraHojasProps) {
  const contenedor = useRef<HTMLUListElement>(null);
  // Completo, Apartado e Interesado, en ese orden (el sort es estable: dentro de cada grupo se respeta el orden original).
  const ordenEstatus = (h: HojaCaptura) => ESTATUS.findIndex((e) => e.value === h.estatus);
  const visibles = hojas.filter((h) => h.estado !== "no_valida" || esSecundaria(h)).sort((a, b) => ordenEstatus(a) - ordenEstatus(b));

  // Centra la hoja actual dentro de la tira sin mover la página.
  useEffect(() => {
    const el = contenedor.current;
    const actual = el?.querySelector<HTMLElement>("[data-actual]");
    if (el && actual) el.scrollLeft = actual.offsetLeft - (el.clientWidth - actual.clientWidth) / 2;
  }, [actualId, visibles.length]);

  if (visibles.length === 0) return null;
  return (
    <ul ref={contenedor} aria-label="Hojas del evento" className="relative flex h-20 shrink-0 gap-2 overflow-x-auto">
      {visibles.map((h) => {
        const revisada = h.estado === "confirmada";
        // Solo se puede saltar a una hoja confirmada, libre o tomada por uno mismo (no a la que tiene otra persona).
        const deOtra = bloqueoVigente(h) && h.bloqueadaPorId !== usuarioId;
        const quien = deOtra ? nombres[h.bloqueadaPorId!] ?? "Otra persona" : null;
        const secundaria = esSecundaria(h);
        const grupo = grupoDuplicadas(hojas, h);
        return (
          <li
            key={h.id}
            {...(h.id === actualId ? { "data-actual": true } : {})}
            title={quien ? `${quien} la está capturando` : undefined}
            className={`relative h-full w-14 shrink-0 overflow-hidden rounded-lg border bg-black/5 ${h.id === actualId ? "border-primary ring-2 ring-primary/40" : "border-silver"} ${h.id === actualId || !deOtra ? "" : "opacity-40"} ${secundaria ? "border-dashed" : ""}`}
          >
            {h.id !== actualId && !deOtra && (
              <button type="button" onClick={() => (secundaria ? onVer(h) : onElegir(h.id))} aria-label={`${secundaria ? "Ver" : "Abrir"} ${h.origen.nombreOriginal}`} className="absolute inset-0 z-10 cursor-pointer transition hover:bg-primary/10 hover:ring-2 hover:ring-primary/50" />
            )}
            {esPdf(h)
              ? <span className="flex h-full items-center justify-center text-muted"><FileText className="h-6 w-6" /></span>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={`/api/captura-datos/hojas/${h.id}/foto`} alt={h.origen.nombreOriginal} loading="lazy" draggable={false} className="h-full w-full object-contain" />}
            {quien && (
              <span role="img" aria-label={`${quien} la está capturando`} className="absolute left-1 top-1 z-20 rounded bg-foreground px-1 text-[10px] font-semibold leading-4 text-white">
                {iniciales(quien)}
              </span>
            )}
            {grupo.length > 0 && (
              <button
                type="button"
                onClick={() => onDuplicadas(h)}
                aria-label={secundaria ? "Hoja vinculada (secundaria)" : sinVincular(grupo) ? "Hoja repetida: vincular" : "Hoja vinculada"}
                title={secundaria ? "Secundaria: solo se ve" : sinVincular(grupo) ? "Repetida: vincular" : "Vinculada"}
                className={`absolute right-0.5 top-0.5 z-30 rounded p-0.5 text-white ${sinVincular(grupo) ? "bg-amber-500" : "bg-primary"}`}
              >
                {sinVincular(grupo) ? <Copy className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
              </button>
            )}
            <span
              role="img"
              aria-label={revisada ? "Revisada" : "Sin revisar"}
              title={revisada ? "Revisada" : "Sin revisar"}
              className={`absolute bottom-1 right-1 z-20 h-3 w-3 rounded-full border border-white ${revisada ? "bg-success" : "bg-orange-500"}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
