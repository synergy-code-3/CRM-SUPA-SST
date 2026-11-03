"use client";

import { History, ShieldAlert } from "lucide-react";
import { HistorialLista } from "./HistorialModal";
import { RETENCION_AUDITORIA_DIAS } from "@/lib/captura-datos/historial";
import { useSesion } from "@/lib/session-context";

const MESES_DE_HISTORIAL = Math.round(RETENCION_AUDITORIA_DIAS / 30);

/** Página "Historial" de la barra lateral de Captura de Datos: todos los movimientos importantes, solo para admins. */
export function HistorialPagina() {
  const { usuario } = useSesion();

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <History className="h-6 w-6 text-primary" strokeWidth={1.75} /> Historial
        </h1>
        <p className="text-sm text-muted">
          Movimientos importantes de Captura de Datos: eventos creados, cerrados, reabiertos y borrados, y hojas confirmadas o corregidas.
          Se conservan {MESES_DE_HISTORIAL} meses.
        </p>
      </div>

      {usuario?.rol === "admin" ? (
        <div className="rounded-2xl border border-silver bg-surface p-4">
          <HistorialLista conFiltros />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
          <ShieldAlert className="h-4 w-4 shrink-0" /> Solo un admin puede ver el historial.
        </p>
      )}
    </div>
  );
}
