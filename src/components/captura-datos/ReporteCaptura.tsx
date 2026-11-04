"use client";

import { useEffect, useMemo, useState } from "react";
import { ListChecks } from "lucide-react";
import { DetalleCapturaModal } from "./DetalleCapturaModal";
import { api } from "@/lib/captura-datos/cliente";
import { duracionLegible, fechaHoraCompleta, type ResumenCaptura } from "@/lib/captura-datos/historial";

interface Respuesta {
  filas: ResumenCaptura[];
  truncado: boolean;
}

const dia = (d: string, fin: boolean) => new Date(`${d}T${fin ? "23:59:59.999" : "00:00:00"}`).toISOString();
const CAMPO = "rounded-lg border border-silver bg-surface px-3 py-1.5 text-sm";
const aviso = (n: number, texto: string) => (n > 0 ? <span className="font-semibold text-danger">{n} {texto}</span> : <span className="text-muted">0 {texto}</span>);

/** Quién capturó qué: inicio, fin y ritmo por persona y evento, para detectar a quien confirma sin leer. */
export function ReporteCaptura({ eventoId }: { eventoId?: string }) {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<ResumenCaptura | null>(null);
  const fechas = useMemo(() => {
    const p = new URLSearchParams();
    if (desde) p.set("fechaDesde", dia(desde, false));
    if (hasta) p.set("fechaHasta", dia(hasta, true));
    return p;
  }, [desde, hasta]);
  const periodo = desde || hasta ? `${desde || "inicio"} a ${hasta || "hoy"}` : "Todo el tiempo";

  useEffect(() => {
    const params = new URLSearchParams(fechas);
    if (eventoId) params.set("eventoId", eventoId);
    let vigente = true;
    setDatos(null);
    setError(null);
    api<Respuesta>(`/api/captura-datos/historial/reporte?${params}`)
      .then((r) => vigente && setDatos(r))
      .catch((e) => vigente && setError(e instanceof Error ? e.message : "No se pudo cargar el reporte."));
    return () => { vigente = false; };
  }, [eventoId, fechas]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1">Desde <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={CAMPO} /></label>
        <label className="flex items-center gap-1">Hasta <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={CAMPO} /></label>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!datos && !error && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
      {datos?.filas.length === 0 && <p className="py-6 text-center text-sm text-muted">No hay hojas confirmadas en este periodo.</p>}
      {datos?.truncado && <p className="text-xs text-warning">Hay demasiadas hojas: el reporte solo cubre las más recientes. Acota las fechas.</p>}
      {datos && datos.filas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Persona</th>
                {!eventoId && <th className="pr-3 font-medium">Evento</th>}
                <th className="pr-3 font-medium">Empezó</th>
                <th className="pr-3 font-medium">Terminó</th>
                <th className="pr-3 font-medium">Hojas</th>
                <th className="pr-3 font-medium">Promedio</th>
                <th className="font-medium">Alertas</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-silver/60">
              {datos.filas.map((f) => (
                <tr key={`${f.eventoId}|${f.usuarioId ?? f.usuario}`} className="align-top">
                  <td className="py-2 pr-3 font-medium text-foreground">{f.usuario}</td>
                  {!eventoId && <td className="pr-3">{f.eventoNombre ?? "Evento borrado"}</td>}
                  <td className="pr-3">{f.inicio ? fechaHoraCompleta(f.inicio) : "—"}</td>
                  <td className="pr-3">{f.fin ? fechaHoraCompleta(f.fin) : "—"}</td>
                  <td className="pr-3">{f.hojas}</td>
                  <td className="pr-3">{f.promedioSegundos === null ? "—" : duracionLegible(f.promedioSegundos)}</td>
                  <td className="space-y-0.5 text-xs">
                    <p>{aviso(f.rapidas, "muy rápidas")}</p>
                    <p>{aviso(f.sinCambios, "sin cambios")}</p>
                    {f.sinDatos > 0 && <p className="text-muted">{f.sinDatos} sin medición</p>}
                  </td>
                  <td className="text-right">
                    {f.eventoId && f.usuarioId && (
                      <button onClick={() => setDetalle(f)} aria-label={`Ver detalle de ${f.usuario}`} title="Ver detalle hoja por hoja" className="rounded-lg p-1 text-primary hover:bg-silver/40">
                        <ListChecks className="h-5 w-5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {detalle && <DetalleCapturaModal fila={detalle} params={fechas} periodo={periodo} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

