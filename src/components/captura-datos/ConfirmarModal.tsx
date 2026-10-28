"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";

interface ConfirmarModalProps {
  titulo: string;
  /** Lo que se le pregunta a la persona. */
  children: React.ReactNode;
  textoConfirmar: string;
  textoCancelar?: string;
  /** Botón de confirmar en rojo: para acciones que descartan o destruyen algo. */
  peligro?: boolean;
  /** Etiqueta de un campo de texto obligatorio (p. ej. "Motivo"): el botón no se activa hasta escribirlo y se entrega a onConfirmar. */
  pedirMotivo?: string;
  /** true mientras se ejecuta la acción confirmada: no se puede cerrar. */
  cargando?: boolean;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}

/** Ventana emergente de confirmación (reemplaza a window.confirm / window.prompt y a los recuadros pegados al fondo de un formulario). */
export function ConfirmarModal({ titulo, children, textoConfirmar, textoCancelar = "Cancelar", peligro, pedirMotivo, cargando, onConfirmar, onCancelar }: ConfirmarModalProps) {
  const [motivo, setMotivo] = useState("");
  const falta = pedirMotivo !== undefined && !motivo.trim();

  return (
    <Modal titulo={titulo} onCerrar={onCancelar} bloqueado={cargando}>
      <div className="space-y-4">
        <div className="text-sm text-foreground">{children}</div>
        {pedirMotivo !== undefined && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted">{pedirMotivo}</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={3}
              autoFocus
              className="w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </label>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={onCancelar} disabled={cargando} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40 disabled:opacity-50">
            {textoCancelar}
          </button>
          <button
            onClick={() => onConfirmar(motivo.trim())}
            disabled={cargando || falta}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${peligro ? "bg-danger" : "bg-primary"}`}
          >
            {cargando && <Loader2 className="h-4 w-4 animate-spin" />} {textoConfirmar}
          </button>
        </div>
      </div>
    </Modal>
  );
}
