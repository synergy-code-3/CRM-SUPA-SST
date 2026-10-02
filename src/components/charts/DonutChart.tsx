"use client";

import { useState } from "react";

export type SegmentoDonut = { nombre: string; cantidad: number };

// Paleta categórica validada (orden fijo, no se cicla) — ver el skill de
// dataviz: separación suficiente en daltonismo y contraste contra blanco,
// en ese orden exacto. Hasta 5 motivos; un 6º se debe agrupar en "Otros"
// en vez de agregar otro color.
export const COLORES_CATEGORICOS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"];

// Dona genérica: el centro muestra `centro` (o el total, por defecto) hasta
// que se pasa el cursor por un segmento/leyenda, ahí muestra ese dato.
export function DonutChart({
  datos,
  total,
  colores = COLORES_CATEGORICOS,
  centro,
}: {
  datos: SegmentoDonut[];
  total: number;
  colores?: string[];
  centro?: { valor: string; etiqueta: string };
}) {
  const [hover, setHover] = useState<number | null>(null);
  let acumulado = 0;
  const segmentos = datos.map((d, i) => {
    const pct = total > 0 ? d.cantidad / total : 0;
    const seg = { ...d, color: colores[i % colores.length], pct, offset: acumulado };
    acumulado += pct;
    return seg;
  });

  const R = 70;
  const STROKE = 20;
  const C = 2 * Math.PI * R;
  const activo = hover !== null ? segmentos[hover] : null;
  const centroMostrado = centro ?? { valor: total.toLocaleString("es-MX"), etiqueta: "total" };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2">
      <div className="relative aspect-square h-[68%] max-h-[68%]">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx={80} cy={80} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={STROKE} />
          {segmentos.map((s, i) => {
            const arco = s.pct * C;
            return (
              <circle
                key={s.nombre}
                cx={80}
                cy={80}
                r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === i ? STROKE + 5 : STROKE}
                strokeDasharray={`${arco} ${C - arco}`}
                strokeDashoffset={-s.offset * C}
                strokeLinecap="butt"
                className="cursor-pointer transition-all"
                opacity={hover !== null && hover !== i ? 0.45 : 1}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {activo ? (
            <>
              <span className="text-3xl font-bold text-foreground">{activo.cantidad.toLocaleString("es-MX")}</span>
              <span className="text-xs text-muted">{activo.nombre}</span>
            </>
          ) : (
            <>
              <span className="text-4xl font-bold text-foreground">{centroMostrado.valor}</span>
              <span className="text-xs text-muted">{centroMostrado.etiqueta}</span>
            </>
          )}
        </div>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segmentos.map((s, i) => (
          <li
            key={s.nombre}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={`ease-spring flex cursor-pointer items-center gap-1.5 text-xs transition ${
              hover === i ? "font-semibold text-foreground" : "text-muted"
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.nombre}
          </li>
        ))}
      </ul>
    </div>
  );
}
