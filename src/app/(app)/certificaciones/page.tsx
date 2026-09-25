"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  ArrowUpWideNarrow,
  AlertTriangle,
  Download,
  Layers,
  MessageCircle,
  RefreshCw,
  Radio,
  RefreshCcw,
  Search,
  ShieldCheck,
  Tag as TagIcon,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useFiltrosMovil } from "@/lib/filtros-movil-context";
import { useCertificacionActual } from "@/lib/certificacion-actual-context";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import type {
  ClienteCertificacion,
  EstadoCertificacion,
  MensajeBienvenidaCertificacion,
  NuevoClientePendienteCertificacion,
  ResultadoSincronizacionCertificacion,
} from "@/lib/certificaciones-tipos";
import { REGION_CERTIFICACION_LABEL, REGION_PAIS_DE_EVENTO, REGION_PAIS_LABEL, type RegionPais } from "@/lib/certificaciones-tipos";
import {
  BIENVENIDA_LABEL,
  CERTIFICACION_LEGENDAR_IA,
  CERTIFICACIONES,
  certificacionesDeCliente,
  ESTADO_LABEL,
  colorDeTag,
  diasRestantes,
  estaActivo,
  estadoReal,
} from "@/components/certificaciones/constantes";
import { useColoresTags } from "@/components/certificaciones/useColoresTags";
import { Foquitos } from "@/components/certificaciones/Foquitos";
import { CopyButton } from "@/components/certificaciones/CopyButton";
import { FilterMultiSelect } from "@/components/certificaciones/FilterMultiSelect";
import { BulkActionMenu } from "@/components/certificaciones/BulkActionMenu";
import { ClienteCertificacionPanel } from "@/components/certificaciones/ClienteCertificacionPanel";

type Criterio = "nombre" | "correo" | "telefono" | "notas" | "historial";
const CRITERIOS: { value: Criterio; label: string }[] = [
  { value: "nombre", label: "Nombre" },
  { value: "correo", label: "Correo" },
  { value: "telefono", label: "Teléfono" },
  { value: "notas", label: "Notas" },
  { value: "historial", label: "Historial" },
];

// "Sin aceptar invitación" no es un estado real: junta a los Nuevos (aún sin
// invitar) y a los que ya tienen la invitación enviada pero no la han aceptado.
const FILTRO_SIN_ACEPTAR = "SIN_ACEPTAR";
const OPCIONES_ESTADO = [
  { value: "NUEVO", label: ESTADO_LABEL.NUEVO },
  { value: "INVITACION_ENVIADA", label: ESTADO_LABEL.INVITACION_ENVIADA },
  { value: FILTRO_SIN_ACEPTAR, label: "Sin aceptar invitación" },
  { value: "ACTIVO", label: "Miembro VIP" },
  { value: "VENCIDO", label: ESTADO_LABEL.VENCIDO },
];
const OPCIONES_BIENVENIDA = (Object.keys(BIENVENIDA_LABEL) as MensajeBienvenidaCertificacion[]).map((e) => ({
  value: e,
  label: BIENVENIDA_LABEL[e],
}));

