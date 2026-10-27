"use client";

import { useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
import { FileText, Loader2, ReceiptText, SquareDashedMousePointer, TextSelect, X, ZoomIn, ZoomOut } from "lucide-react";
import type { Box } from "@/lib/captura-datos/fields";
import { ajustarImagen, CAJA_DATOS, CAJA_VOUCHER_PREDETERMINADA, cajaDesdePuntos, transformParaCaja, type Punto, type Tamano } from "@/lib/captura-datos/visor";

const ZOOM_MAXIMO = 8;
const PASO_ZOOM = 0.5;
const ANIMACION_MS = 250;

interface VisorHojaProps {
  url: string;
  esPdf: boolean;
  voucherBox: Box | null;
  onVoucherBox: (caja: Box | null) => void;
}

export function VisorHoja({ url, esPdf, voucherBox, onVoucherBox }: VisorHojaProps) {
  const zoom = useRef<ReactZoomPanPinchRef>(null);
  const vista = useRef<HTMLDivElement>(null);
  const [tamanoVista, setTamanoVista] = useState<Tamano>({ w: 0, h: 0 });
  const [natural, setNatural] = useState<Tamano>({ w: 0, h: 0 });
  const [cargada, setCargada] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [trazo, setTrazo] = useState<{ desde: Punto; hasta: Punto } | null>(null);
  const imagen = ajustarImagen(natural, tamanoVista);
  const listo = imagen.w > 0;

  useEffect(() => {
    const el = vista.current;
    if (!el) return;
    const observador = new ResizeObserver(() => setTamanoVista({ w: el.clientWidth, h: el.clientHeight }));
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  // Sin crear un objeto nuevo si el tamaño no cambió: este se llama desde el ref en cada render.
  function fijarNatural(img: HTMLImageElement) {
    setNatural((previo) => (previo.w === img.naturalWidth && previo.h === img.naturalHeight ? previo : { w: img.naturalWidth, h: img.naturalHeight }));
    setCargada(true);
  }

  function ampliar(caja: Box) {
    const t = transformParaCaja(caja, imagen, tamanoVista, ZOOM_MAXIMO);
    zoom.current?.setTransform(t.x, t.y, t.scale, ANIMACION_MS);
  }

  function hojaCompleta() {
    zoom.current?.setTransform((tamanoVista.w - imagen.w) / 2, (tamanoVista.h - imagen.h) / 2, 1, ANIMACION_MS);
  }

  const punto = (e: React.PointerEvent): Punto => {
    const r = vista.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  function terminarTrazo(e: React.PointerEvent) {
    if (!trazo || !zoom.current) return;
    const { positionX, positionY, scale } = zoom.current.instance.state;
    const caja = cajaDesdePuntos(trazo.desde, punto(e), { x: positionX, y: positionY, scale }, imagen);
    setTrazo(null);
    if (!caja) return;
    onVoucherBox(caja);
    setMarcando(false);
  }

  if (esPdf) {
    return (
      <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-silver bg-black/5">
        <iframe src={url} title="Hoja de inscripción (PDF)" className="min-h-0 flex-1" />
        <a href={url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 text-xs text-primary underline">Abrir el PDF en otra pestaña</a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div ref={vista} className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-silver bg-black/5">
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-30 flex flex-wrap items-center gap-1.5 [&_button]:pointer-events-auto">
          <BotonVisor onClick={() => ampliar(CAJA_DATOS)} disabled={!listo} icono={<TextSelect className="h-4 w-4" />}>Datos</BotonVisor>
          <BotonVisor onClick={() => ampliar(voucherBox ?? CAJA_VOUCHER_PREDETERMINADA)} disabled={!listo} icono={<ReceiptText className="h-4 w-4" />}>Voucher</BotonVisor>
          <BotonVisor onClick={() => { setTrazo(null); setMarcando((m) => !m); }} disabled={!listo} activo={marcando} icono={<SquareDashedMousePointer className="h-4 w-4" />}>
            {marcando ? "Dibuja el área…" : "Marcar voucher"}
          </BotonVisor>
          {voucherBox && !marcando && <BotonVisor onClick={() => onVoucherBox(null)} icono={<X className="h-4 w-4" />}>Quitar marca</BotonVisor>}
          <BotonVisor onClick={hojaCompleta} disabled={!listo} icono={<FileText className="h-4 w-4" />}>Hoja completa</BotonVisor>
          <span className="ml-auto flex gap-1.5">
            <BotonVisor onClick={() => zoom.current?.zoomOut(PASO_ZOOM, ANIMACION_MS)} disabled={!listo} etiqueta="Alejar" icono={<ZoomOut className="h-4 w-4" />} />
            <BotonVisor onClick={() => zoom.current?.zoomIn(PASO_ZOOM, ANIMACION_MS)} disabled={!listo} etiqueta="Acercar" icono={<ZoomIn className="h-4 w-4" />} />
          </span>
        </div>

        {!cargada && (
          <div role="status" aria-label="Cargando hoja" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-surface/80 text-sm text-muted">
            <Loader2 className="h-8 w-8 animate-spin text-primary" /> Cargando hoja…
          </div>
        )}
        <TransformWrapper
          // Se reinicia (para quedar centrada) solo al conocerse la imagen; redimensionar la ventana no pierde el zoom.
          key={`${natural.w}x${natural.h}-${listo}`}
          ref={zoom}
          minScale={1}
          maxScale={ZOOM_MAXIMO}
          centerOnInit
          panning={{ disabled: marcando }}
          doubleClick={{ disabled: marcando }}
        >
          <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: imagen.w || "100%", height: imagen.h || "100%" }}>
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => { if (el?.complete && el.naturalWidth) fijarNatural(el); }}
                src={url}
                alt="Hoja de inscripción"
                draggable={false}
                onLoad={(e) => fijarNatural(e.currentTarget)}
                onError={() => setCargada(true)}
                className="h-full w-full select-none object-contain"
              />
              {voucherBox && <Recuadro caja={voucherBox} />}
            </div>
          </TransformComponent>
        </TransformWrapper>

        {marcando && (
          <div
            className="absolute inset-0 z-20 cursor-crosshair touch-none"
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setTrazo({ desde: punto(e), hasta: punto(e) }); }}
            onPointerMove={(e) => trazo && setTrazo({ ...trazo, hasta: punto(e) })}
            onPointerUp={terminarTrazo}
            onPointerCancel={() => setTrazo(null)}
          >
            {trazo && (
              <div
                className="absolute border-2 border-dashed border-primary"
                style={{
                  left: Math.min(trazo.desde.x, trazo.hasta.x), top: Math.min(trazo.desde.y, trazo.hasta.y),
                  width: Math.abs(trazo.desde.x - trazo.hasta.x), height: Math.abs(trazo.desde.y - trazo.hasta.y),
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Recuadro({ caja }: { caja: Box }) {
  return (
    <div
      className="pointer-events-none absolute border-2 border-dashed border-primary"
      style={{ left: `${caja.x * 100}%`, top: `${caja.y * 100}%`, width: `${caja.w * 100}%`, height: `${caja.h * 100}%` }}
    />
  );
}

interface BotonVisorProps {
  onClick: () => void;
  icono: React.ReactNode;
  disabled?: boolean;
  activo?: boolean;
  etiqueta?: string;
  children?: React.ReactNode;
}

function BotonVisor({ onClick, icono, disabled, activo, etiqueta, children }: BotonVisorProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={etiqueta}
      title={etiqueta}
      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs disabled:opacity-40 ${activo ? "border-primary bg-primary/10 text-primary" : "border-silver bg-surface"}`}
    >
      {icono}{children}
    </button>
  );
}
