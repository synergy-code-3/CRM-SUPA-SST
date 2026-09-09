"use client";

import { useEffect, useState } from "react";
import { Plus, X, PartyPopper, Tag, Tags, Award, Hash } from "lucide-react";
import type { TipoCatalogo } from "@/lib/catalogo";

const SECCIONES: { tipo: TipoCatalogo; titulo: string; descripcion: string; icon: typeof Tag }[] = [
  {
    tipo: "evento",
    titulo: "Eventos",
    descripcion: "Opciones del campo Evento en el alta de clientes.",
    icon: PartyPopper,
  },
  {
    tipo: "etiqueta",
    titulo: "Etiquetas",
    descripcion: "Opciones del campo Etiqueta en el alta de clientes.",
    icon: Tag,
  },
  {
    tipo: "tag",
    titulo: "Tags",
    descripcion: "Opciones de Tags, asignables desde el panel de cada cliente.",
    icon: Tags,
  },
  {
    tipo: "certificacion",
    titulo: "Certificaciones",
    descripcion: "Certificaciones asignables desde el panel de un cliente de Certificaciones.",
    icon: Award,
  },
  {
    tipo: "tag_certificaciones",
    titulo: "Tags de Certificaciones",
    descripcion: "Opciones de Tags para clientes de Certificaciones — catálogo aparte del de Club.",
    icon: Hash,
  },
];

export default function BibliotecaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Biblioteca</h1>
        <p className="mt-1 text-sm text-muted">
          Catálogos compartidos por toda la app. Agrega opciones aquí y aparecen de inmediato en los
          formularios.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {SECCIONES.map((s) => (
          <SeccionCatalogo key={s.tipo} {...s} />
        ))}
      </div>
    </div>
  );
}

function SeccionCatalogo({
  tipo,
  titulo,
  descripcion,
  icon: Icon,
}: {
  tipo: TipoCatalogo;
  titulo: string;
  descripcion: string;
  icon: typeof Tag;
}) {
  const [opciones, setOpciones] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/biblioteca?tipo=${tipo}`)
      .then((r) => r.json())
      .then((data) => setOpciones(data.opciones ?? []))
      .finally(() => setCargando(false));
  }, [tipo]);

  async function agregar() {
    if (!nuevo.trim()) return;
    setGuardando(true);
    setError(null);
    const res = await fetch("/api/biblioteca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, valor: nuevo }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo agregar");
      return;
    }
    setOpciones(data.opciones ?? []);
    setNuevo("");
  }

  async function eliminar(valor: string) {
    const anterior = opciones;
    setOpciones((o) => o.filter((v) => v !== valor));
    const res = await fetch("/api/biblioteca", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, valor }),
    });
    if (!res.ok) setOpciones(anterior);
  }

  return (
    <section className="shell rounded-2xl p-2 diffused">
      <div className="core flex h-full flex-col rounded-[calc(1rem-0.25rem)] p-5">
        <div className="mb-1 flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-foreground">{titulo}</h2>
        </div>
        <p className="mb-4 text-xs text-muted">{descripcion}</p>

        <div className="mb-3 flex gap-2">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && agregar()}
            placeholder="Agregar opción…"
            className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
          />
          <button
            onClick={agregar}
            disabled={guardando || !nuevo.trim()}
            className="ease-spring flex flex-none items-center justify-center rounded-lg brand-plate px-3 text-white transition disabled:opacity-40"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {error && <p className="mb-2 text-xs text-danger">{error}</p>}

        <div className="max-h-80 flex-1 overflow-y-auto">
          {cargando ? (
            <p className="text-sm text-muted">Cargando…</p>
          ) : opciones.length === 0 ? (
            <p className="text-sm text-muted">Todavía no hay opciones.</p>
          ) : (
            <ul className="space-y-1">
              {opciones.map((v) => (
                <li
                  key={v}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-surface-2"
                >
                  <span className="truncate">{v}</span>
                  <button
                    onClick={() => eliminar(v)}
                    className="ease-spring flex-none rounded-full p-1 text-muted transition hover:bg-danger/10 hover:text-danger"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
