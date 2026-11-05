"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { api } from "@/lib/captura-datos/cliente";
import { useSesion } from "@/lib/session-context";
import { useDatosEnCache } from "@/lib/captura-datos/useDatosEnCache";
import { mensajeError } from "./mensajeError";

const URL_ARCHIVOS = "/api/captura-datos/historial/archivos";

/** "historial_2026-01-02_a_2026-03-05.csv" → "2026-01-02 a 2026-03-05". */
const periodo = (nombre: string) => nombre.replace(/^historial_/, "").replace(/\.csv$/, "").replace("_a_", " a ");

export function ArchivoHistorial() {
  const { usuario } = useSesion();
  const { datos, error } = useDatosEnCache<{ archivos: { nombre: string }[] }>(usuario?.id, "historial:archivos", () => api(URL_ARCHIVOS));
  const [descargando, setDescargando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  async function descargar(nombre: string) {
    setDescargando(nombre);
    setFallo(null);
    try {
      const { url } = await api<{ url: string }>(`${URL_ARCHIVOS}?nombre=${encodeURIComponent(nombre)}`);
      window.location.assign(url);
    } catch (e) {
      setFallo(mensajeError(e, "No se pudo descargar."));
    } finally {
      setDescargando(null);
    }
  }

  if (!datos?.archivos.length && !error) return null;
  return (
    <details className="rounded-2xl border border-silver bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-medium text-foreground">Historial anterior (CSV)</summary>
      <p className="mt-2 text-xs text-muted">Los movimientos de más de 6 meses se borran y antes se guardan en un CSV.</p>
      {(error || fallo) && <p role="alert" className="mt-2 text-danger">{error ?? fallo}</p>}
      <ul className="mt-2 divide-y divide-silver/60">
        {datos?.archivos.map((a) => (
          <li key={a.nombre} className="flex items-center justify-between gap-2 py-1.5">
            <span>{periodo(a.nombre)}</span>
            <button onClick={() => descargar(a.nombre)} disabled={descargando === a.nombre} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1 hover:bg-silver/40 disabled:opacity-50">
              <Download className="h-4 w-4" /> Descargar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
