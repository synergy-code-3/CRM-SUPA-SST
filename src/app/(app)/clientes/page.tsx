"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Calendar,
  CalendarX,
  X,
  ChevronDown,
  Check,
  Upload,
  Download,
} from "lucide-react";
import type { Cliente } from "@/lib/types";
import { ClientePanel } from "@/components/ClientePanel";
import { NuevoClienteModal } from "@/components/NuevoClienteModal";
import { ImportarClientesModal } from "@/components/ImportarClientesModal";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import { useFiltrosMovil } from "@/lib/filtros-movil-context";

const LIMITE = 100;

type Estado = "todos" | "activos" | "revocados";
type Region = "todos" | "MX" | "US" | "LATAM";
type TipoEvento = "todos" | "webinar" | "presencial";

const FILTROS_VACIOS = {
  estado: "todos" as Estado,
  region: "todos" as Region,
  tipoEvento: "todos" as TipoEvento,
  eventos: [] as string[],
  membresias: [] as string[],
  desde: "",
  hasta: "",
  vencidosAntesDe: "",
};

// Se guardan en sessionStorage (mismo criterio que el resto de la app, ej.
// "perfil incompleto mostrado") para que sobrevivan a navegar a otra
// sección y volver a Clientes — no solo a abrir/cerrar un perfil, que ya de
// por sí no reinicia esta página porque el panel es un overlay, no una
// ruta nueva.
const CLAVE_FILTROS_STORAGE = "crm-filtros-clientes";

function leerFiltrosGuardados(): typeof FILTROS_VACIOS {
  try {
    const guardado = sessionStorage.getItem(CLAVE_FILTROS_STORAGE);
    if (!guardado) return FILTROS_VACIOS;
    return { ...FILTROS_VACIOS, ...JSON.parse(guardado) };
  } catch {
    return FILTROS_VACIOS;
  }
}

// Mostrar/ocultar el panel de filtros en escritorio (para ver más filas de
// la tabla sin scroll) — igual criterio de persistencia que los filtros de
// arriba, para que la preferencia sobreviva a navegar a otra sección.
const CLAVE_FILTROS_VISIBLES_STORAGE = "crm-filtros-clientes-visibles";

function leerFiltrosVisiblesGuardado(): boolean {
  try {
    const guardado = sessionStorage.getItem(CLAVE_FILTROS_VISIBLES_STORAGE);
    return guardado === null ? true : guardado === "1";
  } catch {
    return true;
  }
}

export default function ClientesPage() {
  return (
    <Suspense fallback={null}>
      <ClientesPageInner />
    </Suspense>
  );
}

function ClientesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { usuario } = useSesion();
  const puedeCrear = !!usuario && tienePermiso(usuario.rol, "crearCliente");
  const puedeImportar = !!usuario && tienePermiso(usuario.rol, "importarCsv");
  const puedeExportar = !!usuario && tienePermiso(usuario.rol, "exportarCsv");

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [total, setTotal] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [recargaKey, setRecargaKey] = useState(0);
  // Ids de clientes que se están consultando activamente en este momento
  // (recién creados desde "Nuevo cliente") — el foquito de Bienvenida WA
  // solo parpadea mientras de verdad se está preguntando, no para siempre.
  const [clientesEsperandoWa, setClientesEsperandoWa] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  // En celular los filtros viven en una hoja aparte, abierta desde el ítem
  // "Filtros" del menú lateral (ver Sidebar.tsx) — en escritorio (md+)
  // siempre se ven en línea, sin importar esto.
  const [mostrarFiltrosMovil, setMostrarFiltrosMovil] = useState(false);
  const { registrar: registrarFiltrosMovil } = useFiltrosMovil();
  const [filtrosVisibles, setFiltrosVisibles] = useState(true);
  const [opciones, setOpciones] = useState<{ eventos: string[]; membresias: string[] }>({
    eventos: [],
    membresias: [],
  });

  // Deep-link desde el buscador del Dashboard (u otro lugar): ?cliente=<id>
  // abre el panel directo, sin depender de que ese cliente esté en la
  // página actual de la lista (ClientePanel lo trae por su cuenta).
  useEffect(() => {
    const id = searchParams.get("cliente");
    if (id) setSeleccionado(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Retoma los filtros guardados de la sesión del navegador después del
  // primer render (no en el useState inicial, para no desalinear el HTML
  // del servidor con el del cliente).
  useEffect(() => {
    setFiltros(leerFiltrosGuardados());
    setFiltrosVisibles(leerFiltrosVisiblesGuardado());
  }, []);

  function alternarFiltrosVisibles() {
    setFiltrosVisibles((v) => {
      const nuevo = !v;
      try {
        sessionStorage.setItem(CLAVE_FILTROS_VISIBLES_STORAGE, nuevo ? "1" : "0");
      } catch {
        // sessionStorage puede fallar en modo privado — no bloquea el toggle.
      }
      return nuevo;
    });
  }

  useEffect(() => {
    try {
      sessionStorage.setItem(CLAVE_FILTROS_STORAGE, JSON.stringify(filtros));
    } catch {}
  }, [filtros]);

  useEffect(() => {
    fetch("/api/filtros-opciones")
      .then((r) => r.json())
      .then(setOpciones)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setPagina(1);
  }, [busqueda, filtros]);

  // Arma la querystring de filtros/búsqueda actuales — se comparte entre el
  // fetch de la lista (paginado) y la exportación a CSV (trae todo).
  const paramsFiltros = useCallback((): URLSearchParams => {
    const params = new URLSearchParams();
    if (busqueda.trim()) params.set("q", busqueda.trim());
    if (filtros.estado !== "todos") params.set("estado", filtros.estado);
    if (filtros.region !== "todos") params.set("region", filtros.region);
    if (filtros.tipoEvento !== "todos") params.set("tipoEvento", filtros.tipoEvento);
    if (filtros.eventos.length) params.set("eventos", filtros.eventos.join(","));
    if (filtros.membresias.length) params.set("membresias", filtros.membresias.join(","));
    if (filtros.desde) params.set("desde", filtros.desde);
    if (filtros.hasta) params.set("hasta", filtros.hasta);
    if (filtros.vencidosAntesDe) params.set("vencidosAntesDe", filtros.vencidosAntesDe);
    return params;
  }, [busqueda, filtros]);

  useEffect(() => {
    setCargando(true);
    const controlador = new AbortController();
    const timeout = setTimeout(() => {
      const params = paramsFiltros();
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
  }, [paramsFiltros, pagina, recargaKey]);

  async function descargarClientes(conFiltros: boolean) {
    setDescargando(true);
    try {
      const params = conFiltros ? paramsFiltros() : new URLSearchParams();
      const res = await fetch(`/api/clientes/exportar?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo exportar la lista de clientes");
        return;
      }
      const encabezados = ["Nombre", "Correo", "Teléfono", "País", "Evento", "Acceso", "Membresía", "Vence Skool"];
      const filas = (data.clientes as Cliente[]).map((c) => [
        c.nombre,
        c.email,
        c.telefono ?? "",
        c.pais ?? "",
        c.evento ?? "",
        c.accesoPlataforma ?? "",
        c.tipoMembresia ?? "",
        c.vencimientoSkool ?? "",
      ]);
      descargarCsv(conFiltros ? "clientes-filtrados.csv" : "clientes.csv", encabezados, filas);
    } finally {
      setDescargando(false);
    }
  }

  function actualizarEnLista(cliente: Cliente) {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? cliente : c)));
  }

  // Espera la confirmación real de WhatsApp de GHL para un cliente recién
  // creado desde "Nuevo cliente", y actualiza su fila en la lista apenas
  // llega — sin esto, el foquito se quedaba apagado hasta que alguien
  // entraba y salía del perfil (que es lo único que refrescaba esa fila).
  // Mismo intervalo/tope que ya usa ClientePanel.tsx.
  async function esperarConfirmacionWaEnLista(clienteId: string) {
    setClientesEsperandoWa((prev) => new Set(prev).add(clienteId));
    try {
      const INTERVALO_MS = 3000;
      const MAX_INTENTOS = 30; // ~90s
      for (let intento = 0; intento < MAX_INTENTOS; intento++) {
        await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
        const data = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/eventos`)
          .then((r) => r.json())
          .catch(() => null);
        const eventos: { tipo: string; autor: string }[] = data?.eventos ?? [];
        if (eventos.some((e) => e.tipo === "WA_BIENVENIDA" && e.autor === "GHL")) break;
      }
      const clienteRes = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (clienteRes?.cliente) actualizarEnLista(clienteRes.cliente);
    } finally {
      // Se quita de "en espera" tanto si llegó confirmación como si se
      // acabaron los intentos sin noticias — en ambos casos ya se dejó de
      // preguntar, así que el foquito debe dejar de parpadear.
      setClientesEsperandoWa((prev) => {
        const siguiente = new Set(prev);
        siguiente.delete(clienteId);
        return siguiente;
      });
    }
  }

  function quitarDeLista(id: string) {
    setClientes((prev) => prev.filter((c) => c.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }

  const hayFiltrosActivos =
    filtros.estado !== "todos" ||
    filtros.region !== "todos" ||
    filtros.tipoEvento !== "todos" ||
    filtros.eventos.length > 0 ||
    filtros.membresias.length > 0 ||
    !!filtros.desde ||
    !!filtros.hasta ||
    !!filtros.vencidosAntesDe;
  const hayFiltrosOBusqueda = hayFiltrosActivos || !!busqueda.trim();
  const contadorFiltros = [
    filtros.estado !== "todos",
    filtros.region !== "todos",
    filtros.tipoEvento !== "todos",
    filtros.eventos.length > 0,
    filtros.membresias.length > 0,
    !!filtros.desde,
    !!filtros.hasta,
    !!filtros.vencidosAntesDe,
  ].filter(Boolean).length;

  // Le avisa al Sidebar que esta página tiene filtros — en celular eso
  // dibuja el ítem "Filtros" en el menú (con la seña de cuántos hay
  // activos) en vez de un botón propio en la página.
  useEffect(() => {
    registrarFiltrosMovil({
      activo: hayFiltrosActivos,
      contador: contadorFiltros,
      onAbrir: () => setMostrarFiltrosMovil(true),
    });
    return () => registrarFiltrosMovil(null);
  }, [hayFiltrosActivos, contadorFiltros, registrarFiltrosMovil]);

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE));
  const inicio = total === 0 ? 0 : (pagina - 1) * LIMITE + 1;
  const fin = Math.min(pagina * LIMITE, total);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted">{total.toLocaleString("es-MX")} clientes registrados</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {puedeExportar && (
            <>
              <button
                onClick={() => descargarClientes(true)}
                disabled={descargando}
                title={hayFiltrosOBusqueda ? "Descarga solo lo que ves con los filtros/búsqueda actuales" : "Descarga la lista completa de clientes"}
                className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                {descargando ? "Descargando…" : hayFiltrosOBusqueda ? "Descargar CSV (con filtros)" : "Descargar CSV"}
              </button>
              {hayFiltrosOBusqueda && (
                <button
                  onClick={() => descargarClientes(false)}
                  disabled={descargando}
                  title="Descarga todos los clientes, ignorando los filtros/búsqueda actuales"
                  className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-3 py-2.5 text-xs font-medium text-muted transition hover:bg-surface-2 disabled:opacity-50"
                >
                  Descargar todo
                </button>
              )}
            </>
          )}
          {puedeImportar && (
            <button
              onClick={() => setMostrarImportar(true)}
              className="ease-spring flex items-center gap-2 rounded-xl border border-silver bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
            >
              <Upload className="h-4 w-4" strokeWidth={2} />
              Importar CSV
            </button>
          )}
          {puedeCrear && (
            <button
              onClick={() => setMostrarNuevo(true)}
              className="ease-spring flex items-center gap-2 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Nuevo cliente
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo o teléfono…"
            className="w-full rounded-xl border border-silver bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
        </div>
        <button
          onClick={alternarFiltrosVisibles}
          className="ease-spring hidden flex-none items-center gap-1.5 rounded-xl border border-silver bg-surface px-3.5 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2 md:flex"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${filtrosVisibles ? "" : "-rotate-90"}`}
            strokeWidth={2}
          />
          {filtrosVisibles ? "Ocultar filtros" : "Mostrar filtros"}
        </button>
      </div>

      {/* Celular: los filtros ya no van aquí — se abren desde el ítem
          "Filtros" del menú lateral (ver Sidebar.tsx + FiltrosMovilSheet
          más abajo). En escritorio se pueden ocultar con el botón de arriba,
          para dejar más espacio a la tabla — persistido en sessionStorage. */}
      <div className={`shell mb-5 hidden rounded-[1.5rem] p-2 diffused ${filtrosVisibles ? "md:block" : ""}`}>
        <div className="core space-y-3 rounded-[calc(1.5rem-0.5rem)] p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <Pildora
              opciones={[
                { valor: "todos", label: "Todos" },
                { valor: "activos", label: "Activos" },
                { valor: "revocados", label: "Revocados" },
              ]}
              valor={filtros.estado}
              onChange={(v) => setFiltros((f) => ({ ...f, estado: v as Estado }))}
            />
            <span className="mx-0.5 h-5 w-px bg-silver" />
            <Pildora
              opciones={[
                { valor: "todos", label: "Todos" },
                { valor: "MX", label: "MX" },
                { valor: "US", label: "US" },
                { valor: "LATAM", label: "LATAM" },
              ]}
              valor={filtros.region}
              onChange={(v) => setFiltros((f) => ({ ...f, region: v as Region }))}
            />
            <span className="mx-0.5 h-5 w-px bg-silver" />
            <Pildora
              opciones={[
                { valor: "todos", label: "Todos" },
                { valor: "webinar", label: "Webinar" },
                { valor: "presencial", label: "Presencial" },
              ]}
              valor={filtros.tipoEvento}
              onChange={(v) => setFiltros((f) => ({ ...f, tipoEvento: v as TipoEvento }))}
            />
            <span className="mx-0.5 h-5 w-px bg-silver" />
            <MultiSelect
              label="eventos"
              todasLabel="Todos los eventos"
              opciones={opciones.eventos}
              seleccion={filtros.eventos}
              onChange={(v) => setFiltros((f) => ({ ...f, eventos: v }))}
            />
            <MultiSelect
              label="membresías"
              todasLabel="Todas las membresías"
              opciones={opciones.membresias}
              seleccion={filtros.membresias}
              onChange={(v) => setFiltros((f) => ({ ...f, membresias: v }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-silver/60 pt-3">
            <CampoFecha
              icon={Calendar}
              label="Desde"
              value={filtros.desde}
              onChange={(v) => setFiltros((f) => ({ ...f, desde: v }))}
            />
            <CampoFecha
              icon={Calendar}
              label="Hasta"
              value={filtros.hasta}
              onChange={(v) => setFiltros((f) => ({ ...f, hasta: v }))}
            />
            <CampoFecha
              icon={CalendarX}
              label="Vencidos antes de"
              value={filtros.vencidosAntesDe}
              onChange={(v) => setFiltros((f) => ({ ...f, vencidosAntesDe: v }))}
            />
            {hayFiltrosActivos && (
              <button
                onClick={() => setFiltros(FILTROS_VACIOS)}
                className="ease-spring ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar
              </button>
            )}
          </div>
        </div>
      </div>

      {mostrarFiltrosMovil && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            onClick={() => setMostrarFiltrosMovil(false)}
            aria-hidden="true"
          />
          <div className="animate-slide-in-right relative ml-auto flex h-full w-full max-w-sm flex-col bg-surface shadow-2xl">
            <div className="flex flex-none items-center justify-between border-b border-silver/70 px-5 pb-4 pt-[calc(1.25rem+env(safe-area-inset-top))]">
              <h2 className="text-base font-semibold text-foreground">Filtros</h2>
              <button
                onClick={() => setMostrarFiltrosMovil(false)}
                aria-label="Cerrar filtros"
                className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
              >
                <X className="h-4.5 w-4.5" strokeWidth={1.75} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Estado</p>
                <Pildora
                  opciones={[
                    { valor: "todos", label: "Todos" },
                    { valor: "activos", label: "Activos" },
                    { valor: "revocados", label: "Revocados" },
                  ]}
                  valor={filtros.estado}
                  onChange={(v) => setFiltros((f) => ({ ...f, estado: v as Estado }))}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Región</p>
                <Pildora
                  opciones={[
                    { valor: "todos", label: "Todos" },
                    { valor: "MX", label: "MX" },
                    { valor: "US", label: "US" },
                    { valor: "LATAM", label: "LATAM" },
                  ]}
                  valor={filtros.region}
                  onChange={(v) => setFiltros((f) => ({ ...f, region: v as Region }))}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Tipo de evento</p>
                <Pildora
                  opciones={[
                    { valor: "todos", label: "Todos" },
                    { valor: "webinar", label: "Webinar" },
                    { valor: "presencial", label: "Presencial" },
                  ]}
                  valor={filtros.tipoEvento}
                  onChange={(v) => setFiltros((f) => ({ ...f, tipoEvento: v as TipoEvento }))}
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Evento</p>
                <MultiSelect
                  label="eventos"
                  todasLabel="Todos los eventos"
                  opciones={opciones.eventos}
                  seleccion={filtros.eventos}
                  onChange={(v) => setFiltros((f) => ({ ...f, eventos: v }))}
                  anchoCompleto
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Membresía</p>
                <MultiSelect
                  label="membresías"
                  todasLabel="Todas las membresías"
                  opciones={opciones.membresias}
                  seleccion={filtros.membresias}
                  onChange={(v) => setFiltros((f) => ({ ...f, membresias: v }))}
                  anchoCompleto
                />
              </div>

              <div className="space-y-3 border-t border-silver/60 pt-4">
                <CampoFecha
                  icon={Calendar}
                  label="Desde"
                  value={filtros.desde}
                  onChange={(v) => setFiltros((f) => ({ ...f, desde: v }))}
                />
                <CampoFecha
                  icon={Calendar}
                  label="Hasta"
                  value={filtros.hasta}
                  onChange={(v) => setFiltros((f) => ({ ...f, hasta: v }))}
                />
                <CampoFecha
                  icon={CalendarX}
                  label="Vencidos antes de"
                  value={filtros.vencidosAntesDe}
                  onChange={(v) => setFiltros((f) => ({ ...f, vencidosAntesDe: v }))}
                />
              </div>

              {hayFiltrosActivos && (
                <button
                  onClick={() => setFiltros(FILTROS_VACIOS)}
                  className="ease-spring flex w-full items-center justify-center gap-1.5 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="shell flex min-h-[24rem] flex-col rounded-[1.75rem] p-2 diffused md:h-[calc(100vh-21rem)]">
        <div className="core flex flex-1 flex-col overflow-hidden rounded-[calc(1.75rem-0.5rem)]">
          {cargando ? (
            <p className="p-8 text-center text-sm text-muted">Cargando clientes…</p>
          ) : clientes.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted">No se encontraron clientes.</p>
          ) : (
            <>
              <div className="flex-1 overflow-auto">
                {/* Celular: tarjeta de 2 líneas (nombre + correo) más los
                    indicadores de estado — el resto de los datos (teléfono,
                    evento, membresía) solo se ve al entrar al perfil. */}
                <ul className="divide-y divide-silver/60 md:hidden">
                  {clientes.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => setSeleccionado(c.id)}
                        aria-label={`Ver perfil de ${c.nombre}`}
                        className="ease-spring flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                          <p className="truncate text-xs text-muted">{c.email}</p>
                        </div>
                        <EstadoOnboarding cliente={c} enEsperaWa={clientesEsperandoWa.has(c.id)} />
                      </button>
                    </li>
                  ))}
                </ul>

                <table className="hidden w-full min-w-[1100px] table-fixed text-sm md:table">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col className="w-[23%]" />
                    <col className="w-[13%]" />
                    <col className="w-[16%]" />
                    <col className="w-[14%]" />
                    <col className="w-[16%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-silver text-left text-xs font-semibold uppercase tracking-wide text-muted">
                      <th className="whitespace-nowrap px-5 py-3">Nombre</th>
                      <th className="whitespace-nowrap px-5 py-3">Correo</th>
                      <th className="whitespace-nowrap px-5 py-3">Teléfono</th>
                      <th className="whitespace-nowrap px-5 py-3">Evento</th>
                      <th className="whitespace-nowrap px-5 py-3">Membresía</th>
                      <th className="whitespace-nowrap px-5 py-3">Estado</th>
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
                        aria-label={`Ver perfil de ${c.nombre}`}
                        className="ease-spring cursor-pointer border-b border-silver/60 outline-none transition last:border-0 hover:bg-surface-2 focus-visible:bg-primary-dim"
                      >
                        <td className="truncate px-5 py-2.5 font-medium text-foreground" title={c.nombre}>
                          {c.nombre}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted" title={c.email}>
                          {c.email}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{c.telefono || "—"}</td>
                        <td className="truncate px-5 py-2.5 text-muted" title={c.evento ?? undefined}>
                          {c.evento || "—"}
                        </td>
                        <td className="truncate px-5 py-2.5 text-muted">{c.tipoMembresia || "—"}</td>
                        <td className="px-5 py-2.5">
                          <EstadoOnboarding cliente={c} enEsperaWa={clientesEsperandoWa.has(c.id)} />
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
        <ClientePanel
          clienteId={seleccionado}
          onClose={() => {
            setSeleccionado(null);
            if (searchParams.get("cliente")) router.replace("/clientes");
          }}
          onClienteActualizado={actualizarEnLista}
          onClienteEliminado={quitarDeLista}
        />
      )}

      {mostrarNuevo && (
        <NuevoClienteModal
          onClose={() => setMostrarNuevo(false)}
          onCreado={(cliente) => {
            setClientes((prev) => [cliente, ...prev]);
            setTotal((prev) => prev + 1);
            if (cliente.telefono) void esperarConfirmacionWaEnLista(cliente.id);
          }}
        />
      )}

      {mostrarImportar && (
        <ImportarClientesModal
          onClose={() => setMostrarImportar(false)}
          onTerminado={() => setRecargaKey((k) => k + 1)}
        />
      )}
    </div>
  );
}

function Pildora({
  opciones,
  valor,
  onChange,
}: {
  opciones: { valor: string; label: string }[];
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opciones.map((o) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            onClick={() => onChange(o.valor)}
            className={`ease-spring rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              activo
                ? "border-transparent brand-plate text-white"
                : "border-silver bg-surface-2 text-muted hover:border-silver-deep hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function MultiSelect({
  label,
  todasLabel,
  opciones,
  seleccion,
  onChange,
  anchoCompleto,
}: {
  label: string;
  todasLabel: string;
  opciones: string[];
  seleccion: string[];
  onChange: (v: string[]) => void;
  anchoCompleto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  useEffect(() => {
    if (!abierto) setBusqueda("");
  }, [abierto]);

  function toggle(op: string) {
    onChange(seleccion.includes(op) ? seleccion.filter((s) => s !== op) : [...seleccion, op]);
  }

  const opcionesFiltradas = busqueda.trim()
    ? opciones.filter((op) => op.toLowerCase().includes(busqueda.trim().toLowerCase()))
    : opciones;

  const texto =
    seleccion.length === 0
      ? todasLabel
      : seleccion.length === 1
        ? seleccion[0]
        : `${seleccion.length} ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        className={`ease-spring flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
          anchoCompleto ? "w-full justify-between" : "max-w-[180px]"
        } ${
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
          {opciones.length > 5 && (
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" strokeWidth={1.75} />
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={`Buscar ${label}…`}
                className="w-full rounded-lg border border-silver bg-surface-2 py-1.5 pl-8 pr-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {seleccion.length > 0 && (
              <button
                onClick={() => onChange([])}
                className="ease-spring mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-danger transition hover:bg-danger/10"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar selección
              </button>
            )}
            {opcionesFiltradas.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted">
                {opciones.length === 0 ? "Sin opciones disponibles." : "Sin resultados."}
              </p>
            ) : (
              opcionesFiltradas.map((op) => {
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
                    <span className="truncate">{op}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CampoFecha({
  icon: Icon,
  label,
  value,
  onChange,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-muted">
      <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
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

// Un vistazo a las 3 cosas que pasan al dar de alta a un cliente: acceso en
// Kajabi (punto), invitación a Skool y mensaje de bienvenida (barritas
// diagonales) — brillan en verde cuando ya se hicieron, gris cuando no.
function EstadoOnboarding({ cliente, enEsperaWa }: { cliente: Cliente; enEsperaWa: boolean }) {
  const pausado = !!cliente.pausadoEn;
  const kajabiActivo = cliente.accesoPlataforma?.trim().toLowerCase() === "si" && !pausado;
  // "Invitación enviada" es lo que escribe este CRM (marcarInvitacionSkoolEnviada);
  // "Invitacion enviada" (sin acento) es el texto tal cual de la hoja de
  // Atención y Seguimiento importada — ambos cuentan como "sí se invitó".
  const skoolNorm = cliente.invitacionSkool?.trim().toLowerCase();
  const skoolOk = skoolNorm === "invitación enviada" || skoolNorm === "invitacion enviada";
  // "Enviado" solo lo escribe el webhook real de confirmación de GHL (nunca
  // se inventa). "MSJS Bienvenida" es el texto tal cual de la hoja
  // importada, para clientes de antes de que existiera esa confirmación.
  const bienvenidaOk = cliente.contactoWhats === "Enviado" || cliente.contactoWhats === "MSJS Bienvenida";
  const numeroInvalido = cliente.contactoWhats === "Número Inválido";
  // Solo parpadea mientras la lista está preguntando de verdad (recién
  // creado desde "Nuevo cliente", primeros ~90s) — no para siempre. Pasado
  // ese tiempo sin confirmación, o si GHL confirmó que no se pudo entregar,
  // se apaga en vez de quedar parpadeando indefinidamente.
  const esperandoBienvenida = enEsperaWa && !bienvenidaOk && !numeroInvalido;

  const tituloKajabi = pausado ? "Kajabi: pausado" : kajabiActivo ? "Kajabi: acceso activo" : "Kajabi: sin acceso";
  const tituloSkool = skoolOk ? "Skool: invitación enviada" : "Skool: sin invitación";
  const tituloBienvenida = numeroInvalido
    ? "Mensaje de bienvenida: número inválido"
    : bienvenidaOk
      ? "Mensaje de bienvenida: enviado"
      : esperandoBienvenida
        ? "Mensaje de bienvenida: esperando confirmación de GHL…"
        : "Mensaje de bienvenida: pendiente / sin confirmar";

  return (
    <div
      className="flex items-center gap-2"
      title={`${tituloKajabi} · ${tituloSkool} · ${tituloBienvenida}`}
    >
      <span
        className={`h-2.5 w-2.5 flex-none rounded-full ${
          pausado
            ? "bg-warning"
            : kajabiActivo
              ? "bg-success shadow-[0_0_6px_var(--color-success)]"
              : "bg-silver"
        }`}
      />
      <span
        className={`h-4 w-1.5 flex-none -skew-x-12 rounded-full transition ${
          skoolOk ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-silver"
        }`}
      />
      <span
        className={`h-4 w-1.5 flex-none -skew-x-12 rounded-full transition ${
          numeroInvalido
            ? "bg-danger shadow-[0_0_6px_var(--color-danger)]"
            : bienvenidaOk
              ? "animate-foco-encendido bg-success shadow-[0_0_6px_var(--color-success)]"
              : esperandoBienvenida
                ? "animate-foco-espera bg-success"
                : "bg-silver"
        }`}
      />
    </div>
  );
}
