"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Calendar, Download, ChevronLeft, ChevronRight, X, ChevronDown, Check, FileSpreadsheet } from "lucide-react";
import { ClientePanel } from "@/components/ClientePanel";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import type { ImportacionCsv } from "@/lib/importaciones-csv";
import { TIPO_EVENTO_LABEL, TIPOS_EVENTO_FILTRABLES, type TipoEvento } from "@/lib/types";

type EventoConCliente = {
  id: string;
  clienteId: string;
  tipo: TipoEvento;
  detalle: string;
  autor: string;
  fecha: string;
  clienteNombre: string;
  clienteEmail: string;
};

const LIMITE = 50;

const FILTROS_VACIOS = {
  tipos: [] as TipoEvento[],
  desde: "",
  hasta: "",
};

export default function ActividadPage() {
  const { usuario } = useSesion();
  const puedeExportar = !!usuario && tienePermiso(usuario.rol, "exportarCsv");

  const [eventos, setEventos] = useState<EventoConCliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [clienteFiltro, setClienteFiltro] = useState<{ id: string; nombre: string } | null>(null);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [vista, setVista] = useState<"movimientos" | "importaciones">("movimientos");

  // Deep link desde el perfil de un cliente ("Ver reporte completo →").
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const clienteId = params.get("cliente");
    if (clienteId) setClienteFiltro({ id: clienteId, nombre: clienteId });
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtros, clienteFiltro]);

  const paramsFiltros = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (busqueda.trim()) params.set("q", busqueda.trim());
    if (filtros.tipos.length) params.set("tipos", filtros.tipos.join(","));
    if (filtros.desde) params.set("desde", filtros.desde);
    // Sin "Z": se interpreta en la zona horaria local del navegador antes de
    // convertir a ISO, para que "Hasta" incluya el día completo tal como lo
    // ve quien arma el reporte, no medianoche UTC.
    if (filtros.hasta) params.set("hasta", new Date(`${filtros.hasta}T23:59:59.999`).toISOString());
    if (clienteFiltro) params.set("cliente", clienteFiltro.id);
    return params;
  }, [busqueda, filtros, clienteFiltro]);

  useEffect(() => {
    setCargando(true);
    const controlador = new AbortController();
    const timeout = setTimeout(() => {
      const params = paramsFiltros();
      params.set("limite", String(LIMITE));
      params.set("pagina", String(pagina));
      fetch(`/api/eventos?${params}`, { signal: controlador.signal })
        .then((r) => r.json())
        .then((data) => {
          setEventos(data.eventos ?? []);
          setTotal(data.total ?? 0);
          setCargando(false);
          // El nombre real del cliente lo trae el primer evento que matchee
          // — antes de eso solo tenemos el id crudo del query param.
          if (clienteFiltro && data.eventos?.[0]) {
            setClienteFiltro((prev) =>
              prev && prev.nombre === prev.id ? { id: prev.id, nombre: data.eventos[0].clienteNombre } : prev
            );
          }
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controlador.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsFiltros, pagina]);

  async function descargarEventos() {
    setDescargando(true);
    try {
      const params = paramsFiltros();
      const res = await fetch(`/api/eventos/exportar?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo exportar la actividad");
        return;
      }
      const encabezados = ["Fecha", "Hora", "Cliente", "Correo", "Tipo", "Detalle", "Autor"];
      const filas = (data.eventos as EventoConCliente[]).map((e) => {
        const fecha = new Date(e.fecha);
        return [
          fecha.toLocaleDateString("es-MX"),
          fecha.toLocaleTimeString("es-MX"),
          e.clienteNombre,
          e.clienteEmail,
          TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo,
          e.detalle,
          e.autor,
        ];
      });
      descargarCsv("actividad.csv", encabezados, filas);
    } finally {
      setDescargando(false);
    }
  }

  const hayFiltrosActivos = filtros.tipos.length > 0 || !!filtros.desde || !!filtros.hasta || !!clienteFiltro;

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const inicio = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const fin = Math.min(pagina * LIMITE, total);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Actividad</h1>
          <p className="text-sm text-muted">
            {total.toLocaleString("es-MX")} movimientos registrados — historial completo para reportes.
          </p>
        </div>
        {vista === "movimientos" && puedeExportar && (
          <button
            onClick={descargarEventos}
            disabled={descargando}
            title={hayFiltrosActivos || busqueda.trim() ? "Descarga solo lo que ves con los filtros/búsqueda actuales" : "Descarga todo el historial de actividad"}
            className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" strokeWidth={2} />
            {descargando ? "Descargando…" : "Descargar CSV"}
          </button>
        )}
      </div>

      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setVista("movimientos")}
          className={`ease-spring rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            vista === "movimientos"
              ? "border border-primary bg-primary-dim text-primary-deep"
              : "border border-silver bg-surface-2 text-muted hover:text-foreground"
          }`}
        >
          Movimientos
        </button>
        <button
          onClick={() => setVista("importaciones")}
          className={`ease-spring rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
            vista === "importaciones"
              ? "border border-primary bg-primary-dim text-primary-deep"
              : "border border-silver bg-surface-2 text-muted hover:text-foreground"
          }`}
        >
          Importaciones CSV
        </button>
      </div>

      {vista === "importaciones" ? (
        <ImportacionesCsvTab puedeDescargar={puedeExportar} />
      ) : (
      <>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por cliente, correo, autor o detalle…"
          className="w-full max-w-lg rounded-xl border border-silver bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
        />
      </div>

      <div className="shell mb-5 rounded-[1.5rem] p-2 diffused">
        <div className="core space-y-3 rounded-[calc(1.5rem-0.5rem)] p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <MultiSelectTipo
              seleccion={filtros.tipos}
              onChange={(v) => setFiltros((f) => ({ ...f, tipos: v }))}
            />
            <span className="mx-0.5 h-5 w-px bg-silver" />
            <CampoFecha label="Desde" value={filtros.desde} onChange={(v) => setFiltros((f) => ({ ...f, desde: v }))} />
            <CampoFecha label="Hasta" value={filtros.hasta} onChange={(v) => setFiltros((f) => ({ ...f, hasta: v }))} />
            {clienteFiltro && (
              <span className="ease-spring flex items-center gap-1.5 rounded-full border border-primary bg-primary-dim px-3 py-1.5 text-xs font-medium text-primary-deep">
                Cliente: {clienteFiltro.nombre}
                <button onClick={() => setClienteFiltro(null)} aria-label="Quitar filtro de cliente">
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </span>
            )}
            {hayFiltrosActivos && (
              <button
                onClick={() => {
                  setFiltros(FILTROS_VACIOS);
                  setClienteFiltro(null);
                }}
                className="ease-spring ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="shell flex min-h-[24rem] flex-col rounded-[1.75rem] p-2 diffused md:h-[calc(100vh-21rem)]">
        <div className="core flex flex-1 flex-col overflow-hidden rounded-[calc(1.75rem-0.5rem)]">
          {cargando ? (
            <p className="p-8 text-center text-sm text-muted">Cargando actividad…</p>
          ) : eventos.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No se encontraron movimientos.</p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <table className="w-full min-w-[1000px] table-fixed text-sm">
                  <colgroup>
                    <col className="w-[15%]" />
                    <col className="w-[20%]" />
                    <col className="w-[15%]" />
                    <col className="w-[35%]" />
                    <col className="w-[15%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-silver text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap px-5 py-3">Fecha</th>
                      <th className="whitespace-nowrap px-5 py-3">Cliente</th>
                      <th className="whitespace-nowrap px-5 py-3">Tipo</th>
                      <th className="whitespace-nowrap px-5 py-3">Detalle</th>
                      <th className="whitespace-nowrap px-5 py-3">Autor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventos.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => setSeleccionado(e.clienteId)}
                        onKeyDown={(ev) => ev.key === "Enter" && setSeleccionado(e.clienteId)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Ver perfil de ${e.clienteNombre}`}
                        className="ease-spring cursor-pointer border-b border-silver/60 outline-none transition last:border-0 hover:bg-surface-2 focus-visible:bg-primary-dim"
                      >
                        <td className="truncate px-5 py-2.5 text-xs text-muted">
                          {new Date(e.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                        </td>
                        <td className="truncate px-5 py-2.5 font-medium text-foreground" title={e.clienteEmail}>
                          {e.clienteNombre}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{TIPO_EVENTO_LABEL[e.tipo] ?? e.tipo}</td>
                        <td className="truncate px-5 py-2.5 text-muted" title={e.detalle}>
                          {e.detalle}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{e.autor}</td>
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
      </>
      )}

      {seleccionado && (
        <ClientePanel
          clienteId={seleccionado}
          onClose={() => setSeleccionado(null)}
          onClienteActualizado={() => {}}
        />
      )}
    </div>
  );
}

function MultiSelectTipo({
  seleccion,
  onChange,
}: {
  seleccion: TipoEvento[];
  onChange: (v: TipoEvento[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  function toggle(op: TipoEvento) {
    onChange(seleccion.includes(op) ? seleccion.filter((s) => s !== op) : [...seleccion, op]);
  }

  const texto =
    seleccion.length === 0
      ? "Todos los movimientos"
      : seleccion.length === 1
        ? TIPO_EVENTO_LABEL[seleccion[0]]
        : `${seleccion.length} tipos de movimiento`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        className={`ease-spring flex max-w-[220px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
          seleccion.length > 0
            ? "border-primary bg-primary-dim text-primary-deep"
            : "border-silver bg-surface-2 text-muted hover:border-silver-deep hover:text-foreground"
        }`}
      >
        <span className="truncate">{texto}</span>
        <ChevronDown className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
      </button>

      {abierto && (
        <div className="animate-fade-in-fast absolute left-0 top-[calc(100%+6px)] z-20 w-64 rounded-xl border border-silver bg-surface p-1.5 shadow-xl">
          <div className="max-h-72 overflow-y-auto">
            {seleccion.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="ease-spring mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger transition hover:bg-danger/10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar selección
              </button>
            )}
            {TIPOS_EVENTO_FILTRABLES.map((op) => {
              const activo = seleccion.includes(op);
              return (
                <button
                  key={op}
                  onClick={() => toggle(op)}
                  className={`ease-spring flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition ${
                    activo ? "bg-primary-dim text-primary-deep font-medium" : "text-foreground hover:bg-surface-2"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                      activo ? "border-primary bg-primary text-white" : "border-silver"
                    }`}
                  >
                    {activo && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="truncate">{TIPO_EVENTO_LABEL[op]}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Historial de tablas de resultados de "Importar CSV" — cada import se
// guarda solo (ver ImportarClientesModal.tsx) justo para poder recuperar
// esta tabla después si alguien cierra el modal sin descargarla.
function ImportacionesCsvTab({ puedeDescargar }: { puedeDescargar: boolean }) {
  const [importaciones, setImportaciones] = useState<Omit<ImportacionCsv, "filas">[] | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/importaciones-csv")
      .then((r) => r.json())
      .then((data) => setImportaciones(data.importaciones ?? []))
      .catch(() => setImportaciones([]));
  }, []);

  async function descargar(imp: Omit<ImportacionCsv, "filas">) {
    setDescargandoId(imp.id);
    try {
      const res = await fetch(`/api/importaciones-csv/${imp.id}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo recuperar la importación");
        return;
      }
      const completa = data.importacion as ImportacionCsv;
      const fecha = new Date(completa.creadoEn).toISOString().slice(0, 10);
      descargarCsv(
        `importacion-${fecha}.csv`,
        ["Nombre", "Correo", "Teléfono", "CRM", "Motivo (si no se dio la oferta)", "Skool", "WhatsApp (GHL)"],
        completa.filas.map((f) => [f.nombre, f.correo, f.telefono, f.crm, f.motivo, f.skool, f.whatsapp])
      );
    } finally {
      setDescargandoId(null);
    }
  }

  return (
    <div className="shell flex min-h-[24rem] flex-col rounded-[1.75rem] p-2 diffused md:h-[calc(100vh-21rem)]">
      <div className="core flex flex-1 flex-col overflow-hidden rounded-[calc(1.75rem-0.5rem)]">
        {importaciones === null ? (
          <p className="p-8 text-center text-sm text-muted">Cargando importaciones…</p>
        ) : importaciones.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">Todavía no se ha importado ningún CSV.</p>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[800px] table-fixed text-sm">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[20%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-silver text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  <th className="whitespace-nowrap px-5 py-3">Fecha</th>
                  <th className="whitespace-nowrap px-5 py-3">Autor</th>
                  <th className="whitespace-nowrap px-5 py-3">Total</th>
                  <th className="whitespace-nowrap px-5 py-3">Creados</th>
                  <th className="whitespace-nowrap px-5 py-3">Ya en CRM</th>
                  <th className="whitespace-nowrap px-5 py-3">Errores</th>
                  <th className="whitespace-nowrap px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {importaciones.map((imp) => (
                  <tr key={imp.id} className="border-b border-silver/60 last:border-0">
                    <td className="truncate px-5 py-2.5 text-xs text-muted">
                      {new Date(imp.creadoEn).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td className="truncate px-5 py-2.5 font-medium text-foreground">{imp.autor}</td>
                    <td className="px-5 py-2.5 text-muted">{imp.total}</td>
                    <td className="px-5 py-2.5 text-success">{imp.creados}</td>
                    <td className="px-5 py-2.5 text-muted">{imp.yaExistian}</td>
                    <td className="px-5 py-2.5 text-danger">{imp.errores}</td>
                    <td className="px-5 py-2.5">
                      {puedeDescargar && (
                        <button
                          onClick={() => descargar(imp)}
                          disabled={descargandoId === imp.id}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {descargandoId === imp.id ? "Descargando…" : "Descargar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CampoFecha({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
      <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-silver bg-surface-2 px-2 py-1 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
      />
    </label>
  );
}
