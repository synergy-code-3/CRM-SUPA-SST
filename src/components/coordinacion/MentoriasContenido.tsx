"use client";

import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Plus, X, Check, Download } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import {
  TIPOS_MENTORIA,
  TIPOS_MENTORIA_VALIDOS,
  construirMarkdownMentorias,
  type Mentor,
  type Mentoria,
  type TipoMentoria,
  type DifusionChecklist,
} from "@/lib/coordinacion";

const OPCIONES_TIPO = TIPOS_MENTORIA_VALIDOS.map((t) => ({ valor: t, etiqueta: `${TIPOS_MENTORIA[t].label} (${TIPOS_MENTORIA[t].horario})` }));
const PRESETS_HORA = [
  { valor: "19:00", etiqueta: "7:00 pm" },
  { valor: "12:00", etiqueta: "12:00 pm" },
  { valor: "16:00", etiqueta: "4:00 pm" },
  { valor: "otro", etiqueta: "Otro…" },
];

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
  const [creando, setCreando] = useState(false);

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

  async function crear(tipoMentoria: TipoMentoria, fecha: string) {
    setCreando(true);
    try {
      const res = await fetch("/api/coordinacion/mentorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipoMentoria, fecha, mentorId: null, tema: "", hora: "", material: false, notas: "" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear la mentoría");
      await cargarMentorias();
      const res2 = await fetch(`/api/coordinacion/mentorias/${data.id}`);
      const nueva = (await res2.json()).mentoria as Mentoria;
      setAbierta(nueva);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la mentoría");
    } finally {
      setCreando(false);
    }
  }

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
            disabled={creando}
            onClick={() => crear(TIPOS_MENTORIA_VALIDOS[0], hoyISO())}
            className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50"
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
          onGuardado={(actualizada) => {
            setAbierta(actualizada);
            cargarMentorias();
          }}
          onEliminar={() => eliminar(abierta.id)}
        />
      )}
    </div>
  );
}

