"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "@/lib/captura-datos/cliente";

/** Pide el motivo. Un admin (`directo`) borra el evento al momento; el resto envía una solicitud que decide un admin. */
export function SolicitudBorradoModal({ eventoId, directo, onCerrar, onEnviada }: { eventoId: string; directo: boolean; onCerrar: () => void; onEnviada: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enviar() {
    setEnviando(true);
    setError(null);
    try {
      await api(`/api/captura-datos/eventos/${eventoId}`, { method: "DELETE", json: { motivo } });
      onEnviada();
    } catch (err) {
      setError(err instanceof Error ? err.message : directo ? "No se pudo borrar el evento." : "No se pudo enviar la solicitud.");
      setEnviando(false);
    }
  }

  return (
    <Modal titulo={directo ? "Borrar evento" : "Solicitar borrado del evento"} onCerrar={onCerrar} bloqueado={enviando}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{directo ? "El evento y todas sus hojas se borrarán ahora. Queda registrado en el historial." : "La solicitud será enviada y revisada, en caso de que se apruebe el evento será borrado."}</p>
        <label className="block text-sm font-medium text-foreground" htmlFor="motivo-borrado">Motivo</label>
        <textarea id="motivo-borrado" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3} autoFocus className="w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm" />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCerrar} disabled={enviando} className="rounded-lg border border-silver px-4 py-2 text-sm disabled:opacity-50">Cancelar</button>
          <button onClick={enviar} disabled={enviando || !motivo.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />} {directo ? "Borrar evento" : "Enviar solicitud"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
