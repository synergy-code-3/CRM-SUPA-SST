"use client";

import { useState } from "react";
import { X, Check, Copy } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { TIPOS_MENTORIA, TIPOS_MENTORIA_VALIDOS, type Mentoria, type TipoMentoria, type DifusionChecklist } from "@/lib/coordinacion";

const OPCIONES_TIPO = TIPOS_MENTORIA_VALIDOS.map((t) => ({ valor: t, etiqueta: `${TIPOS_MENTORIA[t].label} (${TIPOS_MENTORIA[t].horario})` }));
const PRESETS_HORA = [
  { valor: "19:00", etiqueta: "7:00 pm" },
  { valor: "12:00", etiqueta: "12:00 pm" },
  { valor: "16:00", etiqueta: "4:00 pm" },
  { valor: "otro", etiqueta: "Otro…" },
];

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// Edita una mentoría — con `mentoria.id === ""` se trata como borrador: no
// se crea nada en Supabase hasta que se le dé "Guardar" en Info (pedido
// explícito: "si no la guardo no se crea"). Mientras es borrador, Difusión
// y Retro quedan deshabilitadas (no hay id al que engancharlas todavía).
export function PanelMentoria({
  mentoria,
  opcionesMentor,
  onCerrar,
  onGuardado,
  onEliminar,
}: {
  mentoria: Mentoria;
  opcionesMentor: { valor: string; etiqueta: string }[];
  onCerrar: () => void;
  onGuardado: () => void;
  onEliminar: (id: string) => void;
}) {
  const [idActual, setIdActual] = useState(mentoria.id);
  const esBorrador = !idActual;
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
  const [concluida, setConcluida] = useState(mentoria.concluida);

  async function guardarInfo() {
    setGuardando(true);
    setError(null);
    try {
      const hora = presetHora === "otro" ? horaLibre : presetHora;
      if (esBorrador) {
        const res = await fetch("/api/coordinacion/mentorias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mentorId: mentorId || null, tipoMentoria, tema, fecha, hora, material, notas }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo crear la mentoría");
        setIdActual(data.id);
      } else {
        const res = await fetch(`/api/coordinacion/mentorias/${idActual}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seccion: "info", mentorId: mentorId || null, tipoMentoria, tema, fecha, hora, material, notas }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      }
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function generarCopy() {
    if (!idActual) return;
    setGenerando(true);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${idActual}`, { method: "POST" });
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

  async function guardarDifusion() {
    if (!idActual) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${idActual}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seccion: "difusion", copyPrevia, copyPlataforma, checklist }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function guardarRetro() {
    if (!idActual) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch(`/api/coordinacion/mentorias/${idActual}`, {
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
      setConcluida(data.concluida);
      onGuardado();
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
            <h2 className="text-lg font-semibold text-foreground">{tema || (esBorrador ? "Nueva mentoría" : "Mentoría")}</h2>
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
              disabled={t !== "info" && esBorrador}
              title={t !== "info" && esBorrador ? "Guarda la información primero" : undefined}
              className={`ease-spring rounded-t-lg px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
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
                {esBorrador ? (
                  <span />
                ) : (
                  <button onClick={() => onEliminar(idActual)} className="text-sm font-medium text-danger hover:underline">
                    Eliminar mentoría
                  </button>
                )}
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
              <CampoConCopiar label="Copy de previa (anuncio del día)" valor={copyPrevia}>
                <textarea value={copyPrevia} onChange={(e) => setCopyPrevia(e.target.value)} rows={6} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </CampoConCopiar>
              <CampoConCopiar label="Copy de plataforma (ya disponible en Classroom)" valor={copyPlataforma}>
                <textarea value={copyPlataforma} onChange={(e) => setCopyPlataforma(e.target.value)} rows={5} className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2" />
              </CampoConCopiar>
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
                <button onClick={guardarDifusion} disabled={guardando} className="ease-spring rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-50">
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
              {concluida && (
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

// Igual que Campo, pero con un botón para copiar el texto actual al
// portapapeles — para pegar el copy directo en WhatsApp/Telegram/Skool
// sin tener que seleccionar el texto a mano.
function CampoConCopiar({ label, valor, children }: { label: string; valor: string; children: React.ReactNode }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // portapapeles no disponible, ignorar
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="block text-sm font-medium text-muted">{label}</span>
        <button
          type="button"
          onClick={copiar}
          disabled={!valor.trim()}
          className={`ease-spring flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition disabled:opacity-40 ${
            copiado ? "text-success" : "text-muted hover:text-primary"
          }`}
        >
          {copiado ? <Check className="h-3 w-3" strokeWidth={2.5} /> : <Copy className="h-3 w-3" strokeWidth={2} />}
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      {children}
    </div>
  );
}
