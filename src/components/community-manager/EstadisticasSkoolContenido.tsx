"use client";

import { useEffect, useState } from "react";
import { GraduationCap, MessagesSquare, Search } from "lucide-react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Kpi } from "@/components/charts/Kpi";
import { BarChart } from "@/components/charts/BarChart";
import type { AtencionSkool, EstadisticasSkool } from "@/lib/community-manager";

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Skool no tiene "publicaciones"/"borrados" — solo preguntas y respuestas,
// así que sus Estadísticas son más chicas que las de redes sociales
// (ver EstadisticasContenido.tsx): total de atenciones, cuántas en los
// últimos 30 días (con su delta), las preguntas más repetidas y, debajo,
// el propio listado de registros (Moderación ya no lo muestra — ahí solo
// queda el formulario para cargar uno nuevo, ver SkoolAtencionContenido).
export function EstadisticasSkoolContenido() {
  const [datos, setDatos] = useState<EstadisticasSkool | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [atenciones, setAtenciones] = useState<AtencionSkool[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscandoEnServidor, setBuscandoEnServidor] = useState(false);

  useEffect(() => {
    fetch("/api/community-manager/skool/estadisticas")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar las estadísticas");
        setDatos(data.estadisticas);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las estadísticas"));
  }, []);

  async function cargarAtenciones(q?: string) {
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const res = await fetch(`/api/community-manager/skool/atenciones${params}`);
    const data = await res.json();
    if (res.ok) setAtenciones(data.atenciones);
  }

  useEffect(() => {
    cargarAtenciones();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setBuscandoEnServidor(true);
      cargarAtenciones(busqueda).finally(() => setBuscandoEnServidor(false));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  return (
    <div className="space-y-7">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
          Estadísticas · Skool
        </h1>
        <p className="text-sm text-muted">Resumen del registro de atención.</p>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      {!datos && !error ? (
        <p className="py-12 text-center text-sm text-muted">Cargando…</p>
      ) : datos ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Kpi
              grande
              icon={MessagesSquare}
              label="Atenciones (últimos 30 días)"
              sub={
                datos.atencionesRecientesDelta >= 0
                  ? `↑ ${datos.atencionesRecientesDelta}% vs. anterior`
                  : `↓ ${Math.abs(datos.atencionesRecientesDelta)}% vs. anterior`
              }
              value={datos.atencionesRecientes}
              tone="primary"
            />
            <Kpi grande icon={GraduationCap} label="Atenciones registradas en total" sub="histórico" value={datos.totalAtenciones} tone="teal" />
          </div>

          <ChartCard title="Preguntas más comunes" subtitle="Por frecuencia de palabras en las consultas" alto="h-80">
            {datos.preguntasComunes.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted">Todavía no hay registros.</p>
            ) : (
              <BarChart datos={datos.preguntasComunes} />
            )}
          </ChartCard>
        </>
      ) : null}

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-foreground">Registro de atención</h3>
            <div className="relative max-w-md flex-1 sm:min-w-[280px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre o palabra clave…"
                className="w-full rounded-lg border border-silver bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-base">
              <thead>
                <tr className="border-b border-silver text-sm font-semibold uppercase tracking-wide text-muted">
                  <th className="whitespace-nowrap py-3 pr-4">Fecha</th>
                  <th className="whitespace-nowrap py-3 pr-4">Usuario</th>
                  <th className="py-3 pr-4">Pregunta / Consulta</th>
                  <th className="py-3">Respuesta proporcionada</th>
                </tr>
              </thead>
              <tbody>
                {!atenciones ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted">
                      {buscandoEnServidor ? "Buscando…" : "Cargando…"}
                    </td>
                  </tr>
                ) : atenciones.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted">
                      {busqueda.trim() ? "Sin resultados para esa búsqueda." : "Todavía no hay registros."}
                    </td>
                  </tr>
                ) : (
                  atenciones.map((a) => (
                    <tr key={a.id} className="border-b border-silver/60 last:border-0 align-top">
                      <td className="whitespace-nowrap py-3 pr-4 text-muted">{formatearFecha(a.fecha)}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium text-foreground">{a.usuario}</td>
                      <td className="py-3 pr-4 text-foreground">{a.pregunta}</td>
                      <td className="py-3 text-foreground">{a.respuesta}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