export default function CertificacionesPage() {
  useColoresTags();
  const { usuario } = useSesion();
  const puedeGestionar = usuario ? tienePermiso(usuario.rol, "gestionarCertificaciones") : false;
  const puedeActualizar = usuario ? tienePermiso(usuario.rol, "actualizarCertificaciones") : false;

  const [clientes, setClientes] = useState<ClienteCertificacion[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [criterios, setCriterios] = useState<string[]>(CRITERIOS.map((c) => c.value));
  const [idsBusqueda, setIdsBusqueda] = useState<Set<string> | null>(null);
  const [errorBusqueda, setErrorBusqueda] = useState(false);
  const [orden, setOrden] = useState<"recientes" | "antiguos">("recientes");
  const [filtroEstado, setFiltroEstado] = useState<string[]>([]);
  const [filtroRegion, setFiltroRegion] = useState<string[]>([]);
  const [filtroBienvenida, setFiltroBienvenida] = useState<string[]>([]);
  const [filtroTags, setFiltroTags] = useState<string[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string[]>([]);
  const [filtroCertificacion, setFiltroCertificacion] = useState<string[]>([]);
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());
  const [panelId, setPanelId] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<ResultadoSincronizacionCertificacion | null>(null);

  const cargar = useCallback(async () => {
    const res = await fetch("/api/certificaciones");
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El perfil (panel lateral) se puede abrir por URL: /certificaciones?id=…
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id) setPanelId(id);
  }, []);

  function abrirPanel(id: string | null) {
    setPanelId(id);
    const url = id ? `/certificaciones?id=${encodeURIComponent(id)}` : "/certificaciones";
    window.history.replaceState(null, "", url);
  }

  // Búsqueda de texto (nombre/correo/teléfono/notas/historial) resuelta en
  // el servidor — el historial vive en otra tabla. El resto de filtros
  // (chips) se aplican aquí sobre los clientes ya cargados.
  useEffect(() => {
    const q = busqueda.trim();
    if (!q) {
      setIdsBusqueda(null);
      setErrorBusqueda(false);
      return;
    }
    const controlador = new AbortController();
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ q, en: criterios.join(",") });
      fetch(`/api/certificaciones/buscar?${params}`, { signal: controlador.signal })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          // Un error no es "sin resultados": se avisa y se muestra la lista
          // completa en vez de una lista vacía o resultados de otra búsqueda.
          if (!r.ok) throw new Error(data.error ?? "Error del servidor");
          setErrorBusqueda(false);
          setIdsBusqueda(new Set<string>(data.ids ?? []));
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          setErrorBusqueda(true);
          setIdsBusqueda(null);
        });
    }, 250);
    return () => {
      clearTimeout(timeout);
      controlador.abort();
    };
  }, [busqueda, criterios]);

  // Certificación elegida en la barra superior (null = todas: todos los
  // clientes y los totales del panel).
  const { certificacionActual } = useCertificacionActual();
  const nombreCertificacion = CERTIFICACIONES.find((c) => c.id === certificacionActual)?.nombre ?? null;
  const conEstado = useMemo(
    () =>
      (clientes ?? [])
        .filter((c) => !certificacionActual || certificacionesDeCliente(c.etiquetas).includes(certificacionActual))
        .map((c) => ({ c, estado: estadoReal(c), dias: diasRestantes(c) })),
    [clientes, certificacionActual]
  );

  const stats = useMemo(
    () => ({
      total: conEstado.length,
      miembros: conEstado.filter((x) => x.estado === "ACTIVO").length,
      porVencer: conEstado.filter((x) => x.estado === "ACTIVO" && x.dias !== null && x.dias <= 30).length,
      sinInvitar: conEstado.filter((x) => x.estado === "NUEVO").length,
    }),
    [conEstado]
  );

  const opciones = useMemo(() => {
    const regiones = new Set<string>();
    const tags = new Set<string>();
    const vendedores = new Set<string>();
    for (const { c } of conEstado) {
      if (c.region) regiones.add(REGION_PAIS_DE_EVENTO[c.region]);
      c.tags.forEach((t) => tags.add(t));
      if (c.vendedor) vendedores.add(c.vendedor);
    }
    const ord = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return { regiones: ord(regiones), tags: ord(tags), vendedores: ord(vendedores) };
  }, [conEstado]);

  const hayFiltros =
    filtroEstado.length + filtroRegion.length + filtroBienvenida.length + filtroTags.length + filtroVendedor.length + filtroCertificacion.length > 0;

  // Igual que el CRM original en celular: los filtros no van en la página,
  // sino en un panel que se abre desde "Esta página → Filtros" del menú lateral.
  const [filtrosMovilAbiertos, setFiltrosMovilAbiertos] = useState(false);
  const { registrar: registrarFiltrosMovil } = useFiltrosMovil();
  const contadorFiltros =
    filtroEstado.length + filtroRegion.length + filtroBienvenida.length + filtroTags.length + filtroVendedor.length + filtroCertificacion.length;
  useEffect(() => {
    registrarFiltrosMovil({
      activo: contadorFiltros > 0,
      contador: contadorFiltros,
      onAbrir: () => setFiltrosMovilAbiertos(true),
    });
    return () => registrarFiltrosMovil(null);
  }, [contadorFiltros, registrarFiltrosMovil]);

  function limpiarFiltros() {
    setFiltroEstado([]);
    setFiltroRegion([]);
    setFiltroBienvenida([]);
    setFiltroTags([]);
    setFiltroVendedor([]);
    setFiltroCertificacion([]);
  }

  const ordenados = useMemo(() => {
    const lista = conEstado.filter(({ c, estado }) => {
      if (idsBusqueda && !idsBusqueda.has(c.id)) return false;
      if (
        filtroEstado.length &&
        !filtroEstado.some((f) =>
          f === FILTRO_SIN_ACEPTAR ? c.estado === "NUEVO" || c.estado === "INVITACION_ENVIADA" : f === estado
        )
      )
        return false;
      if (filtroRegion.length && (!c.region || !filtroRegion.includes(REGION_PAIS_DE_EVENTO[c.region]))) return false;
      if (filtroBienvenida.length && !filtroBienvenida.includes(c.mensajeBienvenida)) return false;
      if (filtroTags.length && !c.tags.some((t) => filtroTags.includes(t))) return false;
      if (filtroVendedor.length && !(c.vendedor && filtroVendedor.includes(c.vendedor))) return false;
      if (filtroCertificacion.length) {
        const conLegendar = c.etiquetas.length === 0 || c.etiquetas.some((e) => filtroCertificacion.includes(e));
        if (!conLegendar) return false;
      }
      return true;
    });
    lista.sort((a, b) => {
      const diff = new Date(b.c.fechaLlegada).getTime() - new Date(a.c.fechaLlegada).getTime();
      return orden === "recientes" ? diff : -diff;
    });
    return lista;
  }, [conEstado, idsBusqueda, filtroEstado, filtroRegion, filtroBienvenida, filtroTags, filtroVendedor, filtroCertificacion, orden]);

  // Las acciones masivas solo deben tocar lo que se ve: si un filtro o una
  // búsqueda oculta clientes que estaban seleccionados, se sacan de la
  // selección (si no, "Quitar tag" o "Marcar aceptada" se aplicaba también
  // a clientes ocultos sin que el admin lo notara).
  useEffect(() => {
    setSeleccionados((prev) => {
      if (prev.size === 0) return prev;
      const visibles = new Set(ordenados.map(({ c }) => c.id));
      const podada = new Set([...prev].filter((id) => visibles.has(id)));
      return podada.size === prev.size ? prev : podada;
    });
  }, [ordenados]);

  const todosSeleccionados = ordenados.length > 0 && ordenados.every(({ c }) => seleccionados.has(c.id));

  function alternarTodos() {
    setSeleccionados(todosSeleccionados ? new Set() : new Set(ordenados.map(({ c }) => c.id)));
  }
  function alternarUno(id: string) {
    const copia = new Set(seleccionados);
    if (copia.has(id)) copia.delete(id);
    else copia.add(id);
    setSeleccionados(copia);
  }

  // Acción masiva: recorre los seleccionados de uno en uno (cada uno con su
  // propio evento en la línea de tiempo) y recarga al final.
  async function masivo(
    ruta: string,
    body?: unknown,
    metodo: "POST" | "DELETE" = "POST",
    query = "",
    soloIds?: string[]
  ) {
    const ids = soloIds ?? Array.from(seleccionados);
    let fallos = 0;
    for (const id of ids) {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(id)}/${ruta}${query}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) fallos++;
    }
    await cargar();
    if (fallos) alert(`${fallos} de ${ids.length} no se pudieron actualizar.`);
  }

  // Acción masiva que solo aplica a clientes en cierto estado (ej. enviar
  // invitación: solo NUEVO). Los demás seleccionados se omiten y se avisa.
  async function masivoPorEstado(
    estadoRequerido: EstadoCertificacion,
    ruta: string,
    confirmar: (aplican: number, omitidos: number) => string
  ) {
    const aplican = conEstado.filter(({ c }) => seleccionados.has(c.id) && c.estado === estadoRequerido).map(({ c }) => c.id);
    const omitidos = seleccionados.size - aplican.length;
    if (aplican.length === 0) {
      alert("Ninguno de los clientes seleccionados está en el estado que requiere esta acción.");
      return;
    }
    if (!window.confirm(confirmar(aplican.length, omitidos))) return;
    await masivo(ruta, undefined, "POST", "", aplican);
  }

  function descargar() {
    const encabezados = ["Nombre", "Correo", "Teléfono", "Evento", "Estado", "Ingreso", "Vence", "Vendedor", "Monto", "Tags"];
    const filas = ordenados.map(({ c, estado }) => [
      c.nombre,
      c.email ?? "",
      c.telefono ?? "",
      c.region ? REGION_CERTIFICACION_LABEL[c.region] : "",
      ESTADO_LABEL[estado],
      new Date(c.fechaLlegada).toLocaleDateString("es-MX"),
      c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString("es-MX") : "",
      c.vendedor ?? "",
      c.monto ?? "",
      c.tags.join(", "),
    ]);
    descargarCsv("certificaciones.csv", encabezados, filas);
  }

  async function abrirSincronizar() {
    setSincronizando(true);
    try {
      const res = await fetch("/api/certificaciones/sincronizar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo sincronizar");
        return;
      }
      setResultadoSync(data);
    } finally {
      setSincronizando(false);
    }
  }

  const textoCriterios =
    criterios.length === CRITERIOS.length
      ? "Buscar en: todo"
      : criterios.length === 1
        ? `Buscar en: ${CRITERIOS.find((c) => c.value === criterios[0])?.label}`
        : "Buscar en:";

  const btnHerramienta =
    "flex items-center justify-center gap-2 rounded-full border border-silver-deep/60 bg-surface-2 px-5 py-2.5 text-sm font-medium text-muted transition-all duration-500 ease-spring hover:text-primary disabled:opacity-60";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          <Radio className="h-3 w-3 animate-pulse" strokeWidth={2} />
          Panel general · en vivo
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {nombreCertificacion ? `Clientes de ${nombreCertificacion}` : "Todos los clientes"}
        </h1>
        <p className="text-sm text-muted">
          {nombreCertificacion
            ? `Control de invitaciones y membresías anuales de ${nombreCertificacion}.`
            : "Vista general de clientes de todas las certificaciones."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:gap-4 md:grid-cols-4">
        {[
          { icon: Users, valor: stats.total, label: "Clientes totales" },
          { icon: ShieldCheck, valor: stats.miembros, label: "Miembros en VIP" },
          { icon: AlertTriangle, valor: stats.porVencer, label: "Por vencer (30 días)" },
          { icon: UserPlus, valor: stats.sinInvitar, label: "Nuevos sin invitar" },
        ].map(({ icon: Icon, valor, label }) => (
          <div key={label} className="shell rounded-xl p-1 diffused sm:rounded-[1.75rem] sm:p-2">
            <div className="core flex flex-row items-center gap-2 rounded-[calc(0.75rem-0.25rem)] p-2 sm:gap-3 sm:rounded-[calc(1.75rem-0.5rem)] sm:p-5">
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-primary/10 sm:h-9 sm:w-9 sm:rounded-xl">
                <Icon className="h-3.5 w-3.5 text-primary sm:h-4 sm:w-4" strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold tabular-nums text-foreground sm:text-2xl">{valor}</p>
                <p className="truncate text-[9px] leading-tight text-muted sm:text-xs">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col gap-4 rounded-[calc(2rem-0.5rem)] p-4 sm:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex flex-1 items-center gap-2 rounded-2xl border border-silver-deep/60 bg-surface-2 px-4 py-2.5 transition-all duration-500 ease-spring focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
              <Search className="h-4 w-4 flex-none text-muted" strokeWidth={1.5} />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
              />
            </div>
            <FilterMultiSelect
              label={textoCriterios}
              ocultarContador={criterios.length === CRITERIOS.length}
              opciones={CRITERIOS}
              seleccionados={criterios}
              onChange={(v) => setCriterios(v.length ? v : CRITERIOS.map((c) => c.value))}
            />
            {puedeActualizar && (
              <button onClick={abrirSincronizar} disabled={sincronizando} className={btnHerramienta}>
                <RefreshCw className={`h-4 w-4 ${sincronizando ? "animate-spin" : ""}`} strokeWidth={1.75} />
                Actualizar
              </button>
            )}
            <button onClick={descargar} disabled={ordenados.length === 0} className={btnHerramienta}>
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Descargar CSV
            </button>
          </div>

          {clientes !== null && (
            <p className="text-xs text-muted md:hidden">
              {ordenados.length} de {conEstado.length} clientes
            </p>
          )}

          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <button
              onClick={() => setOrden((o) => (o === "recientes" ? "antiguos" : "recientes"))}
              className="flex items-center justify-center gap-1.5 truncate rounded-full border border-silver-deep/60 bg-surface-2 px-4 py-2 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:text-primary"
            >
              {orden === "recientes" ? (
                <ArrowDownWideNarrow className="h-3.5 w-3.5" strokeWidth={2} />
              ) : (
                <ArrowUpWideNarrow className="h-3.5 w-3.5" strokeWidth={2} />
              )}
              {orden === "recientes" ? "Más nuevos primero" : "Más antiguos primero"}
            </button>
            <FilterMultiSelect label="Todos los estados" opciones={OPCIONES_ESTADO} seleccionados={filtroEstado} onChange={setFiltroEstado} />
            <FilterMultiSelect
              label="Todas las regiones"
              opciones={opciones.regiones.map((r) => ({ value: r, label: REGION_PAIS_LABEL[r as RegionPais] }))}
              seleccionados={filtroRegion}
              onChange={setFiltroRegion}
            />
            <FilterMultiSelect label="Bienvenida WA: todos" opciones={OPCIONES_BIENVENIDA} seleccionados={filtroBienvenida} onChange={setFiltroBienvenida} />
            <FilterMultiSelect
              label="Todos los tags"
              opciones={opciones.tags.map((t) => ({ value: t, label: t }))}
              seleccionados={filtroTags}
              onChange={setFiltroTags}
              buscable
            />
            <FilterMultiSelect
              label="Todos los vendedores"
              opciones={opciones.vendedores.map((v) => ({ value: v, label: v }))}
              seleccionados={filtroVendedor}
              onChange={setFiltroVendedor}
              buscable
            />
            <FilterMultiSelect
              label="Todas las certificaciones"
              opciones={[{ value: CERTIFICACION_LEGENDAR_IA, label: CERTIFICACION_LEGENDAR_IA }]}
              seleccionados={filtroCertificacion}
              onChange={setFiltroCertificacion}
            />
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="flex items-center gap-1 rounded-full px-4 py-2 text-xs font-medium text-muted transition-colors hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar filtros
              </button>
            )}
            {errorBusqueda && (
              <p className="text-xs text-danger">No se pudo buscar — se muestra la lista completa.</p>
            )}
            {clientes !== null && (
              <p className="text-xs text-muted sm:ml-auto sm:text-right">
                {ordenados.length} de {conEstado.length} clientes
              </p>
            )}
          </div>
        </div>
      </div>

      {filtrosMovilAbiertos && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <div
            className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            onClick={() => setFiltrosMovilAbiertos(false)}
            aria-hidden="true"
          />
          <div className="animate-slide-in-right relative ml-auto flex h-full w-full max-w-sm flex-col gap-3 overflow-y-auto bg-surface p-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Filtros</p>
              <button
                onClick={() => setFiltrosMovilAbiertos(false)}
                title="Cerrar filtros"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-silver-deep/60 bg-surface-2 text-muted"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <button
              onClick={() => setOrden((o) => (o === "recientes" ? "antiguos" : "recientes"))}
              className="flex w-full items-center justify-start gap-1.5 truncate rounded-full border border-silver-deep/60 bg-surface-2 px-4 py-2.5 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:text-primary"
            >
              {orden === "recientes" ? (
                <ArrowDownWideNarrow className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              ) : (
                <ArrowUpWideNarrow className="h-3.5 w-3.5 flex-none" strokeWidth={2} />
              )}
              <span className="truncate">{orden === "recientes" ? "Más nuevos primero" : "Más antiguos primero"}</span>
            </button>
            <FilterMultiSelect label="Todos los estados" opciones={OPCIONES_ESTADO} seleccionados={filtroEstado} onChange={setFiltroEstado} />
            <FilterMultiSelect
              label="Todas las regiones"
              opciones={opciones.regiones.map((r) => ({ value: r, label: REGION_PAIS_LABEL[r as RegionPais] }))}
              seleccionados={filtroRegion}
              onChange={setFiltroRegion}
            />
            <FilterMultiSelect label="Bienvenida WA: todos" opciones={OPCIONES_BIENVENIDA} seleccionados={filtroBienvenida} onChange={setFiltroBienvenida} />
            <FilterMultiSelect
              label="Todos los tags"
              opciones={opciones.tags.map((t) => ({ value: t, label: t }))}
              seleccionados={filtroTags}
              onChange={setFiltroTags}
              buscable
            />
            <FilterMultiSelect
              label="Todos los vendedores"
              opciones={opciones.vendedores.map((v) => ({ value: v, label: v }))}
              seleccionados={filtroVendedor}
              onChange={setFiltroVendedor}
              buscable
            />
            <FilterMultiSelect
              label="Todas las certificaciones"
              opciones={[{ value: CERTIFICACION_LEGENDAR_IA, label: CERTIFICACION_LEGENDAR_IA }]}
              seleccionados={filtroCertificacion}
              onChange={setFiltroCertificacion}
            />
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="flex w-full items-center justify-start gap-1.5 rounded-full px-4 py-2.5 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:text-danger"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
                Limpiar filtros
              </button>
            )}
          </div>
        </div>
      )}

      {puedeGestionar && seleccionados.size > 0 && (
        <div className="shell animate-fade-in rounded-[1.75rem] p-2 diffused-lg">
          <div className="core flex flex-wrap items-center gap-3 rounded-[calc(1.75rem-0.5rem)] p-4">
            <span className="text-xs font-medium text-muted">
              {seleccionados.size} seleccionado{seleccionados.size === 1 ? "" : "s"}
            </span>
            <BulkActionMenu
              label="Estado"
              icon={RefreshCcw}
              options={[
                {
                  key: "invitar",
                  label: "Enviar invitación",
                  onSelect: () =>
                    masivoPorEstado("NUEVO", "invitar", (n, omitidos) =>
                      `¿Enviar la invitación (con aviso a Skool) a ${n} cliente${n === 1 ? "" : "s"}?${
                        omitidos ? `

${omitidos} seleccionado${omitidos === 1 ? "" : "s"} no está${omitidos === 1 ? "" : "n"} en "Nuevo" y se omite${omitidos === 1 ? "" : "n"}.` : ""
                      }`
                    ),
                },
                {
                  key: "aceptar",
                  label: "Marcar invitación aceptada",
                  onSelect: () =>
                    masivoPorEstado("INVITACION_ENVIADA", "aceptar", (n, omitidos) =>
                      `¿Marcar como aceptada la invitación de ${n} cliente${n === 1 ? "" : "s"}?${
                        omitidos ? `

${omitidos} seleccionado${omitidos === 1 ? "" : "s"} no tiene${omitidos === 1 ? "" : "n"} invitación pendiente y se omite${omitidos === 1 ? "" : "n"}.` : ""
                      }`
                    ),
                },
              ]}
            />
            <BulkActionMenu
              label="Bienvenida WA"
              icon={MessageCircle}
              options={OPCIONES_BIENVENIDA.map((o) => ({
                key: o.value,
                label: o.label,
                onSelect: () => masivo("bienvenida", { estado: o.value }),
              }))}
            />
            <BulkActionMenu
              label="Tags"
              icon={TagIcon}
              options={opciones.tags.flatMap((t) => [
                { key: `add-${t}`, label: `Agregar "${t}"`, onSelect: () => masivo("tags", { tags: [t] }) },
                {
                  key: `del-${t}`,
                  label: `Quitar "${t}"`,
                  quitar: true,
                  onSelect: () => masivo("tags", undefined, "DELETE", `?tag=${encodeURIComponent(t)}`),
                },
              ])}
            />
            <BulkActionMenu
              label="Certificación"
              icon={Layers}
              options={[
                {
                  key: "add",
                  label: `Agregar a ${CERTIFICACION_LEGENDAR_IA}`,
                  onSelect: () => masivo("etiquetas", { etiquetas: [CERTIFICACION_LEGENDAR_IA] }),
                },
                {
                  key: "del",
                  label: `Quitar de ${CERTIFICACION_LEGENDAR_IA}`,
                  quitar: true,
                  onSelect: () => masivo("etiquetas", undefined, "DELETE", `?etiqueta=${encodeURIComponent(CERTIFICACION_LEGENDAR_IA)}`),
                },
              ]}
            />
            <button
              onClick={() => setSeleccionados(new Set())}
              className="ml-auto text-xs font-medium text-muted transition-colors hover:text-danger"
            >
              Limpiar selección
            </button>
          </div>
        </div>
      )}

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
          {clientes === null ? (
            <p className="px-4 py-10 text-center text-sm text-muted">Cargando…</p>
          ) : ordenados.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted">
              {conEstado.length === 0 ? "Todavía no hay clientes." : "Ningún cliente coincide con la búsqueda o los filtros."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-silver">
              <li className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={todosSeleccionados}
                  onChange={alternarTodos}
                  className="h-4 w-4 flex-none rounded border-silver-deep/60 accent-primary"
                />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted">Seleccionar todos</span>
              </li>
              {ordenados.map(({ c, dias }) => {
                const activo = estaActivo(c);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4">
                    <input
                      type="checkbox"
                      checked={seleccionados.has(c.id)}
                      onChange={() => alternarUno(c.id)}
                      className="h-4 w-4 flex-none rounded border-silver-deep/60 accent-primary"
                    />
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirPanel(c.id)}
                      onKeyDown={(e) => e.key === "Enter" && abrirPanel(c.id)}
                      className="group flex min-w-0 flex-1 cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl py-4 outline-none transition-colors duration-300 hover:bg-surface-2"
                    >
                      <div className="min-w-0 max-w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">{c.nombre}</span>
                          <span
                            className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline-flex ${
                              c.pausada ? "bg-warning/10 text-warning" : activo ? "bg-success/10 text-success" : "bg-silver text-muted"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${c.pausada ? "bg-warning" : activo ? "bg-success" : "bg-muted"}`} />
                            {c.pausada ? "Pausado" : activo ? "Activo" : "Inactivo"}
                          </span>
                          <span className="hidden flex-none rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary sm:inline-flex">
                            {CERTIFICACION_LEGENDAR_IA}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs text-muted">{c.email ?? "Sin correo"}</span>
                          {c.email && <CopyButton valor={c.email} />}
                        </div>
                        <p className="hidden truncate text-xs text-muted sm:block">
                          Ingreso: {new Date(c.fechaLlegada).toLocaleDateString("es-MX")}
                          {c.fechaVencimiento && ` · Vence: ${new Date(c.fechaVencimiento).toLocaleDateString("es-MX")}`}
                          {c.region && ` · ${REGION_CERTIFICACION_LABEL[c.region]}`}
                        </p>
                        {c.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {c.tags.map((t) => (
                              <span key={t} className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorDeTag(t)}`}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:flex-none sm:gap-3">
                        <Foquitos cliente={c} />
                        {activo && dias !== null && (
                          <span className="text-xs text-muted">{dias <= 0 ? "Vence hoy" : `${dias} días restantes`}</span>
                        )}
                        <ArrowUpRight
                          className="h-4 w-4 text-muted transition-transform duration-500 ease-spring group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                          strokeWidth={1.5}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {panelId && (
        <ClienteCertificacionPanel
          clienteId={panelId}
          vendedores={opciones.vendedores}
          onClose={() => abrirPanel(null)}
          onCambio={cargar}
        />
      )}

      {resultadoSync && (
        <RevisionSincronizacion resultado={resultadoSync} onCerrar={() => setResultadoSync(null)} onAplicado={cargar} />
      )}

      {puedeGestionar && clientes !== null && clientes.length === 0 && (
        <Link href="/certificaciones/nuevo" className="text-sm text-primary hover:underline">
          Registrar el primero
        </Link>
      )}
    </div>
  );
}

