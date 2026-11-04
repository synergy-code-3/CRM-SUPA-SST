"use client";

import { useState } from "react";
import { ListChecks, RefreshCw } from "lucide-react";
import { DetalleCapturaModal } from "./DetalleCapturaModal";
import { api } from "@/lib/captura-datos/cliente";
import { useSesion } from "@/lib/session-context";
import { useDatosEnCache } from "@/lib/captura-datos/useDatosEnCache";
import { duracionLegible, fechaHoraCompleta, type ResumenCaptura } from "@/lib/captura-datos/historial";

interface Respuesta {
  filas: ResumenCaptura[];
  truncado: boolean;
}


/** Una sola línea: sin alertas, la alerta que hay, o "Varias alertas" (el desglose está en el detalle). */
function Alertas({ f }: { f: ResumenCaptura }) {
  const desglose = [f.rapidas ? `${f.rapidas} muy rápidas` : "", f.sinCambios ? `${f.sinCambios} sin cambios` : ""].filter(Boolean);
  if (desglose.length > 1) return <span title={desglose.join(" · ")} className="font-semibold text-danger">⚠ Varias alertas</span>;
  if (desglose.length === 1) return <span className="font-semibold text-danger">{desglose[0]}</span>;
  return <span className="text-muted">{f.sinDatos > 0 ? `${f.sinDatos} sin medición` : "Sin alertas"}</span>;
}

/** Quién capturó qué: inicio, fin y ritmo por persona y evento, para detectar a quien confirma sin leer. */
export function ReporteCaptura({ eventoId }: { eventoId?: string }) {
  const { usuario } = useSesion();
  const [detalle, setDetalle] = useState<ResumenCaptura | null>(null);
  const { datos, error, recargar } = useDatosEnCache<Respuesta>(usuario?.id, `reporte:${eventoId ?? "todos"}`, () => {
    const params = new URLSearchParams();
    if (eventoId) params.set("eventoId", eventoId);
    return api<Respuesta>(`/api/captura-datos/historial/reporte?${params}`);
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border-t border-silver pt-3 text-sm">
        <h3 className="text-base font-semibold text-foreground">Reporte de captura</h3>
        <button onClick={recargar} disabled={!datos && !error} title="Volver a pedir los datos (lo ya visto se guarda mientras la pestaña esté abierta)" className="ml-auto inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 hover:bg-silver/40 disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Actualizar
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!datos && !error && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
      {datos?.filas.length === 0 && <p className="py-6 text-center text-sm text-muted">Todavía no hay hojas confirmadas.</p>}
      {datos?.truncado && <p className="text-xs text-warning">Hay demasiadas hojas: el reporte solo cubre las más recientes.</p>}
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
                <tr key={`${f.eventoId}|${f.usuarioId ?? f.usuario}`} className="align-middle">
                  <td className="py-2 pr-3 font-medium text-foreground">{f.usuario}</td>
                  {!eventoId && <td className="pr-3">{f.eventoNombre ?? "Evento borrado"}</td>}
                  <td className="pr-3">{f.inicio ? fechaHoraCompleta(f.inicio) : "—"}</td>
                  <td className="pr-3">{f.fin ? fechaHoraCompleta(f.fin) : "—"}</td>
                  <td className="pr-3">{f.hojas}</td>
                  <td className="pr-3">{f.promedioSegundos === null ? "—" : duracionLegible(f.promedioSegundos)}</td>
                  <td className="text-xs"><Alertas f={f} /></td>
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
      {detalle && <DetalleCapturaModal fila={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}

