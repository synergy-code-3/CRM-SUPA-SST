"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Upload, Download, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import type { OtraOfertaCliente } from "@/lib/types";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import { ImportarOtrasOfertasModal } from "@/components/ImportarOtrasOfertasModal";
import { NuevaOtraOfertaModal } from "@/components/NuevaOtraOfertaModal";
import { OtraOfertaDetalle } from "@/components/OtraOfertaDetalle";

const LIMITE = 100;

export default function OtrasOfertasPage() {
  const { usuario } = useSesion();
  const puedeImportar = !!usuario && tienePermiso(usuario.rol, "importarOtrasOfertas");
  const puedeExportar = !!usuario && tienePermiso(usuario.rol, "exportarCsv");

  const [clientes, setClientes] = useState<OtraOfertaCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [recargaKey, setRecargaKey] = useState(0);

  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  const paramsFiltros = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (busqueda.trim()) params.set("q", busqueda.trim());
    return params;
  }, [busqueda]);

  useEffect(() => {
    setCargando(true);
    const controlador = new AbortController();
    const timeout = setTimeout(() => {
      const params = paramsFiltros();
      params.set("limite", String(LIMITE));
      params.set("pagina", String(pagina));
      fetch(`/api/otras-ofertas?${params}`, { signal: controlador.signal })
        .then((r) => r.json())
        .then((data) => {
          setClientes(data.clientes ?? []);
          setTotal(data.total ?? 0);
          setCargando(false);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controlador.abort();
    };
  }, [paramsFiltros, pagina, recargaKey]);

  async function descargar() {
    setDescargando(true);
    try {
      const params = paramsFiltros();
      const res = await fetch(`/api/otras-ofertas/exportar?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo exportar la lista");
        return;
      }
      const encabezados = ["Nombre", "Correo", "Teléfono", "Etiqueta", "Tags"];
      const filas = (data.clientes as OtraOfertaCliente[]).map((c) => [
        c.nombre,
        c.email,
        c.telefono ?? "",
        c.etiqueta ?? "",
        c.tags.join(", "),
      ]);
      descargarCsv("otras-ofertas.csv", encabezados, filas);
    } finally {
      setDescargando(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const inicio = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const fin = Math.min(pagina * LIMITE, total);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Otras Ofertas</h1>
          <p className="text-sm text-muted">
            {total.toLocaleString("es-MX")} personas con ofertas de Kajabi distintas al Club Sinergético
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeExportar && (
            <button
              onClick={descargar}
              disabled={descargando}
              className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
            >
              <Download className="h-4 w-4" strokeWidth={2} />
              {descargando ? "Descargando…" : "Descargar CSV"}
            </button>
          )}
          {puedeImportar && (
            <>
              <button
                onClick={() => setMostrarImportar(true)}
                className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
              >
                <Upload className="h-4 w-4" strokeWidth={2} />
                Importar CSV
              </button>
              <button
                onClick={() => setMostrarNuevo(true)}
                className="ease-spring flex items-center gap-2 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                Nuevo cliente
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="w-full max-w-md rounded-xl border border-silver bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
        />
      </div>

      <div className="shell flex min-h-[24rem] flex-col rounded-[1.75rem] p-2 diffused md:h-[calc(100vh-16rem)]">
        <div className="core flex flex-1 flex-col overflow-hidden rounded-[calc(1.75rem-0.5rem)]">
          {cargando ? (
            <p className="p-8 text-center text-sm text-muted">Cargando…</p>
          ) : clientes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No se encontraron registros.</p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <ul className="divide-y divide-silver/60 md:hidden">
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSeleccionado(c.id)}
                        aria-label={`Ver detalle de ${c.nombre}`}
                        className="ease-spring flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                          <p className="truncate text-xs text-muted">{c.email}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>

                <table className="hidden w-full min-w-[900px] table-fixed text-sm md:table">
                  <colgroup>
                    <col className="w-[14%]" />
                    <col className="w-[22%]" />
                    <col className="w-[14%]" />
                    <col className="w-[32%]" />
                    <col className="w-[18%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-silver text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap px-5 py-3">Nombre</th>
                      <th className="whitespace-nowrap px-5 py-3">Correo</th>
                      <th className="whitespace-nowrap px-5 py-3">Teléfono</th>
                      <th className="whitespace-nowrap px-5 py-3">Oferta</th>
                      <th className="whitespace-nowrap px-5 py-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSeleccionado(c.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSeleccionado(c.id)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver detalle de ${c.nombre}`}
                        className="ease-spring cursor-pointer border-b border-silver/60 outline-none transition last:border-0 hover:bg-surface-2 focus-visible:bg-primary-dim"
                      >
                        <td className="truncate px-5 py-2.5 font-medium text-foreground" title={c.nombre}>
                          {c.nombre}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted" title={c.email}>
                          {c.email}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{c.telefono || "—"}</td>
                        <td className="truncate px-5 py-2.5 text-muted" title={c.ultimaOferta ?? undefined}>
                          {c.ultimaOferta || "—"}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{c.tags.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-none items-center justify-between border-t border-silver/60 px-5 py-3">
                <p className="text-xs text-muted">
                  Mostrando {inicio.toLocaleString("es-MX")}–{fin.toLocaleString("es-MX")} de{" "}
                  {total.toLocaleString("es-MX")}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={pagina <= 1}
                    className="ease-spring flex items-center justify-center rounded-lg border border-silver p-1.5 text-muted transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                  <span className="text-xs font-medium text-foreground">
                    Página {pagina} de {totalPaginas.toLocaleString("es-MX")}
                  </span>
                  <button
                    onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                    disabled={pagina >= totalPaginas}
                    className="ease-spring flex items-center justify-center rounded-lg border border-silver p-1.5 text-muted transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {seleccionado && <OtraOfertaDetalle clienteId={seleccionado} onClose={() => setSeleccionado(null)} />}

      {mostrarImportar && (
        <ImportarOtrasOfertasModal
          onClose={() => setMostrarImportar(false)}
          onTerminado={() => setRecargaKey((k) => k + 1)}
        />
      )}

      {mostrarNuevo && (
        <NuevaOtraOfertaModal
          onClose={() => setMostrarNuevo(false)}
          onCreado={() => setRecargaKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
