"use client";

import { useEffect, useState } from "react";
import { Download, FileImage, Loader2, X } from "lucide-react";
import type { HojaDeCliente } from "@/lib/captura-datos/db";

const urlArchivo = (clienteId: string, hojaId: string, descargar = false) =>
  `/api/clientes/${encodeURIComponent(clienteId)}/hojas/${hojaId}/archivo${descargar ? "?descargar=1" : ""}`;

const etiquetaHoja = (h: HojaDeCliente) => `${h.folio ? `Folio ${h.folio} · ` : ""}${h.eventoNombre}${h.eventoFecha ? ` · ${h.eventoFecha}` : ""}`;

const CLASE_ICONO = "ease-spring rounded-lg p-1 text-muted transition hover:bg-black/5 hover:text-foreground";

/** Íconos "ver hoja" y "descargar" junto al título de la tarjeta; no se muestran si el cliente no tiene hojas confirmadas. */
export function HojaClienteAcciones({ clienteId }: { clienteId: string }) {
  const [hojas, setHojas] = useState<HojaDeCliente[]>([]);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setHojas([]);
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/hojas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelado) setHojas(data?.hojas ?? []);
      })
      .catch(() => {
        if (!cancelado) setHojas([]);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  if (hojas.length === 0) return null;
  return (
    <>
      <span className="flex items-center gap-0.5">
        <button type="button" onClick={() => setAbierto(true)} title="Ver hoja del cliente" aria-label="Ver hoja del cliente" className={CLASE_ICONO}>
          <FileImage className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {hojas.length === 1 ? (
          <a href={urlArchivo(clienteId, hojas[0].id, true)} download title="Descargar hoja del cliente" aria-label="Descargar hoja del cliente" className={CLASE_ICONO}>
            <Download className="h-4 w-4" strokeWidth={1.75} />
          </a>
        ) : (
          <button type="button" onClick={() => setAbierto(true)} title="Elegir y descargar hoja del cliente" aria-label="Elegir y descargar hoja del cliente" className={CLASE_ICONO}>
            <Download className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </span>
      {abierto && <HojaClienteCajon clienteId={clienteId} hojas={hojas} onCerrar={() => setAbierto(false)} />}
    </>
  );
}

function HojaClienteCajon({ clienteId, hojas, onCerrar }: { clienteId: string; hojas: HojaDeCliente[]; onCerrar: () => void }) {
  const [hojaId, setHojaId] = useState(hojas[0].id);
  const [cargada, setCargada] = useState(false);
  const hoja = hojas.find((h) => h.id === hojaId) ?? hojas[0];
  const url = urlArchivo(clienteId, hoja.id);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-start">
      <button aria-label="Cerrar hoja" onClick={onCerrar} className="animate-fade-in-fast absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label="Hoja del cliente" className="relative flex h-full w-full flex-col gap-3 bg-surface p-4 shadow-2xl sm:w-[520px]">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Hoja del cliente</h3>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className={CLASE_ICONO}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {hojas.length > 1 && (
          <select
            aria-label="Hoja"
            value={hoja.id}
            onChange={(e) => {
              setHojaId(e.target.value);
              setCargada(false);
            }}
            className="rounded-lg border border-silver bg-surface px-2 py-1.5 text-sm"
          >
            {hojas.map((h) => (
              <option key={h.id} value={h.id}>{etiquetaHoja(h)}</option>
            ))}
          </select>
        )}
        {hojas.length === 1 && <p className="text-xs text-muted">{etiquetaHoja(hoja)}</p>}
        <div className="relative min-h-0 flex-1">
          {!cargada && (
            <div role="status" aria-label="Cargando hoja" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-surface/80 text-sm text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" /> Cargando hoja…
            </div>
          )}
          {hoja.esPdf ? (
            <iframe key={hoja.id} src={url} title="Hoja" onLoad={() => setCargada(true)} className="h-full w-full rounded-lg border border-silver" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={hoja.id} src={url} alt="Hoja" onLoad={() => setCargada(true)} onError={() => setCargada(true)} className="h-full w-full rounded-lg border border-silver object-contain" />
          )}
        </div>
        <a href={urlArchivo(clienteId, hoja.id, true)} download className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Download className="h-4 w-4" /> Descargar
        </a>
      </div>
    </div>
  );
}
