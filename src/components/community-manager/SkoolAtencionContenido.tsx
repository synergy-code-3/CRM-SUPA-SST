"use client";

import { useEffect, useState } from "react";
import { Search, Plus, X, GraduationCap } from "lucide-react";
import type { AtencionSkool } from "@/lib/community-manager";

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatearFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// "Registro de atención" de Skool — a diferencia de las redes sociales, no
// hay publicaciones/comentarios: solo qué preguntaron y qué se respondió.
// Sin columna de "Estado" (se pidió quitarla). Lista + alta en una sola
// pantalla (el botón "+ Nuevo registro" abre la modal), en vez de un
// formulario aparte como Facebook/Instagram/TikTok.
export function SkoolAtencionContenido() {
  const [atenciones, setAtenciones] = useState<AtencionSkool[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [buscandoEnServidor, setBuscandoEnServidor] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargar(q?: string) {
    setError(null);
    const params = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const res = await fetch(`/api/community-manager/skool/atenciones${params}`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudieron cargar los registros");
      return;
    }
    setAtenciones(data.atenciones);
  }

  useEffect(() => {
    cargar();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => {
      setBuscandoEnServidor(true);
      cargar(busqueda).finally(() => setBuscandoEnServidor(false));
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <GraduationCap className="h-6 w-6 text-primary" strokeWidth={1.75} />
            Skool · Registro de atención
          </h1>
          <p className="text-sm text-muted">Una sola sección para Skool — aquí se registra qué preguntaron y qué respondiste.</p>
        </div>
        <button
          onClick={() => setMostrarNuevo(true)}
          className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Nuevo registro
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o palabra clave…"
          className="w-full rounded-lg border border-silver bg-surface py-2 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
        />
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="shell rounded-[1.75rem] p-2 diffused">
        <div className="core rounded-[calc(1.75rem-0.5rem)] p-6">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-base">
              <thead>
                <tr className="border-b border-silver text-sm font-semibold uppercase tracking-wide text-muted">
                  <th className="whitespace-nowrap py-3 pr-4">Fecha</th>
                  <th className="whitespace-nowrap py-3 pr-4">Usuario</th>
                  <th className="py-3 pr-4">Pregunta / Consulta</th>
                  <th className="py-3">Respuesta proporcionada</th>
                </tr>
              </thead>
              <tbody>
                {!atenciones ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted">
                      {buscandoEnServidor ? "Buscando…" : "Cargando…"}
                    </td>
                  </tr>
                ) : atenciones.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-sm text-muted">
                      {busqueda.trim() ? "Sin resultados para esa búsqueda." : "Todavía no hay registros."}
                    </td>
                  </tr>
                ) : (
                  atenciones.map((a) => (
                    <tr key={a.id} className="border-b border-silver/60 last:border-0 align-top">
                      <td className="whitespace-nowrap py-3 pr-4 text-muted">{formatearFecha(a.fecha)}</td>
                      <td className="whitespace-nowrap py-3 pr-4 font-medium text-foreground">{a.usuario}</td>
                      <td className="py-3 pr-4 text-foreground">{a.pregunta}</td>
                      <td className="py-3 text-foreground">{a.respuesta}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {mostrarNuevo && (
        <NuevoRegistroModal
          onClose={() => setMostrarNuevo(false)}
          onGuardado={() => {
            setMostrarNuevo(false);
            cargar(busqueda);
          }}
        />
      )}
    </div>
  );
}

function NuevoRegistroModal({ onClose, onGuardado }: { onClose: () => void; onGuardado: () => void }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [usuario, setUsuario] = useState("");
  const [pregunta, setPregunta] = useState("");
  const [respuesta, setRespuesta] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const puedeGuardar = fecha && usuario.trim() && pregunta.trim() && respuesta.trim();

  async function guardar() {
    if (!puedeGuardar) return;
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/community-manager/skool/atenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, usuario, pregunta, respuesta }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar el registro");
      onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el registro");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-lg rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core space-y-4 rounded-[calc(2rem-0.5rem)] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Nuevo registro de atención</h2>
            <button onClick={onClose} className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2">
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo label="Fecha *">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
            <Campo label="Usuario *">
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                placeholder="Nombre del usuario"
                className="w-full rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
              />
            </Campo>
          </div>
          <Campo label="Pregunta / Consulta *">
            <textarea
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              rows={3}
              placeholder="¿Qué preguntó?"
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>
          <Campo label="Respuesta proporcionada *">
            <textarea
              value={respuesta}
              onChange={(e) => setRespuesta(e.target.value)}
              rows={3}
              placeholder="¿Qué le respondiste?"
              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-4 py-2.5 text-sm outline-none ring-primary/30 focus:ring-2"
            />
          </Campo>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="ease-spring flex-1 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={!puedeGuardar || guardando}
              className="ease-spring flex-1 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
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
