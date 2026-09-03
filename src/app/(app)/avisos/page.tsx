"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, X, ChevronDown, UserCheck } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { Aviso } from "@/lib/types";

export default function AvisosPage() {
  const { usuario } = useSesion();
  const [avisos, setAvisos] = useState<Aviso[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [editando, setEditando] = useState<Aviso | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarAvisos");

  async function cargar() {
    setError(null);
    const res = await fetch("/api/avisos");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudieron cargar los avisos");
      return;
    }
    setAvisos(data.avisos);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function eliminar(id: string, titulo: string) {
    if (!confirm(`¿Eliminar el aviso "${titulo}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    const res = await fetch(`/api/avisos/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  if (!usuario) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Avisos</h1>
          <p className="text-sm text-muted">Anuncios y actualizaciones del equipo.</p>
        </div>
        {puedeGestionar && (
          <button
            onClick={() => setMostrarNuevo(true)}
            className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
            Nuevo aviso
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      {avisos && avisos.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-silver bg-surface px-6 py-12 text-center">
          <Megaphone className="h-8 w-8 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Todavía no hay avisos publicados.</p>
        </div>
      )}

      <div className="space-y-3">
        {(avisos ?? []).map((a) => (
          <div key={a.id} className="rounded-2xl border border-silver bg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium text-foreground">{a.titulo}</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {a.autorNombre} · {new Date(a.creadoEn).toLocaleString("es-MX")}
                  {a.editadoEn && " · editado"}
                </p>
              </div>
              {puedeGestionar && (
                <div className="flex flex-none items-center gap-1">
                  <button
                    onClick={() => setEditando(a)}
                    title="Editar aviso"
                    className="ease-spring rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <button
                    onClick={() => eliminar(a.id, a.titulo)}
                    title="Eliminar aviso"
                    className="ease-spring rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              )}
            </div>
            <p className="mt-2.5 whitespace-pre-wrap text-sm text-foreground">{a.mensaje}</p>

            {a.confirmaciones && (
              <div className="mt-3 border-t border-silver/60 pt-2.5">
                <button
                  onClick={() => setExpandido((v) => (v === a.id ? null : a.id))}
                  className="ease-spring flex items-center gap-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${expandido === a.id ? "" : "-rotate-90"}`}
                    strokeWidth={2}
                  />
                  <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {a.confirmaciones.length === 0
                    ? "Nadie ha confirmado todavía"
                    : `${a.confirmaciones.length} confirmación${a.confirmaciones.length === 1 ? "" : "es"}`}
                </button>
                {expandido === a.id && a.confirmaciones.length > 0 && (
                  <ul className="mt-2 space-y-1 pl-5 text-xs text-muted">
                    {a.confirmaciones.map((c) => (
                      <li key={c.usuarioId}>
                        {c.usuarioNombre} — {new Date(c.confirmadoEn).toLocaleString("es-MX")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {mostrarNuevo && (
        <AvisoModal
          onClose={() => setMostrarNuevo(false)}
          onGuardado={() => {
            setMostrarNuevo(false);
            cargar();
          }}
        />
      )}
      {editando && (
        <AvisoModal
          aviso={editando}
          onClose={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function AvisoModal({
  aviso,
  onClose,
  onGuardado,
}: {
  aviso?: Aviso;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [titulo, setTitulo] = useState(aviso?.titulo ?? "");
  const [mensaje, setMensaje] = useState(aviso?.mensaje ?? "");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function guardar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(aviso ? `/api/avisos/${aviso.id}` : "/api/avisos", {
        method: aviso ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo, mensaje }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo guardar el aviso");
        return;
      }
      onGuardado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core space-y-3 rounded-[calc(2rem-0.5rem)] p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">{aviso ? "Editar aviso" : "Nuevo aviso"}</h2>
            <button
              onClick={onClose}
              className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
            >
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>

          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título"
            className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
          <textarea
            value={mensaje}
            onChange={(e) => setMensaje(e.target.value)}
            placeholder="Mensaje"
            rows={5}
            className="w-full resize-none rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="ease-spring flex-1 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              onClick={guardar}
              disabled={!titulo.trim() || !mensaje.trim() || enviando}
              className="ease-spring flex-1 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {enviando ? "Guardando…" : aviso ? "Guardar" : "Publicar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
