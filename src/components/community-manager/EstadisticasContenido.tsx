"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, MessageSquare, Trash2, FileText, Users, Search } from "lucide-react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Kpi } from "@/components/charts/Kpi";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import type { EstadisticasPlataforma, Plataforma } from "@/lib/community-manager";

function delta(n: number): string {
  return n >= 0 ? `↑ ${n}% vs. anterior` : `↓ ${Math.abs(n)}% vs. anterior`;
}

const TITULO_PLATAFORMA: Record<Plataforma, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  skool: "Skool",
};

// Contenido de la pantalla de Estadísticas — una instancia por red (la
// navegación entre redes vive en el menú lateral, ver NAV_COMMUNITY_MANAGER
// en Sidebar.tsx). plataforma = null es la vista "General" (todas las
// redes). Los datos salen de GET /api/community-manager/estadisticas, que
// lee los registros reales de Moderación — ya no son de ejemplo.
export function EstadisticasContenido({ plataforma }: { plataforma: Plataforma | null }) {
  const [busqueda, setBusqueda] = useState("");
  const [datos, setDatos] = useState<EstadisticasPlataforma | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDatos(null);
    setError(null);
    const params = plataforma ? `?plataforma=${plataforma}` : "";
    fetch(`/api/community-manager/estadisticas${params}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar las estadísticas");
        setDatos(data.estadisticas);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las estadísticas"));
  }, [plataforma]);

  const historialFiltrado = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return datos.historial;
    return datos.historial.filter(
      (h) => h.usuario.toLowerCase().includes(q) || h.comentario.toLowerCase().includes(q) || h.motivo.toLowerCase().includes(q)
    );
  }, [datos, busqueda]);

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Estadísticas {plataforma && <span className="text-muted">· {TITULO_PLATAFORMA[plataforma]}</span>}
          </h1>
          <p className="text-sm text-muted">
            {plataforma ? `Resumen de moderación en ${TITULO_PLATAFORMA[plataforma]}.` : "Resumen general de moderación en redes sociales y Skool."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-silver bg-surface px-3 py-2 text-xs text-muted">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
          Últimos 30 días vs. los 30 anteriores
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      {!datos && !error ? (
        <p className="py-12 text-center text-sm text-muted">Cargando…</p>
      ) : datos ? (
        <>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <Kpi
              grande
              icon={MessageSquare}
              label="Comentarios revisados"
              sub={delta(datos.comentariosRevisadosDelta)}
              value={datos.comentariosRevisados}
              tone="primary"
            />
            <Kpi
              grande
              icon={Trash2}
              label="Comentarios borrados"
              sub={delta(datos.comentariosBorradosDelta)}
              value={datos.comentariosBorrados}
              tone="danger"
            />
            <Kpi
              grande
              icon={FileText}
              label="Publicaciones revisadas"
              sub={delta(datos.publicacionesRevisadasDelta)}
              value={datos.publicacionesRevisadas}
              tone="teal"
            />
            <Kpi
              grande
              icon={Users}
              label="Interacciones totales"
              sub={delta(datos.interaccionesTotalesDelta)}
              value={datos.interaccionesTotales}
              tone="purple"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Motivos de eliminación" subtitle="Comentarios borrados, por motivo" alto="h-80">
              {datos.motivosEliminacion.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted">Todavía no hay comentarios eliminados.</p>
              ) : (
                <DonutChart
                  datos={datos.motivosEliminacion}
                  total={datos.motivosEliminacion.reduce((s, d) => s + d.cantidad, 0)}
                />
              )}
            </ChartCard>
            <ChartCard title="Palabras clave más comunes" subtitle="En comentarios revisados" alto="h-80">
              {datos.palabrasClave.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted">Todavía no hay comentarios registrados.</p>
              ) : (
                <BarChart datos={datos.palabrasClave} />
              )}
            </ChartCard>
          </div>

          <div className="shell rounded-[1.75rem] p-2 diffused">
            <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-foreground">Historial de comentarios</h3>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
                  <input
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar por usuario o palabra clave…"
                    className="w-72 rounded-lg border border-silver bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-base">
                  <thead>
                    <tr className="border-b border-silver text-sm font-semibold uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap py-3 pr-4">Fecha</th>
                      <th className="whitespace-nowrap py-3 pr-4">Usuario</th>
                      <th className="whitespace-nowrap py-3 pr-4">Comentario</th>
                      <th className="whitespace-nowrap py-3 pr-4">Motivo</th>
                      <th className="whitespace-nowrap py-3">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historialFiltrado.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-muted">
                          {datos.historial.length === 0 ? "Todavía no hay comentarios registrados." : "Sin resultados para esa búsqueda."}
                        </td>
                      </tr>
                    ) : (
                      historialFiltrado.map((h, i) => (
                        <tr key={i} className="border-b border-silver/60 last:border-0">
                          <td className="whitespace-nowrap py-3 pr-4 text-muted">{h.fecha}</td>
                          <td className="whitespace-nowrap py-3 pr-4 font-medium text-foreground">{h.usuario}</td>
                          <td className="py-3 pr-4 text-foreground">{h.comentario}</td>
                          <td className="whitespace-nowrap py-3 pr-4 text-muted">{h.motivo}</td>
                          <td className="whitespace-nowrap py-3">
                            <span
                              className={
                                h.accion === "Eliminado"
                                  ? "font-medium text-danger"
                                  : h.accion === "Respuesta"
                                    ? "font-medium text-primary"
                                    : "text-muted"
                              }
                            >
                              {h.accion}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
