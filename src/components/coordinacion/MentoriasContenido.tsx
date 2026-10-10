"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Download, ChevronLeft } from "lucide-react";
import {
  TIPOS_MENTORIA,
  TIPOS_MENTORIA_VALIDOS,
  construirMarkdownMentorias,
  mentoriaVacia,
  type Mentor,
  type Mentoria,
  type TipoMentoria,
} from "@/lib/coordinacion";
import { PanelMentoria } from "./PanelMentoria";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function descargarMarkdown(mentorias: Mentoria[]): void {
  const markdown = construirMarkdownMentorias(mentorias);
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `mentorias-${hoyISO()}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function MentoriasContenido() {
  const [mentorias, setMentorias] = useState<Mentoria[] | null>(null);
  const [mentores, setMentores] = useState<Mentor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<Mentoria | null>(null);
  const [tipoAbierto, setTipoAbierto] = useState<TipoMentoria | null>(null);

  function cargarMentorias() {
    return fetch("/api/coordinacion/mentorias")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar las mentorías");
        setMentorias(data.mentorias);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar las mentorías"));
  }

  useEffect(() => {
    cargarMentorias();
    fetch("/api/coordinacion/mentores")
      .then((r) => r.json())
      .then((data) => setMentores(data.mentores ?? []))
      .catch(() => {});
  }, []);

  const opcionesMentor = useMemo(() => mentores.map((m) => ({ valor: m.id, etiqueta: m.nombre })), [mentores]);

  // Tarjetas por tipo de mentoría, mismo color que su tarjeta en Skool (ver
  // TIPOS_MENTORIA) y mismo orden de la semana (no alfabético).
  const carpetas = useMemo(() => {
    const mapa = new Map<TipoMentoria, Mentoria[]>();
    for (const m of mentorias ?? []) {
      if (!mapa.has(m.tipoMentoria)) mapa.set(m.tipoMentoria, []);
      mapa.get(m.tipoMentoria)!.push(m);
    }
    return TIPOS_MENTORIA_VALIDOS.map((tipo) => ({ tipo, items: mapa.get(tipo) ?? [] })).filter((c) => c.items.length > 0);
  }, [mentorias]);

  const carpetaAbierta = carpetas.find((c) => c.tipo === tipoAbierto) ?? null;
  const pasadas = carpetaAbierta?.items.filter((m) => m.concluida) ?? [];
  const abiertas = carpetaAbierta?.items.filter((m) => !m.concluida) ?? [];

  async function eliminar(id: string) {
    if (!window.confirm("¿Eliminar esta mentoría? No se puede deshacer.")) return;
    await fetch(`/api/coordinacion/mentorias/${id}`, { method: "DELETE" });
    setAbierta(null);
    cargarMentorias();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {tipoAbierto ? (
            <button onClick={() => setTipoAbierto(null)} className="ease-spring mb-1 flex items-center gap-1 text-sm font-medium text-muted transition hover:text-foreground">
              <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
              Todas las mentorías
            </button>
          ) : null}
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
            {tipoAbierto ? TIPOS_MENTORIA[tipoAbierto].label : "Mentorías"}
          </h1>
          <p className="text-sm text-muted">
            {tipoAbierto ? `${TIPOS_MENTORIA[tipoAbierto].horario} · pasadas y abiertas` : "Creación, difusión y retroalimentación de cada sesión."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={!mentorias || mentorias.length === 0}
            onClick={() => descargarMarkdown(mentorias ?? [])}
            className="ease-spring flex items-center gap-1.5 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
            Descargar .md
          </button>
          <button
            onClick={() => setAbierta(mentoriaVacia(hoyISO(), tipoAbierto ?? undefined))}
            className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Nueva mentoría
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      {!mentorias ? (
        <p className="py-12 text-center text-sm text-muted">Cargando…</p>
      ) : !tipoAbierto ? (
        carpetas.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">Todavía no hay mentorías.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {carpetas.map(({ tipo, items }) => (
              <button
                key={tipo}
                onClick={() => setTipoAbierto(tipo)}
                className="ease-spring group flex aspect-[4/3] flex-col justify-between rounded-2xl p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
                style={{ backgroundColor: TIPOS_MENTORIA[tipo].color }}
              >
                <GraduationCap className="h-6 w-6 opacity-80" strokeWidth={1.75} />
                <div>
                  <p className="text-sm font-semibold leading-tight">{TIPOS_MENTORIA[tipo].label}</p>
                  <p className="mt-1 text-xs text-white/80">{items.length} mentoría{items.length !== 1 ? "s" : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-6">
          <SeccionMentorias titulo="Abiertas" items={abiertas} onAbrir={setAbierta} vacio="No hay mentorías abiertas de este tipo." />
          <SeccionMentorias titulo="Pasadas" items={pasadas} onAbrir={setAbierta} vacio="Todavía no hay mentorías pasadas de este tipo." />
        </div>
      )}

      {abierta && (
        <PanelMentoria
          mentoria={abierta}
          opcionesMentor={opcionesMentor}
          onCerrar={() => setAbierta(null)}
          onGuardado={() => cargarMentorias()}
          onEliminar={eliminar}
        />
      )}
    </div>
  );
}

function SeccionMentorias({
  titulo,
  items,
  onAbrir,
  vacio,
}: {
  titulo: string;
  items: Mentoria[];
  onAbrir: (m: Mentoria) => void;
  vacio: string;
}) {
  return (
    <div className="shell rounded-[1.75rem] p-2 diffused">
      <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          {titulo} <span className="font-normal text-muted">· {items.length}</span>
        </h3>
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">{vacio}</p>
        ) : (
          <ul className="divide-y divide-silver/60">
            {items.map((m) => (
              <li key={m.id}>
                <button onClick={() => onAbrir(m)} className="flex w-full flex-wrap items-center justify-between gap-3 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{m.tema || "(sin tema)"}</p>
                    <p className="text-xs text-muted">
                      {formatearFecha(m.fecha)}
                      {m.mentorNombre ? ` · ${m.mentorNombre}` : ""}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full px-3 py-1 text-xs font-medium ${
                      m.concluida ? "bg-success/15 text-success" : "bg-surface-2 text-muted"
                    }`}
                  >
                    {m.concluida ? "Concluida" : "En curso"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
