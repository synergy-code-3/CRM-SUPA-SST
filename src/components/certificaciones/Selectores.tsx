"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Plus, Search, Tag as TagIcon, UserCheck } from "lucide-react";
import { colorDeTag } from "./constantes";
import { refrescarColoresTags, useColoresTags } from "./useColoresTags";

export function VendedorSelect({
  valor,
  onChange,
  vendedores,
  placeholder = "Sin vendedor asignado",
  compacto = false,
  disabled = false,
}: {
  valor: string | null;
  onChange: (nombre: string | null) => void | Promise<void>;
  vendedores: string[];
  placeholder?: string;
  compacto?: boolean;
  disabled?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return vendedores;
    return vendedores.filter((v) => v.toLowerCase().includes(texto));
  }, [vendedores, busqueda]);

  function seleccionar(nombre: string | null) {
    onChange(nombre);
    setAbierto(false);
    setBusqueda("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setAbierto((v) => !v)}
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-2xl border border-silver-deep/60 bg-surface-2 text-foreground outline-none transition-all duration-500 ease-spring focus:border-primary/50 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60 ${
          compacto ? "min-w-[160px] px-3 py-1.5 text-xs" : "min-w-[220px] px-4 py-3 text-sm"
        }`}
      >
        <span className={`flex min-w-0 items-center gap-1.5 truncate ${valor ? "text-foreground" : "text-muted/60"}`}>
          <UserCheck className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
          <span className="truncate">{valor || placeholder}</span>
        </span>
        <ChevronDown className="h-4 w-4 flex-none text-muted" strokeWidth={1.75} />
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="animate-fade-in absolute z-20 mt-2 w-64 rounded-2xl border border-silver-deep/60 bg-surface-2 p-2 shadow-lg">
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-silver-deep/60 bg-surface px-3 py-2">
              <Search className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar vendedor…"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>

            <div className="max-h-56 overflow-y-auto">
              <button
                type="button"
                onClick={() => seleccionar(null)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary-dim ${
                  !valor ? "text-primary" : "text-muted"
                }`}
              >
                Sin vendedor asignado
              </button>
              {filtrados.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted">No hay vendedores.</p>
              ) : (
                filtrados.map((nombre) => (
                  <button
                    key={nombre}
                    type="button"
                    onClick={() => seleccionar(nombre)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-primary-dim ${
                      valor === nombre ? "font-medium text-primary" : "text-foreground"
                    }`}
                  >
                    {nombre}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Catálogo de tags de Certificaciones (Biblioteca, tipo "tag_certificaciones").
// Se pide una sola vez al abrir el selector.
export function TagPicker({
  seleccionados,
  onAgregar,
  disabled = false,
}: {
  seleccionados: string[];
  onAgregar: (tags: string[]) => void | Promise<void>;
  disabled?: boolean;
}) {
  useColoresTags();
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    fetch("/api/biblioteca?tipo=tag_certificaciones")
      .then((r) => r.json())
      .then((data) => setCatalogo(data.opciones ?? []))
      .catch(() => {});
  }, [abierto]);

  const disponibles = useMemo(() => catalogo.filter((t) => !seleccionados.includes(t)), [catalogo, seleccionados]);
  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return texto ? disponibles.filter((t) => t.toLowerCase().includes(texto)) : disponibles;
  }, [disponibles, busqueda]);
  const coincideExacto = catalogo.some((t) => t.toLowerCase() === busqueda.trim().toLowerCase());
  const puedeCrear = busqueda.trim() !== "" && !coincideExacto;

  async function agregar(nombre: string) {
    if (procesando) return;
    setProcesando(true);
    try {
      await onAgregar([nombre]);
      setBusqueda("");
      setAbierto(false);
    } finally {
      setProcesando(false);
    }
  }

  async function crearYAgregar() {
    const nombre = busqueda.trim();
    if (procesando || !nombre) return;
    setProcesando(true);
    try {
      // Crear el tag en el catálogo (si no hay permiso, igual se agrega al
      // cliente — el catálogo solo alimenta las sugerencias).
      await fetch("/api/biblioteca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "tag_certificaciones", valor: nombre }),
      }).catch(() => {});
      await refrescarColoresTags();
      await onAgregar([nombre]);
      setBusqueda("");
      setAbierto(false);
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded-full border border-dashed border-silver-deep/60 px-3 py-1.5 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:border-primary/50 hover:text-primary disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        Agregar tag
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAbierto(false)} />
          <div className="animate-fade-in absolute z-20 mt-2 w-64 rounded-2xl border border-silver-deep/60 bg-surface-2 p-2 shadow-lg">
            <div className="mb-2 flex items-center gap-2 rounded-xl border border-silver-deep/60 bg-surface px-3 py-2">
              <Search className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar o crear tag…"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filtrados.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => agregar(tag)}
                  disabled={procesando}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors duration-200 hover:bg-primary-dim disabled:opacity-50"
                >
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${colorDeTag(tag)}`}>
                    <TagIcon className="h-2.5 w-2.5" strokeWidth={2} />
                    {tag}
                  </span>
                </button>
              ))}
              {filtrados.length === 0 && !puedeCrear && <p className="px-3 py-2 text-xs text-muted">Sin resultados.</p>}
              {puedeCrear && (
                <button
                  type="button"
                  onClick={crearYAgregar}
                  disabled={procesando}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-primary transition-colors duration-200 hover:bg-primary-dim disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Crear &quot;{busqueda.trim()}&quot;
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
