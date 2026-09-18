"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Upload, Download, Plus, ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import type { Cliente, OtraOfertaCliente } from "@/lib/types";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import { ImportarOtrasOfertasModal } from "@/components/ImportarOtrasOfertasModal";
import { NuevaOtraOfertaModal } from "@/components/NuevaOtraOfertaModal";
import { OtraOfertaDetalle } from "@/components/OtraOfertaDetalle";

const LIMITE = 100;

type Tab = "otras-ofertas" | "su27";

export default function OtrasOfertasPage() {
  const [tab, setTab] = useState<Tab>("otras-ofertas");

  return (
    <div>
      <div className="mb-4 flex gap-1 rounded-xl border border-silver bg-surface p-1">
        <button
          onClick={() => setTab("otras-ofertas")}
          className={`ease-spring flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === "otras-ofertas" ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          Otras Ofertas
        </button>
        <button
          onClick={() => setTab("su27")}
          className={`ease-spring flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
            tab === "su27" ? "bg-surface-2 text-foreground shadow-sm" : "text-muted hover:text-foreground"
          }`}
        >
          <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
          Guardan acceso SU27
        </button>
      </div>

      {tab === "otras-ofertas" ? <TabOtrasOfertas /> : <TabGuardanSu27 />}
    </div>
  );
}

function TabOtrasOfertas() {
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

// Clientes del Club Sinergético (NO el roster de otras_ofertas_clientes) que
// tienen guardaAccesoSu27 activo — ver ClientePanel.tsx para dónde se
// otorga (solo ahí) y quitarGuardaAccesoSu27 (db.ts) para dónde se quita
// (aquí también, desde el mini perfil de abajo). Reutiliza GET /api/clientes
// con el filtro guardaSu27=1 en vez de un endpoint aparte.
function TabGuardanSu27() {
  const { usuario } = useSesion();
  const puedeQuitar = !!usuario && tienePermiso(usuario.rol, "editarAccesos");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<Cliente | null>(null);
  const [recargaKey, setRecargaKey] = useState(0);

  useEffect(() => {
    setPagina(1);
  }, [busqueda]);

  useEffect(() => {
    setCargando(true);
    const controlador = new AbortController();
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("guardaSu27", "1");
      if (busqueda.trim()) params.set("q", busqueda.trim());
      params.set("limite", String(LIMITE));
      params.set("pagina", String(pagina));
      fetch(`/api/clientes?${params}`, { signal: controlador.signal })
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
  }, [busqueda, pagina, recargaKey]);

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const inicio = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const fin = Math.min(pagina * LIMITE, total);

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-muted">
          {total.toLocaleString("es-MX")} clientes del Club con su acceso a Synergy Unlimited congelado, guardado
          para la edición 2027.
        </p>
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
            <p className="p-8 text-center text-sm text-muted">Nadie está guardando su acceso para SU27 todavía.</p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                <ul className="divide-y divide-silver/60 md:hidden">
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSeleccionado(c)}
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

                <table className="hidden w-full min-w-[700px] table-fixed text-sm md:table">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[32%]" />
                    <col className="w-[18%]" />
                    <col className="w-[24%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-silver text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap px-5 py-3">Nombre</th>
                      <th className="whitespace-nowrap px-5 py-3">Correo</th>
                      <th className="whitespace-nowrap px-5 py-3">Teléfono</th>
                      <th className="whitespace-nowrap px-5 py-3">Guarda desde</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientes.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSeleccionado(c)}
                        onKeyDown={(e) => e.key === "Enter" && setSeleccionado(c)}
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
                        <td className="truncate px-5 py-2.5 text-muted">
                          {c.guardaAccesoSu27En ? new Date(c.guardaAccesoSu27En).toLocaleDateString("es-MX") : "—"}
                        </td>
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

      {seleccionado && (
        <MiniPerfilSu27
          cliente={seleccionado}
          puedeQuitar={puedeQuitar}
          onClose={() => setSeleccionado(null)}
          onQuitado={() => {
            setSeleccionado(null);
            setRecargaKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// Mini perfil de solo lo esencial (no el ClientePanel completo) — mismo
// espíritu que PerfilExistenteResumen en solicitudes/page.tsx: recibe el
// Cliente ya cargado, arma un array de chips con sus 3 categorías de acceso.
function MiniPerfilSu27({
  cliente,
  puedeQuitar,
  onClose,
  onQuitado,
}: {
  cliente: Cliente;
  puedeQuitar: boolean;
  onClose: () => void;
  onQuitado: () => void;
}) {
  const [quitando, setQuitando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chips = [
    ...cliente.accesos.general.map((a) => `${a.cantidad} General${a.variante ? ` ${a.variante}` : ""}`),
    ...cliente.accesos.vip.map((a) => `${a.cantidad} VIP${a.variante ? ` ${a.variante}` : ""}`),
    ...cliente.accesos.black.map((a) => `${a.cantidad} Black`),
  ];

  async function quitar() {
    if (
      !window.confirm("¿Quitar la reserva de SU27? Sus accesos vuelven a poder editarse y recalcularse solos.")
    ) {
      return;
    }
    setQuitando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/quitar-su27`, { method: "POST" });
    const data = await res.json();
    setQuitando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo quitar la reserva");
      return;
    }
    onQuitado();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-silver bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{cliente.nombre}</h3>
            <p className="text-xs text-muted">{cliente.email}</p>
          </div>
          <button
            onClick={onClose}
            className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
          >
            <X className="h-4.5 w-4.5" strokeWidth={1.75} />
          </button>
        </div>

        <p className="mt-3 flex items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
          <Lock className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
          Accesos para SU-27
        </p>

        <div className="mt-3">
          {chips.length === 0 ? (
            <p className="text-xs text-muted">Sin accesos calculados.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-foreground">
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {cliente.guardaAccesoSu27En && (
          <p className="mt-3 text-xs text-muted">
            Guardando desde el {new Date(cliente.guardaAccesoSu27En).toLocaleDateString("es-MX")}
          </p>
        )}

        {error && <p className="mt-3 text-xs text-danger">{error}</p>}

        {puedeQuitar && (
          <button
            onClick={quitar}
            disabled={quitando}
            className="ease-spring mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm font-medium text-warning transition hover:bg-warning/20 disabled:opacity-50"
          >
            <Lock className="h-4 w-4" strokeWidth={1.75} />
            {quitando ? "Quitando…" : "Quitar reserva SU27"}
          </button>
        )}
      </div>
    </div>
  );
}
