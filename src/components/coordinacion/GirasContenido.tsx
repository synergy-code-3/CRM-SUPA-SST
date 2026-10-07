"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPin, Search, Calendar, Clock, Building2 } from "lucide-react";
import type { Gira } from "@/lib/coordinacion-sheets";

function esPasada(fechaIso: string | null): boolean {
  if (!fechaIso) return false;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return new Date(`${fechaIso}T00:00:00`) < hoy;
}

export function GirasContenido() {
  const [giras, setGiras] = useState<Gira[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [soloProximas, setSoloProximas] = useState(false);

  useEffect(() => {
    fetch("/api/coordinacion/giras")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar las giras");
        setGiras(data.giras);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las giras"));
  }, []);

  const especiales = useMemo(() => (giras ?? []).filter((g) => g.tipo === "especial"), [giras]);

  const eventosFiltrados = useMemo(() => {
    let lista = (giras ?? []).filter((g) => g.tipo === "evento");
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((g) => `${g.nombre} ${g.hotel} ${g.dir} ${g.fechaDisplay}`.toLowerCase().includes(q));
    if (soloProximas) lista = lista.filter((g) => !esPasada(g.fechaIso));
    return [...lista].sort((a, b) => (a.fechaIso ?? "9999").localeCompare(b.fechaIso ?? "9999"));
  }, [giras, busqueda, soloProximas]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, Gira[]>();
    for (const g of eventosFiltrados) {
      const clave = g.fechaIso ? g.fechaIso.slice(0, 7) : "Sin fecha";
      if (!mapa.has(clave)) mapa.set(clave, []);
      mapa.get(clave)!.push(g);
    }
    return [...mapa.entries()];
  }, [eventosFiltrados]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <MapPin className="h-6 w-6 text-primary" strokeWidth={1.75} />
          Giras
        </h1>
        <p className="text-sm text-muted">Eventos presenciales, leídos en vivo del Sheet de giras.</p>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      {!giras && !error ? (
        <p className="py-12 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <>
          {especiales.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {especiales.map((g) => (
                <div key={g.nombre} className="shell rounded-[1.75rem] p-2 diffused">
                  <div className="core space-y-1.5 rounded-[calc(1.75rem-0.5rem)] p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Evento principal</p>
                    <p className="text-lg font-semibold text-foreground">{g.nombre}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      {g.fechaDisplay && (
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} /> {g.fechaDisplay}
                        </span>
                      )}
                      {g.hotel && (
                        <span className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5" strokeWidth={1.75} /> {g.hotel}
                        </span>
                      )}
                    </div>
                    {g.dir && <p className="text-xs text-muted">{g.dir}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar ciudad, hotel…"
                className="w-full rounded-lg border border-silver bg-surface py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={soloProximas} onChange={(e) => setSoloProximas(e.target.checked)} className="h-4 w-4 rounded border-silver" />
              Solo próximas
            </label>
          </div>

          <div className="space-y-5">
            {grupos.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Sin giras que mostrar.</p>
            ) : (
              grupos.map(([mes, items]) => (
                <div key={mes} className="shell rounded-[1.75rem] p-2 diffused">
                  <div className="core rounded-[calc(1.75rem-0.5rem)] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      {mes === "Sin fecha" ? "Sin fecha" : new Date(`${mes}-01T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
                    </h3>
                    <ul className="divide-y divide-silver/60">
                      {items.map((g, i) => {
                        const pasada = esPasada(g.fechaIso);
                        return (
                          <li key={`${g.nombre}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div className="min-w-0">
                              <p className={`font-medium ${pasada ? "text-muted" : "text-foreground"}`}>{g.nombre}</p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                                {g.fechaDisplay && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" strokeWidth={1.75} /> {g.fechaDisplay}
                                  </span>
                                )}
                                {g.horario && (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" strokeWidth={1.75} /> {g.horario}
                                  </span>
                                )}
                                {g.hotel && (
                                  <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" strokeWidth={1.75} /> {g.hotel}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span
                              className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${
                                pasada ? "bg-surface-2 text-muted" : "bg-success/15 text-success"
                              }`}
                            >
                              {pasada ? "Pasado" : "Próximo"}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