function PanelMentoria({
  mentoria,
  opcionesMentor,
  onCerrar,
  onGuardado,
  onEliminar,
}: {
  mentoria: Mentoria;
  opcionesMentor: { valor: string; etiqueta: string }[];
  onCerrar: () => void;
  onGuardado: (m: Mentoria) => void;
  onEliminar: () => void;
}) {
  const [tab, setTab] = useState<"info" | "difusion" | "retro">("info");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Info
  const [mentorId, setMentorId] = useState(mentoria.mentorId ?? "");
  const [tipoMentoria, setTipoMentoria] = useState<TipoMentoria>(mentoria.tipoMentoria);
  const [tema, setTema] = useState(mentoria.tema ?? "");
  const [fecha, setFecha] = useState(mentoria.fecha);
  const [presetHora, setPresetHora] = useState(() => (PRESETS_HORA.some((p) => p.valor === mentoria.hora) ? mentoria.hora ?? "19:00" : "otro"));
  const [horaLibre, setHoraLibre] = useState(mentoria.hora ?? "");
  const [material, setMaterial] = useState(mentoria.material);
  const [notas, setNotas] = useState(mentoria.notas ?? "");

  // Difusión
  const [copyPrevia, setCopyPrevia] = useState(mentoria.copyPrevia ?? "");
  const [copyPlataforma, setCopyPlataforma] = useState(mentoria.copyPlataforma ?? "");
  const [checklist, setChecklist] = useState<DifusionChecklist>(mentoria.difusion);
  const [generando, setGenerando] = useState(false);

  // Retro
  const [audInicial, setAudInicial] = useState(mentoria.audInicial?.toString() ?? "");
  const [audMedia, setAudMedia] = useState(mentoria.audMedia?.toString() ?? "");
  const [audFinal, setAudFinal] = useState(mentoria.audFinal?.toString() ?? "");
  const [obsPub, setObsPub] = useState(mentoria.obsPub ?? "");
  const [ideas, setIdeas] = useState(mentoria.ideas ?? "");
  const [preguntas, setPreguntas] = useState(mentoria.preguntas ?? "");

  async function guardarInfo() {
    setGuardando(true);
    setError(null);
    try {
      const hora = presetHora === "otro" ? horaLibre : presetHora;
      const res = await fetch(`/api/coordinacion/mentorias/${mentoria.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seccion: "info", mentorId: mentorId || null, tipoMentoria, tema, fecha, hora, material, notas }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      onGuardado({ ...mentoria, mentorId: mentorId || null, mentorNombre: opcionesMentor.find((o) => o.valor === mentorId)?.etiqueta ?? null, tipoMentoria, tema, fecha, hora, material, notas });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function generarCopy() {
    setGenerando(true);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${mentoria.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo generar");
      setCopyPrevia(data.copyPrevia);
      setCopyPlataforma(data.copyPlataforma);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el copy");
    } finally {
      setGenerando(false);
    }
  }

  async function guardarDifusion(checklistNuevo = checklist) {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${mentoria.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seccion: "difusion", copyPrevia, copyPlataforma, checklist: checklistNuevo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      onGuardado({ ...mentoria, copyPrevia, copyPlataforma, difusion: checklistNuevo });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarRetro() {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${mentoria.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seccion: "retro",
          audInicial: audInicial ? Number(audInicial) : null,
          audMedia: audMedia ? Number(audMedia) : null,
          audFinal: audFinal ? Number(audFinal) : null,
          obsPub,
          ideas,
          preguntas,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      onGuardado({
        ...mentoria,
        audInicial: audInicial ? Number(audInicial) : null,
        audMedia: audMedia ? Number(audMedia) : null,
        audFinal: audFinal ? Number(audFinal) : null,
        obsPub,
        ideas,
        preguntas,
        concluida: data.concluida,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-foreground/30 backdrop-blur-[2px]" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="animate-slide-in-right h-full w-full max-w-xl overflow-y-auto bg-surface shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-silver/70 bg-surface px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{tema || "Mentoría"}</h2>
            <p className="text-xs text-muted">
              {formatearFecha(fecha)} · {TIPOS_MENTORIA[tipoMentoria].label}
            </p>
          </div>
          <button onClick={onCerrar} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-silver/70 px-6 pt-3">
          {(["info", "difusion", "retro"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`ease-spring rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                tab === t ? "border-b-2 border-primary text-primary" : "text-muted hover:text-foreground"
              }`}
            >
              {t === "info" ? "Info" : t === "difusion" ? "Difusión" : "Retro"}
            </button>
          ))}
        </div>

        <div className="space-y-4 p-6">
          {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

          {tab === "info" && (
            <>
              <Campo label="Tipo de mentoría *">
                <ComboboxBuscador opciones={OPCIONES_TIPO} valor={tipoMentoria} onChange={(v) => setTipoMentoria(v as TipoMentoria)} />
              </Campo>
              <Campo label="Mentor">
                <ComboboxBuscador opciones={opcionesMentor} valor={mentorId} onChange={setMentorId} etiquetaVacio="Sin asignar" placeholder="Sin asignar" />
              </Campo>
              <Campo label="Tema">
                <input value={tema} onChange={(e) => setTema(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <div className="grid grid-cols-2 gap-4">
                <Campo label="Fecha *">
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
                <Campo label="Hora">
                  <ComboboxBuscador opciones={PRESETS_HORA} valor={presetHora} onChange={setPresetHora} />
                </Campo>
              </div>
              {presetHora === "otro" && (
                <Campo label="Hora específica">
                  <input type="time" value={horaLibre} onChange={(e) => setHoraLibre(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
              )}
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input type="checkbox" checked={material} onChange={(e) => setMaterial(e.target.checked)} className="h-4 w-4 rounded border-silver" />
                Material preparado y listo
              </label>
              <Campo label="Notas internas">
                <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <div className="flex items-center justify-between pt-2">
                <button onClick={onEliminar} className="text-sm font-medium text-danger hover:underline">
                  Eliminar mentoría
                </button>
                <button onClick={guardarInfo} disabled={guardando} className="ease-spring rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          )}

          {tab === "difusion" && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted">Copys</span>
                <button onClick={generarCopy} disabled={generando} className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50">
                  {generando ? "Generando…" : "Generar desde tema/mentor"}
                </button>
              </div>
              <Campo label="Copy de previa (anuncio del día)">
                <textarea value={copyPrevia} onChange={(e) => setCopyPrevia(e.target.value)} rows={6} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Copy de plataforma (ya disponible en Classroom)">
                <textarea value={copyPlataforma} onChange={(e) => setCopyPlataforma(e.target.value)} rows={5} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <div>
                <span className="mb-2 block text-sm font-medium text-muted">Checklist de difusión</span>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(checklist) as (keyof DifusionChecklist)[]).map((clave) => (
                    <label key={clave} className="flex items-center gap-2 rounded-lg border border-silver bg-surface-2 px-3 py-2 text-sm capitalize text-foreground">
                      <input
                        type="checkbox"
                        checked={checklist[clave]}
                        onChange={(e) => setChecklist((c) => ({ ...c, [clave]: e.target.checked }))}
                        className="h-4 w-4 rounded border-silver"
                      />
                      {clave}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button onClick={() => guardarDifusion()} disabled={guardando} className="ease-spring rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          )}

          {tab === "retro" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Campo label="Audiencia inicial">
                  <input type="number" min={0} value={audInicial} onChange={(e) => setAudInicial(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
                <Campo label="Audiencia media">
                  <input type="number" min={0} value={audMedia} onChange={(e) => setAudMedia(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
                <Campo label="Audiencia final">
                  <input type="number" min={0} value={audFinal} onChange={(e) => setAudFinal(e.target.value)} className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
                </Campo>
              </div>
              <Campo label="Observaciones del público">
                <textarea value={obsPub} onChange={(e) => setObsPub(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Ideas importantes">
                <textarea value={ideas} onChange={(e) => setIdeas(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              <Campo label="Preguntas frecuentes en el chat">
                <textarea value={preguntas} onChange={(e) => setPreguntas(e.target.value)} rows={3} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </Campo>
              {mentoria.concluida && (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <Check className="h-4 w-4" strokeWidth={2} /> Esta mentoría quedó marcada como concluida.
                </p>
              )}
              <div className="flex justify-end pt-2">
                <button onClick={guardarRetro} disabled={guardando} className="ease-spring rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50">
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
