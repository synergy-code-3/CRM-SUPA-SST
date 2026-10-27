"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { Modal } from "./Modal";
import { ESTATUS, type Estatus } from "@/lib/captura-datos/fields";

interface SubirFotosModalProps {
  onCerrar: () => void;
  /** Sube los archivos con el estatus elegido; lanza si falla (el cuadro se queda abierto). */
  onSubir: (archivos: File[], estatus: Estatus) => Promise<void>;
}

export function SubirFotosModal({ onCerrar, onSubir }: SubirFotosModalProps) {
  const [estatus, setEstatus] = useState<Estatus>("Completo");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  async function subir() {
    setSubiendo(true);
    try {
      await onSubir(archivos, estatus);
      onCerrar();
    } catch {
      setSubiendo(false);
    }
  }

  return (
    <Modal titulo="Subir fotos o PDF" onCerrar={onCerrar} bloqueado={subiendo}>
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-foreground">Tipo de hoja</legend>
          {ESTATUS.map((e) => (
            <label key={e.value} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${estatus === e.value ? "border-primary bg-primary/5" : "border-silver"}`}>
              <input type="radio" name="estatus" checked={estatus === e.value} onChange={() => setEstatus(e.value)} className="mt-1" />
              <span><span className="font-medium text-foreground">{e.value}</span><span className="block text-xs text-muted">{e.desc}</span></span>
            </label>
          ))}
        </fieldset>

        <div>
          <button type="button" onClick={() => entrada.current?.click()} disabled={subiendo} className="inline-flex items-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm font-medium disabled:opacity-50">
            <Upload className="h-4 w-4" /> Elegir archivos de este equipo
          </button>
          <input ref={entrada} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => setArchivos([...(e.target.files ?? [])])} />
          <p className="mt-2 text-xs text-muted">{archivos.length ? `${archivos.length} archivo(s) seleccionado(s)` : "Ningún archivo seleccionado"}</p>
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={subiendo} className="rounded-lg border border-silver px-4 py-2 text-sm disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={subir} disabled={subiendo || archivos.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {subiendo && <Loader2 className="h-4 w-4 animate-spin" />} Subir
          </button>
        </div>
      </div>
    </Modal>
  );
}
