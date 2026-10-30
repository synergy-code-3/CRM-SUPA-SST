"use client";

import { Search, X } from "lucide-react";
import { ACCIONES_AUDITORIA, ETIQUETA_FILTRO_ACCION, type AccionAuditoria } from "@/lib/captura-datos/historial";

export interface Filtros {
  q: string;
  lugar: string;
  acciones: AccionAuditoria[];
  desde: string; // YYYY-MM-DD
  hasta: string;
}

export const SIN_FILTROS: Filtros = { q: "", lugar: "", acciones: [], desde: "", hasta: "" };

export const hayFiltros = (f: Filtros) => !!(f.q.trim() || f.lugar.trim() || f.acciones.length || f.desde || f.hasta);

/** Parámetros de la API; las fechas se mandan como instante local (inicio y fin del día) para no desfasar la zona horaria. */
export function paramsDeFiltros(f: Filtros): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.lugar.trim()) p.set("lugar", f.lugar.trim());
  if (f.acciones.length) p.set("acciones", f.acciones.join(","));
  if (f.desde) p.set("fechaDesde", new Date(`${f.desde}T00:00:00`).toISOString());
  if (f.hasta) p.set("fechaHasta", new Date(`${f.hasta}T23:59:59.999`).toISOString());
  return p;
}

const CAMPO = "rounded-lg border border-silver bg-surface px-3 py-1.5 text-sm";

export function FiltrosHistorial({ filtros, onCambio }: { filtros: Filtros; onCambio: (f: Filtros) => void }) {
  const cambiar = (parcial: Partial<Filtros>) => onCambio({ ...filtros, ...parcial });
  const alternar = (a: AccionAuditoria) => cambiar({ acciones: filtros.acciones.includes(a) ? filtros.acciones.filter((x) => x !== a) : [...filtros.acciones, a] });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted" />
          <input value={filtros.q} onChange={(e) => cambiar({ q: e.target.value })} placeholder="Buscar evento, admin, folio, cliente…" aria-label="Buscar en el historial" className={`${CAMPO} w-full pl-8`} />
        </label>
        <input value={filtros.lugar} onChange={(e) => cambiar({ lugar: e.target.value })} placeholder="Lugar" aria-label="Lugar" className={`${CAMPO} w-36`} />
        <label className="flex items-center gap-1 text-xs text-muted">
          Desde <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => cambiar({ desde: e.target.value })} className={CAMPO} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Hasta <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => cambiar({ hasta: e.target.value })} className={CAMPO} />
        </label>
        {hayFiltros(filtros) && (
          <button onClick={() => onCambio(SIN_FILTROS)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm text-muted hover:text-foreground">
            <X className="h-4 w-4" /> Limpiar
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por acción">
        {ACCIONES_AUDITORIA.map((a) => {
          const activa = filtros.acciones.includes(a);
          return (
            <button key={a} onClick={() => alternar(a)} aria-pressed={activa} className={`rounded-full border px-3 py-1 text-xs font-medium ${activa ? "border-primary bg-primary/10 text-primary" : "border-silver text-muted hover:text-foreground"}`}>
              {ETIQUETA_FILTRO_ACCION[a]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
