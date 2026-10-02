"use client";

import { useEffect, useState } from "react";
import { GraduationCap, MessagesSquare } from "lucide-react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Kpi } from "@/components/charts/Kpi";
import { BarChart } from "@/components/charts/BarChart";
import type { EstadisticasSkool } from "@/lib/community-manager";

// Skool no tiene "publicaciones"/"borrados" — solo preguntas y respuestas,
// así que sus Estadísticas son más chicas que las de redes sociales
// (ver EstadisticasContenido.tsx): total de atenciones, cuántas en los
// últimos 30 días (con su delta) y las preguntas más repetidas.
export function EstadisticasSkoolContenido() {
  const [datos, setDatos] = useState<EstadisticasSkool | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/community-manager/skool/estadisticas")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar las estadísticas");
        setDatos(data.estadisticas);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las estadísticas"));
  }, []);

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
    </div>
  );
}
