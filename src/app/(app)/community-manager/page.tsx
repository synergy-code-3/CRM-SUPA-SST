"use client";

import { useMemo, useState } from "react";
import {
  LayoutGrid,
  Facebook,
  Instagram,
  Music2,
  GraduationCap,
  Calendar,
  MessageSquare,
  Trash2,
  FileText,
  Users,
  Search,
} from "lucide-react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Kpi } from "@/components/charts/Kpi";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { ESTADISTICAS_POR_PLATAFORMA, estadisticasGenerales, type Plataforma } from "@/components/community-manager/mock-data";

type TabEstadisticas = "general" | Plataforma;

const TABS: { key: TabEstadisticas; label: string; icon: typeof LayoutGrid }[] = [
  { key: "general", label: "General", icon: LayoutGrid },
  { key: "facebook", label: "Facebook", icon: Facebook },
  { key: "instagram", label: "Instagram", icon: Instagram },
  { key: "tiktok", label: "TikTok", icon: Music2 },
  { key: "skool", label: "Skool", icon: GraduationCap },
];

function delta(n: number): string {
  return n >= 0 ? `↑ ${n}% vs. anterior` : `↓ ${Math.abs(n)}% vs. anterior`;
}

export default function CommunityManagerEstadisticasPage() {
  const [tab, setTab] = useState<TabEstadisticas>("general");
  const [busqueda, setBusqueda] = useState("");

  const datos = useMemo(() => (tab === "general" ? estadisticasGenerales() : ESTADISTICAS_POR_PLATAFORMA[tab]), [tab]);

  const historialFiltrado = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return datos.historial;
    return datos.historial.filter(
      (h) => h.usuario.toLowerCase().includes(q) || h.comentario.toLowerCase().includes(q) || h.motivo.toLowerCase().includes(q)
    );
  }, [datos.historial, busqueda]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Estadísticas</h1>
          <p className="text-sm text-muted">Resumen de moderación en redes sociales y Skool.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-silver bg-surface px-3 py-2 text-xs text-muted">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
          1 sept 2026 – 30 sept 2026
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-silver bg-surface-2 p-1.5">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`ease-spring flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tab === key ? "bg-surface text-primary-deep shadow-sm" : "text-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
            {label}
          </button>
        ))}
      </nav>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={MessageSquare}
          label="Comentarios revisados"
          sub={delta(datos.comentariosRevisadosDelta)}
          value={datos.comentariosRevisados}
          tone="primary"
        />
        <Kpi
          icon={Trash2}
          label="Comentarios borrados"
          sub={delta(datos.comentariosBorradosDelta)}
          value={datos.comentariosBorrados}
          tone="danger"
        />
        <Kpi
          icon={FileText}
          label="Publicaciones revisadas"
          sub={delta(datos.publicacionesRevisadasDelta)}
          value={datos.publicacionesRevisadas}
          tone="teal"
        />
        <Kpi
          icon={Users}
          label="Interacciones totales"
          sub={delta(datos.interaccionesTotalesDelta)}
          value={datos.interaccionesTotales}
          tone="purple"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Motivos de eliminación" subtitle="Comentarios borrados, por motivo">
          <DonutChart
            datos={datos.motivosEliminacion}
            total={datos.motivosEliminacion.reduce((s, d) => s + d.cantidad, 0)}
          />
        </ChartCard>
        <ChartCard title="Palabras clave más comunes" subtitle="En comentarios revisados">
          <BarChart datos={datos.palabrasClave} />
        </ChartCard>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-foreground">Historial de comentarios</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por usuario o palabra clave…"
                className="w-64 rounded-lg border border-silver bg-surface-2 py-1.5 pl-9 pr-3 text-xs outline-none ring-primary/30 focus:ring-2"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-silver text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="whitespace-nowrap py-2 pr-4">Fecha</th>
                  <th className="whitespace-nowrap py-2 pr-4">Usuario</th>
                  <th className="whitespace-nowrap py-2 pr-4">Comentario</th>
                  <th className="whitespace-nowrap py-2 pr-4">Motivo</th>
                  <th className="whitespace-nowrap py-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {historialFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-xs text-muted">
                      Sin resultados para esa búsqueda.
                    </td>
                  </tr>
                ) : (
                  historialFiltrado.map((h, i) => (
                    <tr key={i} className="border-b border-silver/60 last:border-0">
                      <td className="whitespace-nowrap py-2.5 pr-4 text-muted">{h.fecha}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 font-medium text-foreground">{h.usuario}</td>
                      <td className="py-2.5 pr-4 text-foreground">{h.comentario}</td>
                      <td className="whitespace-nowrap py-2.5 pr-4 text-muted">{h.motivo}</td>
                      <td className="whitespace-nowrap py-2.5">
                        <span className={h.accion === "Eliminado" ? "font-medium text-danger" : "text-muted"}>{h.accion}</span>
                      </td>
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
