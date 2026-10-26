"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "@/lib/captura-datos/cliente";

/** Borrado con doble confirmación: primero el motivo y luego escribir el nombre del evento. Queda en el historial. */
export function BorrarEventoModal({ eventoId, nombre, onCerrar, onBorrado }: { eventoId: string; nombre: string; onCerrar: () => void; onBorrado: () => void }) {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [motivo, setMotivo] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function borrar() {
    setBorrando(true);
    setError(null);
    try {
      await api(`/api/captura-datos/eventos/${eventoId}`, { method: "DELETE", json: { motivo } });
      onBorrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar el evento.");
      setBorrando(false);
    }
  }

  return (
    <Modal titulo="Borrar evento" onCerrar={onCerrar} bloqueado={borrando}>
      <div className="space-y-3">
        {paso === 1 ? (
          <>
            <p className="text-sm text-muted">El evento y todas sus hojas se borrarán. Queda registrado en el historial.</p>
            <label className="block text-sm font-medium text-foreground" htmlFor="motivo-borrado">Motivo</label>
            <textarea id="motivo-borrado" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} autoFocus className="w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm" />
          </>
        ) : (
          <>
            <p className="text-sm text-foreground">Esta acción no se puede deshacer. Para confirmar, escribe el nombre del evento: <strong className="break-words">{nombre}</strong></p>
            <input value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} aria-label="Nombre del evento" autoFocus className="w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm" />
          </>
        )}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={paso === 1 ? onCerrar : () => setPaso(1)} disabled={borrando} className="rounded-lg border border-silver px-4 py-2 text-sm disabled:opacity-50">{paso === 1 ? "Cancelar" : "Atrás"}</button>
          {paso === 1 ? (
            <button onClick={() => setPaso(2)} disabled={!motivo.trim()} className="rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Continuar</button>
          ) : (
            <button onClick={borrar} disabled={borrando || confirmacion.trim() !== nombre.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {borrando && <Loader2 className="h-4 w-4 animate-spin" />} Borrar definitivamente
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
