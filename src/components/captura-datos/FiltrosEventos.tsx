"use client";

import { Search, X } from "lucide-react";
import type { EventoCaptura } from "@/lib/captura-datos/modelo";

export type EstadoFiltro = "" | "abierto" | "confirmado" | "por_revisar";

export interface FiltrosEventosValor {
  q: string;
  estado: EstadoFiltro;
  desde: string; // YYYY-MM-DD
  hasta: string;
}

export const SIN_FILTROS_EVENTOS: FiltrosEventosValor = { q: "", estado: "", desde: "", hasta: "" };

export const hayFiltrosEventos = (f: FiltrosEventosValor) => !!(f.q.trim() || f.estado || f.desde || f.hasta);

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type EventoFiltrable = EventoCaptura & { progreso: { pendiente: number; leida: number } };

export function filtrarEventos<T extends EventoFiltrable>(eventos: T[], f: FiltrosEventosValor): T[] {
  const q = sinAcentos(f.q.trim());
  return eventos.filter((e) => {
    if (q && !sinAcentos(`${e.nombre} ${e.destino?.nombre ?? ""}`).includes(q)) return false;
    if (f.estado === "abierto" && e.estado === "confirmado") return false;
    if (f.estado === "confirmado" && e.estado !== "confirmado") return false;
    if (f.estado === "por_revisar" && e.progreso.pendiente + e.progreso.leida === 0) return false;
    if (f.desde && (!e.fecha || e.fecha < f.desde)) return false;
    if (f.hasta && (!e.fecha || e.fecha > f.hasta)) return false;
    return true;
  });
}

const CAMPO = "rounded-lg border border-silver bg-surface px-3 py-1.5 text-sm";
const ESTADOS: { valor: Exclude<EstadoFiltro, "">; etiqueta: string }[] = [
  { valor: "abierto", etiqueta: "Abiertos" },
  { valor: "confirmado", etiqueta: "Confirmados" },
  { valor: "por_revisar", etiqueta: "Con hojas por revisar" },
];

export function FiltrosEventos({ filtros, onCambio }: { filtros: FiltrosEventosValor; onCambio: (f: FiltrosEventosValor) => void }) {
  const cambiar = (parcial: Partial<FiltrosEventosValor>) => onCambio({ ...filtros, ...parcial });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" />
          <input value={filtros.q} onChange={(e) => cambiar({ q: e.target.value })} placeholder="Buscar evento…" aria-label="Buscar evento" className={`${CAMPO} w-full pl-8`} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Desde <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Hasta <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} className={CAMPO} />
        </label>
        {hayFiltrosEventos(filtros) && (
          <button onClick={() => onCambio(SIN_FILTROS_EVENTOS)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm text-muted hover:text-foreground">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
        {ESTADOS.map(({ valor, etiqueta }) => {
          const activa = filtros.estado === valor;
          return (
            <button key={valor} onClick={() => cambiar({ estado: activa ? "" : valor })} aria-pressed={activa} className={`rounded-full border px-3 py-1 text-xs font-medium ${activa ? "border-primary bg-primary/10 text-primary" : "border-silver text-muted hover:text-foreground"}`}>
              {etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}