function RevisionSincronizacion({
  resultado,
  onCerrar,
  onAplicado,
}: {
  resultado: ResultadoSincronizacionCertificacion;
  onCerrar: () => void;
  onAplicado: () => void;
}) {
  const [cambiosSel, setCambiosSel] = useState<Set<string>>(new Set(resultado.cambiosPendientes.map((c) => c.clienteId)));
  const [nuevosSel, setNuevosSel] = useState<Set<string>>(new Set(resultado.nuevosPendientes.map((n) => n.correo)));
  const [aplicando, setAplicando] = useState(false);

  function toggle(set: Set<string>, setSet: (s: Set<string>) => void, valor: string) {
    const copia = new Set(set);
    if (copia.has(valor)) copia.delete(valor);
    else copia.add(valor);
    setSet(copia);
  }

  async function aplicar() {
    setAplicando(true);
    try {
      const cambios = resultado.cambiosPendientes
        .filter((c) => cambiosSel.has(c.clienteId))
        .map((c) => ({
          clienteId: c.clienteId,
          monto: c.monto?.nuevo,
          vendedor: c.vendedor?.nuevo,
          telefono: c.telefono?.nuevo,
          agregarTagMiembroCS: c.agregarTagMiembroCS,
        }));
      const nuevos: NuevoClientePendienteCertificacion[] = resultado.nuevosPendientes.filter((n) =>
        nuevosSel.has(n.correo)
      );

      const res = await fetch("/api/certificaciones/sincronizar/aplicar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cambios, nuevos }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo aplicar");
        return;
      }
      const avisos = [...(data.erroresCambios ?? []), ...(data.erroresNuevos ?? [])];
      alert(
        `Aplicado: ${data.cambiosAplicados} cambios, ${data.nuevosCreados} clientes nuevos.` +
          (avisos.length ? `\n\nErrores:\n${avisos.join("\n")}` : "")
      );
      onAplicado();
      onCerrar();
    } finally {
      setAplicando(false);
    }
  }

  const total = cambiosSel.size + nuevosSel.size;
  const hayAlgo = resultado.cambiosPendientes.length > 0 || resultado.nuevosPendientes.length > 0;
  const fila = "flex items-start gap-3 rounded-2xl border border-silver-deep/60 bg-surface-2 px-4 py-3 text-xs";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade-in-fast bg-black/40" onClick={onCerrar} />
      <div className="shell animate-fade-in relative w-full max-w-lg rounded-[2rem] p-2 diffused-lg">
        <div className="core flex max-h-[85vh] flex-col gap-4 rounded-[calc(2rem-0.5rem)] p-6">
          <div>
            <span className="inline-block rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
              Hoja de ventas
            </span>
            <h3 className="mt-2 text-base font-semibold text-foreground">Revisión de la hoja de ventas</h3>
            <p className="mt-1 text-xs text-muted">
              {resultado.filasLeidas} filas leídas · {resultado.ganadoras} ventas ganadoras · {resultado.omitidos} sin
              cambios
            </p>
            {resultado.errores.length > 0 && <p className="mt-2 text-xs text-danger">{resultado.errores.join(" · ")}</p>}
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto">
            {resultado.cambiosPendientes.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Cambios en clientes existentes ({resultado.cambiosPendientes.length})
                </h4>
                <div className="space-y-2">
                  {resultado.cambiosPendientes.map((c) => (
                    <label key={c.clienteId} className={fila}>
                      <input
                        type="checkbox"
                        checked={cambiosSel.has(c.clienteId)}
                        onChange={() => toggle(cambiosSel, setCambiosSel, c.clienteId)}
                        className="mt-0.5 h-4 w-4 flex-none rounded border-silver-deep/60 accent-primary"
                      />
                      <div>
                        <p className="font-medium text-foreground">
                          {c.nombre} — {c.correo}
                        </p>
                        {c.monto && (
                          <p className="text-muted">
                            Monto: {c.monto.actual ?? "—"} → {c.monto.nuevo}
                          </p>
                        )}
                        {c.vendedor && (
                          <p className="text-muted">
                            Vendedor: {c.vendedor.actual ?? "—"} → {c.vendedor.nuevo}
                          </p>
                        )}
                        {c.telefono && (
                          <p className="text-muted">
                            Teléfono: {c.telefono.actual ?? "—"} → {c.telefono.nuevo}
                          </p>
                        )}
                        {c.agregarTagMiembroCS && <p className="text-muted">+ Tag &quot;Miembro del CS&quot;</p>}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {resultado.nuevosPendientes.length > 0 && (
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
                  Clientes nuevos ({resultado.nuevosPendientes.length})
                </h4>
                <div className="space-y-2">
                  {resultado.nuevosPendientes.map((n) => (
                    <label key={n.correo} className={fila}>
                      <input
                        type="checkbox"
                        checked={nuevosSel.has(n.correo)}
                        onChange={() => toggle(nuevosSel, setNuevosSel, n.correo)}
                        className="mt-0.5 h-4 w-4 flex-none rounded border-silver-deep/60 accent-primary"
                      />
                      <div>
                        <p className="font-medium text-foreground">
                          {n.nombre} — {n.correo}
                        </p>
                        <p className="text-muted">
                          {REGION_CERTIFICACION_LABEL[n.region]}
                          {n.monto ? ` · ${n.monto}` : ""}
                          {n.vendedor ? ` · ${n.vendedor}` : ""}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {!hayAlgo && <p className="text-sm text-muted">No hay nada nuevo que aplicar.</p>}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={onCerrar}
              className="rounded-full border border-silver-deep/60 bg-surface-2 px-5 py-2.5 text-sm font-medium text-muted transition-all duration-500 ease-spring hover:text-primary"
            >
              Descartar
            </button>
            {hayAlgo && (
              <button
                onClick={aplicar}
                disabled={aplicando || total === 0}
                className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-50"
              >
                {aplicando ? "Aplicando…" : `Aplicar seleccionados (${total})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
