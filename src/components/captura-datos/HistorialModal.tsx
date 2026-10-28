"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "@/lib/captura-datos/cliente";
import { ETIQUETA_ACCION, lineasDeDetalle, type RegistroAuditoria } from "@/lib/captura-datos/historial";

interface HistorialModalProps {
  /** Si se indica, solo los movimientos de ese evento; si no, todos (incluidos los de eventos ya borrados). */
  eventoId?: string;
  titulo?: string;
  onCerrar: () => void;
}

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

/** Historial de movimientos importantes de Captura de Datos (solo admin): lo más reciente primero. */
export function HistorialModal({ eventoId, titulo = "Historial", onCerrar }: HistorialModalProps) {
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(
    async (antes?: number) => {
      setCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (eventoId) params.set("eventoId", eventoId);
        if (antes !== undefined) params.set("antes", String(antes));
        const r = await api<{ registros: RegistroAuditoria[]; hayMas: boolean }>(`/api/captura-datos/historial?${params}`);
        setRegistros((previos) => (antes === undefined ? r.registros : [...(previos ?? []), ...r.registros]));
        setHayMas(r.hayMas);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
      } finally {
        setCargando(false);
      }
    },
    [eventoId]
  );

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const ultimo = registros?.[registros.length - 1];

  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <div className="space-y-3">
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {!registros && !error && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
        {registros?.length === 0 && <p className="py-6 text-center text-sm text-muted">Todavía no hay movimientos registrados.</p>}

        {registros && registros.length > 0 && (
          <ul className="divide-y divide-silver/60">
            {registros.map((r) => {
              const detalle = lineasDeDetalle(r);
              return (
                <li key={r.id} className="space-y-0.5 py-2.5 text-sm">
                  <p className="font-medium text-foreground">{ETIQUETA_ACCION[r.accion] ?? r.accion}</p>
                  {!eventoId && r.eventoNombre && <p className="text-xs text-foreground">Evento: {r.eventoNombre}</p>}
                  {detalle.map((linea, i) => <p key={i} className="break-words text-xs text-foreground">{linea}</p>)}
                  <p className="text-xs text-muted">{FECHA.format(new Date(r.en))} · {r.usuarioNombre ?? "Usuario desconocido"}</p>
                </li>
              );
            })}
          </ul>
        )}

        {hayMas && ultimo && (
          <button onClick={() => void cargar(ultimo.id)} disabled={cargando} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm disabled:opacity-50">
            {cargando && <Loader2 className="h-4 w-4 animate-spin" />} Ver más
          </button>
        )}
      </div>
    </Modal>
  );
}
