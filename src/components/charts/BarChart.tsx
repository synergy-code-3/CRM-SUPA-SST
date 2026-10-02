"use client";

import { useState } from "react";

// Barras horizontales de una sola magnitud (todas el mismo color de marca,
// "brand-plate") — no es categórico, así que no necesita paleta.
export function BarChart({ datos }: { datos: { nombre: string; cantidad: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (datos.length === 0) return <p className="text-sm text-muted">Sin datos.</p>;
  const max = Math.max(...datos.map((d) => d.cantidad));
  const total = datos.reduce((s, d) => s + d.cantidad, 0);
  return (
    <ul className="scrollbar-fina flex h-full flex-col justify-start gap-2.5 overflow-y-auto pr-1">
      {datos.map((d, i) => (
        <li key={d.nombre} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className={`ease-spring font-medium transition ${hover === i ? "text-primary" : "text-foreground"}`}>
              {d.nombre}
            </span>
            <span className="text-muted">
              {d.cantidad.toLocaleString("es-MX")}
              {hover === i && total > 0 && <span className="ml-1 text-primary">({Math.round((d.cantidad / total) * 100)}%)</span>}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={`ease-spring h-full rounded-full brand-plate transition-all ${hover === i ? "shadow-[0_0_8px_var(--color-primary)]" : ""}`}
              style={{ width: `${(d.cantidad / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
