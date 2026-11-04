"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye, FileDown, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { VerHojaModal } from "./VerHojaModal";
import { api } from "@/lib/captura-datos/cliente";
import { duracionLegible, estadisticasDeCaptura, fechaHoraCompleta, type HojaDeCaptura, type ResumenCaptura } from "@/lib/captura-datos/historial";
import { abrirInforme } from "@/lib/captura-datos/pdf-captura";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

type Filtro = "todas" | "rapidas" | "sinCambios";
const FILTROS: [Filtro, string][] = [["todas", "Todas"], ["rapidas", "Muy rápidas"], ["sinCambios", "Sin cambios"]];
const seg = (s: number | null) => (s === null ? "—" : duracionLegible(s));

interface Props {
  fila: ResumenCaptura;
  /** Query con las fechas del reporte (fechaDesde / fechaHasta ya armadas). */
  params: URLSearchParams;
  periodo: string;
  onCerrar: () => void;
}

/** Detalle hoja por hoja de lo que una persona capturó en un evento, con descarga en PDF. */
export function DetalleCapturaModal({ fila, params, periodo, onCerrar }: Props) {
  const [hojas, setHojas] = useState<HojaDeCaptura[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [viendo, setViendo] = useState<HojaCaptura | null>(null);
  const [abriendo, setAbriendo] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(params);
    if (fila.eventoId) p.set("eventoId", fila.eventoId);
    if (fila.usuarioId) p.set("usuarioId", fila.usuarioId);
    let vigente = true;
    api<{ hojas: HojaDeCaptura[] }>(`/api/captura-datos/historial/reporte?${p}`)
      .then((r) => vigente && setHojas(r.hojas))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar el detalle."));
    return () => { vigente = false; };
  }, [fila, params]);

  const visibles = useMemo(() => (hojas ?? []).filter((h) => filtro === "todas" || (filtro === "rapidas" ? h.rapida : h.sinCambios)), [hojas, filtro]);
  const stats = useMemo(() => estadisticasDeCaptura(hojas ?? []), [hojas]);

  async function verHoja(id: string) {
    setAbriendo(id);
    try {
      setViendo((await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${id}`)).hoja);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la hoja.");
    } finally {
      setAbriendo(null);
    }
  }

  function informe(imprimir: boolean) {
    if (!hojas) return;
    const abierto = abrirInforme({ usuario: fila.usuario, evento: fila.eventoNombre ?? "Evento borrado", periodo, hojas }, imprimir);
    if (!abierto) setError("El navegador bloqueó la ventana. Permite las ventanas emergentes para este sitio.");
  }

  return (
    <Modal titulo={`Detalle de ${fila.usuario}`} onCerrar={onCerrar} tamano="max-h-[88vh] sm:max-w-5xl">
      <div className="space-y-3 text-sm">
        <p className="text-muted">{fila.eventoNombre ?? "Evento borrado"} · {periodo}</p>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {!hojas && !error && <p className="py-6 text-center text-muted">Cargando…</p>}
        {hojas && (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span>{hojas.length} hojas</span>
              <span>Mínimo {seg(stats.minimo)}</span>
              <span>Mediana {seg(stats.mediana)}</span>
              <span>Máximo {seg(stats.maximo)}</span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => informe(false)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm hover:bg-silver/40">
                  <Eye className="h-4 w-4" /> Ver PDF
                </button>
                <button onClick={() => informe(true)} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm hover:bg-silver/40">
                  <FileDown className="h-4 w-4" /> Descargar PDF
                </button>
              </span>
            </div>
            <div className="flex gap-2">
              {FILTROS.map(([k, etiqueta]) => (
                <button key={k} onClick={() => setFiltro(k)} aria-pressed={filtro === k} className={`rounded-lg px-3 py-1 text-xs ${filtro === k ? "bg-primary text-white" : "border border-silver"}`}>{etiqueta}</button>
              ))}
            </div>
            {visibles.length === 0 ? <p className="py-4 text-center text-muted">Ninguna hoja coincide.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[46rem] text-left text-xs">
                  <thead className="text-muted">
                    <tr><th className="py-1.5 pr-3 font-medium">Foto</th><th className="pr-3 font-medium">Folio</th><th className="pr-3 font-medium">Inició</th><th className="pr-3 font-medium">Terminó</th><th className="pr-3 font-medium">Duración</th><th className="pr-3 font-medium">Guardados</th><th className="pr-3 font-medium">Desde la anterior</th><th className="font-medium">Alertas</th><th /></tr>
                  </thead>
                  <tbody className="divide-y divide-silver/60">
                    {visibles.map((h, i) => (
                      <tr key={h.hojaId ?? i} className={`align-top ${h.rapida || h.sinCambios ? "bg-warning/5" : ""}`}>
                        <td className="py-1.5 pr-3 font-medium text-foreground">{h.foto ?? "No disponible"}</td>
                        <td className="pr-3">{h.folio || "—"}</td>
                        <td className="pr-3">{h.inicio ? fechaHoraCompleta(h.inicio) : "—"}</td>
                        <td className="pr-3">{fechaHoraCompleta(h.fin)}</td>
                        <td className="pr-3">{seg(h.segundos)}</td>
                        <td className="pr-3">{h.guardados ?? "—"}</td>
                        <td className="pr-3">{seg(h.desdeAnteriorSegundos)}</td>
                        <td className="space-x-1">
                          {h.rapida && <span className="rounded bg-danger/10 px-1.5 py-0.5 font-medium text-danger">Muy rápida</span>}
                          {h.sinCambios && <span className="rounded bg-warning/10 px-1.5 py-0.5 font-medium text-warning">Sin cambios</span>}
                          {h.segundos === null && <span className="text-muted">Sin medición</span>}
                        </td>
                        <td>{h.hojaId && h.foto && <button onClick={() => void verHoja(h.hojaId!)} disabled={abriendo !== null} aria-label="Ver hoja" className="text-primary disabled:opacity-60">{abriendo === h.hojaId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
      {viendo && <VerHojaModal hoja={viendo} onCerrar={() => setViendo(null)} />}
    </Modal>
  );
}
