"use client";

import { useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { Download, FileImage, Loader2, Search, X, ZoomIn, ZoomOut } from "lucide-react";
import type { HojaDeCliente } from "@/lib/captura-datos/db";

const urlArchivo = (clienteId: string, hojaId: string, descargar = false) =>
  `/api/clientes/${encodeURIComponent(clienteId)}/hojas/${hojaId}/archivo${descargar ? "?descargar=1" : ""}`;

const etiquetaHoja = (h: HojaDeCliente) => `${h.folio ? `Folio ${h.folio} · ` : ""}${h.eventoNombre}${h.eventoFecha ? ` · ${h.eventoFecha}` : ""}`;

const CLASE_ICONO = "ease-spring rounded-lg p-1 text-muted transition hover:bg-black/5 hover:text-foreground";

const VIGENCIA_CACHE_MS = 60_000;
const cacheHojas = new Map<string, { hojas: HojaDeCliente[]; en: number }>();

/** Íconos "ver hoja" y "descargar" junto al título de la tarjeta; no se muestran si el cliente no tiene hojas confirmadas. */
export function HojaClienteAcciones({ clienteId }: { clienteId: string }) {
  const [hojas, setHojas] = useState<HojaDeCliente[]>(() => cacheHojas.get(clienteId)?.hojas ?? []);
  const [cargando, setCargando] = useState(() => !cacheHojas.has(clienteId));
  const [abierto, setAbierto] = useState(false);
  const precargada = useRef<string | null>(null);

  // Al acercarse al ícono se descarga la imagen para que el cajón la muestre al instante (los PDF no se precargan).
  function precargar() {
    const primera = hojas[0];
    if (!primera || primera.esPdf || precargada.current === primera.id) return;
    precargada.current = primera.id;
    new Image().src = urlArchivo(clienteId, primera.id);
  }

  useEffect(() => {
    let cancelado = false;
    const previo = cacheHojas.get(clienteId);
    setHojas(previo?.hojas ?? []);
    setCargando(!previo);
    if (previo && Date.now() - previo.en < VIGENCIA_CACHE_MS) return;
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/hojas`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelado) return;
        const lista: HojaDeCliente[] = data?.hojas ?? [];
        if (data) cacheHojas.set(clienteId, { hojas: lista, en: Date.now() });
        setHojas(lista);
      })
      .catch(() => {
        if (!cancelado) setHojas([]);
      })
      .finally(() => {
        if (!cancelado) setCargando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  return (
    <>
      <span className="flex h-6 w-14 items-center justify-end gap-0.5" aria-busy={cargando}>
        {cargando && <Search role="status" aria-label="Buscando hoja del cliente" className="h-4 w-4 animate-pulse text-muted" strokeWidth={1.75} />}
        {!cargando && hojas.length > 0 && <>
        <button type="button" onClick={() => setAbierto(true)} onPointerEnter={precargar} onFocus={precargar} title="Ver hoja del cliente" aria-label="Ver hoja del cliente" className={CLASE_ICONO}>
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
        </>}
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
    <div className="pointer-events-none fixed inset-y-0 left-0 z-[60] flex w-full justify-start sm:w-auto">
      <div role="dialog" aria-label="Hoja del cliente" className="pointer-events-auto relative flex h-full w-full flex-col gap-3 border-r border-silver bg-surface p-4 shadow-2xl sm:w-[520px]">
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
            <ImagenConZoom key={hoja.id} url={url} onCargada={() => setCargada(true)} />
          )}
        </div>
        <a href={urlArchivo(clienteId, hoja.id, true)} download className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Download className="h-4 w-4" /> Descargar
        </a>
      </div>
    </div>
  );
}

function ImagenConZoom({ url, onCargada }: { url: string; onCargada: () => void }) {
  return (
    <TransformWrapper minScale={1} maxScale={8} centerOnInit doubleClick={{ mode: "zoomIn", step: 1 }}>
      {({ zoomIn, zoomOut, resetTransform }) => (
        <div className="relative h-full w-full overflow-hidden rounded-lg border border-silver bg-black/5">
          <div className="absolute right-2 top-2 z-20 flex gap-1.5">
            <button type="button" onClick={() => zoomOut(0.5)} aria-label="Alejar" className="rounded-lg border border-silver bg-surface p-1.5"><ZoomOut className="h-4 w-4" /></button>
            <button type="button" onClick={() => zoomIn(0.5)} aria-label="Acercar" className="rounded-lg border border-silver bg-surface p-1.5"><ZoomIn className="h-4 w-4" /></button>
            <button type="button" onClick={() => resetTransform()} className="rounded-lg border border-silver bg-surface px-2 text-xs">Restablecer</button>
          </div>
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Hoja" draggable={false} onLoad={onCargada} onError={onCargada} className="h-full w-full select-none object-contain" />
          </TransformComponent>
        </div>
      )}
    </TransformWrapper>
  );
}
