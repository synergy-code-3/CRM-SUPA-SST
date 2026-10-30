"use client";

import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

const ACEPTADOS = (f: File) => f.type.startsWith("image/") || f.type === "application/pdf";

interface ZonaArchivosProps {
  archivos: File[];
  onCambio: (archivos: File[]) => void;
  disabled?: boolean;
}

/** "Subir o arrastrar": agrega archivos (imágenes o PDF), permite quitar uno o toda la selección para elegir otra. */
export function ZonaArchivos({ archivos, onCambio, disabled }: ZonaArchivosProps) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);

  function agregar(nuevos: FileList | File[]) {
    const validos = [...nuevos].filter(ACEPTADOS);
    const repetido = (f: File) => archivos.some((a) => a.name === f.name && a.size === f.size && a.lastModified === f.lastModified);
    onCambio([...archivos, ...validos.filter((f) => !repetido(f))]);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Subir o arrastrar fotos o PDF"
        onClick={() => !disabled && entrada.current?.click()}
        onKeyDown={(e) => { if (!disabled && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); entrada.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); if (!disabled) agregar(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm ${arrastrando ? "border-primary bg-primary/10" : "border-silver"} ${disabled ? "opacity-50" : "hover:border-primary"}`}
      >
        <Upload className="h-5 w-5 text-primary" />
        <span className="font-medium text-foreground">Subir o arrastrar</span>
        <span className="text-xs text-muted">Fotos o PDF de esta computadora</span>
        <input ref={entrada} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { if (e.target.files) agregar(e.target.files); e.target.value = ""; }} />
      </div>

      {archivos.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{archivos.length} archivo(s) seleccionado(s)</span>
            <button type="button" onClick={() => onCambio([])} disabled={disabled} className="text-danger hover:underline disabled:opacity-50">Quitar selección</button>
          </div>
          <ul className="max-h-40 divide-y divide-silver/60 overflow-y-auto rounded-lg border border-silver">
            {archivos.map((a, i) => (
              <li key={`${a.name}-${a.size}-${a.lastModified}`} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="min-w-0 truncate text-foreground">{a.name}</span>
                <button type="button" aria-label={`Quitar ${a.name}`} onClick={() => onCambio(archivos.filter((_, j) => j !== i))} disabled={disabled} className="shrink-0 text-muted hover:text-danger disabled:opacity-50">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
