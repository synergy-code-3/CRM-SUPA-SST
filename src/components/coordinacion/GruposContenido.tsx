"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Search, UserRound, Users, MessageCircle } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import type { Grupo } from "@/lib/coordinacion-sheets";

export function GruposContenido() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [pais, setPais] = useState("");

  useEffect(() => {
    fetch("/api/coordinacion/grupos")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar los grupos");
        setGrupos(data.grupos);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los grupos"));
  }, []);

  const opcionesPais = useMemo(
    () => [...new Set((grupos ?? []).map((g) => g.pais))].sort().map((p) => ({ valor: p, etiqueta: p })),
    [grupos]
  );

  const filtrados = useMemo(() => {
    let lista = grupos ?? [];
    const q = busqueda.trim().toLowerCase();
    if (q) lista = lista.filter((g) => `${g.ciudad} ${g.pais} ${g.presidente}`.toLowerCase().includes(q));
    if (pais) lista = lista.filter((g) => g.pais === pais);
    return lista;
  }, [grupos, busqueda, pais]);

  const porPais = useMemo(() => {
    const mapa = new Map<string, Grupo[]>();
    for (const g of filtrados) {
      if (!mapa.has(g.pais)) mapa.set(g.pais, []);
      mapa.get(g.pais)!.push(g);
    }
    return [...mapa.entries()];
  }, [filtrados]);

  const totalMiembros = (grupos ?? []).reduce((s, g) => s + (parseInt(g.miembros) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <Globe className="h-6 w-6 text-primary" strokeWidth={1.75} />
          Grupos de Comunidad
        </h1>
        <p className="text-sm text-muted">Grupos de WhatsApp por ciudad, leídos en vivo del Sheet.</p>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      {!grupos && !error ? (
        <p className="py-12 text-center text-sm text-muted">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Estadistica icon={MessageCircle} valor={grupos?.length ?? 0} etiqueta="Grupos" />
            <Estadistica icon={Globe} valor={opcionesPais.length} etiqueta="Países" />
            <Estadistica icon={UserRound} valor={(grupos ?? []).filter((g) => g.presidente).length} etiqueta="Con presidente" />
            {totalMiembros > 0 && <Estadistica icon={Users} valor={totalMiembros} etiqueta="Miembros" />}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar ciudad o presidente…"
                className="w-full rounded-lg border border-silver bg-surface py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </div>
            <div className="w-48">
              <ComboboxBuscador opciones={opcionesPais} valor={pais} onChange={setPais} etiquetaVacio="Todos los países" placeholder="Todos los países" />
            </div>
          </div>

          <div className="space-y-5">
            {porPais.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted">Sin grupos que mostrar.</p>
            ) : (
              porPais.map(([p, items]) => (
                <div key={p} className="shell rounded-[1.75rem] p-2 diffused">
                  <div className="core rounded-[calc(1.75rem-0.5rem)] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-foreground">
                      {p} <span className="font-normal text-muted">· {items.length} grupo{items.length !== 1 ? "s" : ""}</span>
                    </h3>
                    <ul className="divide-y divide-silver/60">
                      {items.map((g, i) => (
                        <li key={`${g.ciudad}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">{g.ciudad}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted">
                              {g.presidente && (
                                <span className="flex items-center gap-1">
                                  <UserRound className="h-3 w-3" strokeWidth={1.75} /> {g.presidente}
                                </span>
                              )}
                              {g.miembros && (
                                <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium">{g.miembros} miembros</span>
                              )}
                            </div>
                          </div>
                          <a
                            href={g.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ease-spring flex flex-none items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                          >
                            <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Abrir grupo
                          </a>
                        </li>
                      ))}
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

function Estadistica({ icon: Icon, valor, etiqueta }: { icon: typeof Globe; valor: number; etiqueta: string }) {
  return (
    <div className="shell rounded-[1.25rem] p-1.5 diffused">
      <div className="core flex items-center gap-3 rounded-[calc(1.25rem-0.375rem)] p-4">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-dim text-primary">
          <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-lg font-semibold leading-none text-foreground">{valor.toLocaleString("es-MX")}</p>
          <p className="text-xs text-muted">{etiqueta}</p>
        </div>
      </div>
    </div>
  );
}
