"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formularioVacio() {
  return { fecha: hoyISO(), usuario: "", pregunta: "", respuesta: "" };
}

// "Registro de atención" de Skool — a diferencia de las redes sociales, no
// hay publicaciones/comentarios: solo qué preguntaron y qué se respondió.
// Moderación entra directo al formulario (sin lista ni modal de por medio
// — el listado ya vive en Estadísticas · Skool, ver
// EstadisticasSkoolContenido.tsx), igual que Facebook/Instagram/TikTok
// entran directo a su propio formulario en ModeracionContenido.tsx.
export function SkoolAtencionContenido() {
  const [form, setForm] = useState(formularioVacio());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const puedeGuardar = form.fecha && form.usuario.trim() && form.pregunta.trim() && form.respuesta.trim();

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/community-manager/skool/atenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el registro");
      setForm(formularioVacio());
      setExito(true);
      setTimeout(() => setExito(false), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
          <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
          Moderación · Skool
        </h1>
        <p className="text-sm text-muted">Registra qué te preguntaron y qué respondiste.</p>
      </div>

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core space-y-4 rounded-[calc(1.75rem-0.5rem)] p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Fecha *">
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Usuario *">
              <input
                value={form.usuario}
                onChange={(e) => setForm((f) => ({ ...f, usuario: e.target.value }))}
                placeholder="Nombre del usuario"
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
          </div>
          <Campo label="Pregunta / Consulta *">
            <textarea
              value={form.pregunta}
              onChange={(e) => setForm((f) => ({ ...f, pregunta: e.target.value }))}
              rows={3}
              placeholder="¿Qué preguntó?"
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          <Campo label="Respuesta proporcionada *">
            <textarea
              value={form.respuesta}
              onChange={(e) => setForm((f) => ({ ...f, respuesta: e.target.value }))}
              rows={3}
              placeholder="¿Qué le respondiste?"
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>

          {error && <p className="text-sm text-danger">{error}</p>}
          {exito && <p className="text-sm text-success">Registro guardado — ya se refleja en Estadísticas.</p>}

          <button
            onClick={guardar}
            disabled={!puedeGuardar || guardando}
            className="ease-spring w-full rounded-xl brand-plate px-4 py-3 text-sm font-medium text-white transition disabled:opacity-50 sm:w-auto"
          >
            {guardando ? "Guardando…" : "Guardar registro"}
          </button>
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
