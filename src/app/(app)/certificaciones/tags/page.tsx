"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Plus, ShieldAlert, Tag as TagIcon, Trash2 } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { colorDeTag } from "@/components/certificaciones/constantes";

// Catálogo de tags de Certificaciones (Biblioteca, tipo "tag_certificaciones")
// — las opciones que ofrece "+ Agregar tag" en el perfil de cada cliente.
export default function TagsCertificacionesPage() {
  const { usuario, cargando } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCatalogo");
  const [tags, setTags] = useState<string[] | null>(null);
  const [nombre, setNombre] = useState("");
  const [creando, setCreando] = useState(false);
  const [eliminando, setEliminando] = useState<string | null>(null);

  useEffect(() => {
    if (!puedeGestionar) return;
    fetch("/api/biblioteca?tipo=tag_certificaciones")
      .then((r) => r.json())
      .then((data) => setTags(data.opciones ?? []))
      .catch(() => setTags([]));
  }, [puedeGestionar]);

  async function crear() {
    if (!nombre.trim() || creando) return;
    setCreando(true);
    try {
      const res = await fetch("/api/biblioteca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "tag_certificaciones", valor: nombre.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo crear el tag");
        return;
      }
      setTags(data.opciones ?? []);
      setNombre("");
    } finally {
      setCreando(false);
    }
  }

  async function eliminar(tag: string) {
    if (!window.confirm(`¿Eliminar la etiqueta "${tag}"? Los clientes que ya la tengan asignada la conservarán.`)) return;
    setEliminando(tag);
    try {
      const res = await fetch("/api/biblioteca", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "tag_certificaciones", valor: tag }),
      });
      const data = await res.json();
      if (res.ok) setTags(data.opciones ?? []);
    } finally {
      setEliminando(null);
    }
  }

  if (cargando) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Solo un administrador puede administrar los tags.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          Catálogo
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Tags</h1>
        <p className="text-sm text-muted">Crea etiquetas reutilizables para clasificar a los clientes de Certificaciones.</p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col gap-4 rounded-[calc(2rem-0.5rem)] p-6">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && crear()}
              placeholder="Nombre de la etiqueta (ej. Certificación 2026)"
              className="min-w-0 flex-1 rounded-2xl border border-silver-deep/60 bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-500 ease-spring placeholder:text-muted/60 focus:border-primary/50 focus:ring-4 focus:ring-primary/10"
            />
            <button
              onClick={crear}
              disabled={!nombre.trim() || creando}
              className="group flex items-center justify-center gap-2 rounded-full bg-primary py-1 pl-5 pr-1 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-60"
            >
              <span className="py-2">Crear tag</span>
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-1">
                {creando ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                ) : (
                  <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
          {tags === null ? (
            <p className="px-6 py-16 text-center text-sm text-muted">Cargando etiquetas…</p>
          ) : tags.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <TagIcon className="h-6 w-6 text-muted" strokeWidth={1.5} />
              <p className="text-sm text-muted">Todavía no hay etiquetas creadas.</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-silver">
              {tags.map((tag) => (
                <li key={tag} className="flex items-center justify-between gap-4 rounded-2xl px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorDeTag(tag)}`}>
                    <TagIcon className="h-3 w-3" strokeWidth={2} />
                    {tag}
                  </span>
                  <button
                    onClick={() => eliminar(tag)}
                    disabled={eliminando === tag}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    {eliminando === tag ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={1.75} />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                    Eliminar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
