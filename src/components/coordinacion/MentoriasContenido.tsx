"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, Download } from "lucide-react";
import { TIPOS_MENTORIA, construirMarkdownMentorias, mentoriaVacia, type Mentor, type Mentoria } from "@/lib/coordinacion";
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
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
            Mentorías
          </h1>
          <p className="text-sm text-muted">Creación, difusión y retroalimentación de cada sesión.</p>
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
            onClick={() => setAbierta(mentoriaVacia(hoyISO()))}
            className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Nueva mentoría
          </button>
        </div>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          {!mentorias ? (
            <p className="py-8 text-center text-sm text-muted">Cargando…</p>
          ) : mentorias.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Todavía no hay mentorías.</p>
          ) : (
            <ul className="divide-y divide-silver/60">
              {mentorias.map((m) => (
                <li key={m.id}>
                  <button onClick={() => setAbierta(m)} className="flex w-full flex-wrap items-center justify-between gap-3 py-3.5 text-left">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{m.tema || "(sin tema)"}</p>
                      <p className="text-xs text-muted">
                        {formatearFecha(m.fecha)} · {TIPOS_MENTORIA[m.tipoMentoria].label}
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
