"use client";

import { useEffect, useState } from "react";
import { GraduationCap, Plus, X } from "lucide-react";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { RANGOS_MENTOR, type Mentor, type RangoMentor } from "@/lib/coordinacion";

const OPCIONES_RANGO = RANGOS_MENTOR.map((r) => ({ valor: r, etiqueta: r }));

function mentorVacio() {
  return { id: "", nombre: "", rango: "Abeja" as RangoMentor, especialidad: "", descripcion: "" };
}

export function MentoresContenido() {
  const [mentores, setMentores] = useState<Mentor[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ReturnType<typeof mentorVacio> | null>(null);
  const [guardando, setGuardando] = useState(false);

  function cargar() {
    return fetch("/api/coordinacion/mentores")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudieron cargar los mentores");
        setMentores(data.mentores);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los mentores"));
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar() {
    if (!modal || !modal.nombre.trim()) return;
    setGuardando(true);
    try {
      const esNuevo = !modal.id;
      const res = await fetch(esNuevo ? "/api/coordinacion/mentores" : `/api/coordinacion/mentores/${modal.id}`, {
        method: esNuevo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: modal.nombre, rango: modal.rango, especialidad: modal.especialidad, descripcion: modal.descripcion }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");
      setModal(null);
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(mentor: Mentor) {
    await fetch(`/api/coordinacion/mentores/${mentor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !mentor.activo }),
    });
    cargar();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
            Mentores
          </h1>
          <p className="text-sm text-muted">Quiénes dan las mentorías del Club.</p>
        </div>
        <button
          onClick={() => setModal(mentorVacio())}
          className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Nuevo mentor
        </button>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          {!mentores ? (
            <p className="py-8 text-center text-sm text-muted">Cargando…</p>
          ) : mentores.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">Todavía no hay mentores.</p>
          ) : (
            <ul className="divide-y divide-silver/60">
              {mentores.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                  <button
                    onClick={() => setModal({ id: m.id, nombre: m.nombre, rango: m.rango, especialidad: m.especialidad ?? "", descripcion: m.descripcion ?? "" })}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className={`font-medium ${m.activo ? "text-foreground" : "text-muted line-through"}`}>{m.nombre}</p>
                    <p className="text-xs text-muted">
                      {m.rango}
                      {m.especialidad ? ` · ${m.especialidad}` : ""}
                    </p>
                  </button>
                  <button
                    onClick={() => cambiarActivo(m)}
                    className={`ease-spring flex-none rounded-full px-3 py-1 text-xs font-medium transition ${
                      m.activo ? "bg-success/15 text-success hover:bg-success/25" : "bg-surface-2 text-muted hover:bg-silver"
                    }`}
                  >
                    {m.activo ? "Activo" : "Inactivo"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {modal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px]"
          onClick={(e) => e.target === e.currentTarget && setModal(null)}
        >
          <div className="shell w-full max-w-md rounded-[2rem] p-2 diffused-lg animate-fade-in">
            <div className="core space-y-4 rounded-[calc(2rem-0.5rem)] p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-foreground">{modal.id ? "Editar mentor" : "Nuevo mentor"}</h2>
                <button onClick={() => setModal(null)} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
                  <X className="h-4.5 w-4.5" strokeWidth={1.75} />
                </button>
              </div>
              <Campo label="Nombre *">
                <input
                  value={modal.nombre}
                  onChange={(e) => setModal({ ...modal, nombre: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Rango *">
                <ComboboxBuscador opciones={OPCIONES_RANGO} valor={modal.rango} onChange={(v) => setModal({ ...modal, rango: v as RangoMentor })} />
              </Campo>
              <Campo label="Especialidad">
                <input
                  value={modal.especialidad}
                  onChange={(e) => setModal({ ...modal, especialidad: e.target.value })}
                  className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <Campo label="Descripción">
                <textarea
                  value={modal.descripcion}
                  onChange={(e) => setModal({ ...modal, descripcion: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
                />
              </Campo>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setModal(null)}
                  className="ease-spring flex-1 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={!modal.nombre.trim() || guardando}
                  className="ease-spring flex-1 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
                >
                  {guardando ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
