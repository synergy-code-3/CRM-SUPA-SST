"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type {
  ClienteCertificacion,
  EstadoCertificacion,
  NuevoClientePendienteCertificacion,
  ResultadoSincronizacionCertificacion,
} from "@/lib/certificaciones-tipos";
import { REGION_CERTIFICACION_LABEL } from "@/lib/certificaciones-tipos";

const ESTADO_LABEL: Record<EstadoCertificacion, string> = {
  NUEVO: "Nuevo",
  INVITACION_ENVIADA: "Invitación enviada",
  ACTIVO: "Miembro",
  VENCIDO: "Vencido",
};
const ESTADO_ESTILO: Record<EstadoCertificacion, string> = {
  NUEVO: "bg-silver text-muted",
  INVITACION_ENVIADA: "bg-warning/15 text-warning",
  ACTIVO: "bg-success/15 text-success",
  VENCIDO: "bg-danger/15 text-danger",
};

function estadoReal(c: ClienteCertificacion): EstadoCertificacion {
  if (c.pausada) return c.estado === "ACTIVO" ? "ACTIVO" : c.estado;
  if (c.fechaVencimiento && new Date(c.fechaVencimiento) < new Date()) return "VENCIDO";
  return c.estado;
}

export default function CertificacionesPage() {
  const { usuario } = useSesion();
  const [clientes, setClientes] = useState<ClienteCertificacion[] | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [resultadoSync, setResultadoSync] = useState<ResultadoSincronizacionCertificacion | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string[]>([]);
  const [filtroRegion, setFiltroRegion] = useState<string[]>([]);
  const [filtroTags, setFiltroTags] = useState<string[]>([]);
  const [filtroEtiquetas, setFiltroEtiquetas] = useState<string[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string[]>([]);

  const puedeGestionar = usuario ? tienePermiso(usuario.rol, "gestionarCertificaciones") : false;
  const puedeActualizar = usuario ? tienePermiso(usuario.rol, "actualizarCertificaciones") : false;

  async function cargar() {
    const res = await fetch("/api/certificaciones");
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes);
  }

  useEffect(() => {
    cargar();
  }, []);

  // Opciones de cada MultiSelect, derivadas de los clientes ya cargados —
  // no hace falta un catálogo aparte (mismo dato con el que ya se filtra).
  const opciones = useMemo(() => {
    const lista = clientes ?? [];
    const regiones = new Set<string>();
    const tags = new Set<string>();
    const etiquetas = new Set<string>();
    const vendedores = new Set<string>();
    for (const c of lista) {
      if (c.region) regiones.add(REGION_CERTIFICACION_LABEL[c.region]);
      c.tags.forEach((t) => tags.add(t));
      c.etiquetas.forEach((e) => etiquetas.add(e));
      if (c.vendedor) vendedores.add(c.vendedor);
    }
    const ordenar = (s: Set<string>) => Array.from(s).sort((a, b) => a.localeCompare(b));
    return { regiones: ordenar(regiones), tags: ordenar(tags), etiquetas: ordenar(etiquetas), vendedores: ordenar(vendedores) };
  }, [clientes]);

  const hayFiltrosActivos =
    filtroEstado.length > 0 ||
    filtroRegion.length > 0 ||
    filtroTags.length > 0 ||
    filtroEtiquetas.length > 0 ||
    filtroVendedor.length > 0;

  function limpiarFiltros() {
    setFiltroEstado([]);
    setFiltroRegion([]);
    setFiltroTags([]);
    setFiltroEtiquetas([]);
    setFiltroVendedor([]);
  }

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (q && !c.nombre.toLowerCase().includes(q) && !(c.email ?? "").toLowerCase().includes(q)) return false;
      if (filtroEstado.length > 0 && !filtroEstado.includes(ESTADO_LABEL[estadoReal(c)])) return false;
      if (filtroRegion.length > 0 && (!c.region || !filtroRegion.includes(REGION_CERTIFICACION_LABEL[c.region]))) return false;
      if (filtroTags.length > 0 && !c.tags.some((t) => filtroTags.includes(t))) return false;
      if (filtroEtiquetas.length > 0 && !c.etiquetas.some((e) => filtroEtiquetas.includes(e))) return false;
      if (filtroVendedor.length > 0 && !(c.vendedor && filtroVendedor.includes(c.vendedor))) return false;
      return true;
    });
  }, [clientes, busqueda, filtroEstado, filtroRegion, filtroTags, filtroEtiquetas, filtroVendedor]);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Certificaciones</h1>
          <p className="text-sm text-muted">Socios de Legendar-IA.</p>
        </div>
        <div className="flex items-center gap-2">
          {puedeGestionar && (
            <Link
              href="/certificaciones/papelera"
              className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              Papelera
            </Link>
          )}
          {puedeActualizar && (
            <button
              onClick={abrirSincronizar}
              disabled={sincronizando}
              className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? "animate-spin" : ""}`} strokeWidth={1.75} />
              Actualizar
            </button>
          )}
          {puedeGestionar && (
            <Link
              href="/certificaciones/nuevo"
              className="ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
              Nuevo cliente
            </Link>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.75} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="w-full rounded-lg border border-silver bg-surface-2 py-1.5 pl-9 pr-3 text-sm outline-none ring-primary/30 focus:ring-2"
        />
      </div>

      <div className="shell rounded-[1.5rem] p-2 diffused">
        <div className="core flex flex-wrap items-center gap-2 rounded-[calc(1.5rem-0.5rem)] p-3.5">
          <MultiSelect
            label="estados"
            todasLabel="Todos los estados"
            opciones={Object.values(ESTADO_LABEL)}
            seleccion={filtroEstado}
            onChange={setFiltroEstado}
          />
          <MultiSelect
            label="regiones"
            todasLabel="Todas las regiones"
            opciones={opciones.regiones}
            seleccion={filtroRegion}
            onChange={setFiltroRegion}
          />
          <MultiSelect
            label="certificaciones"
            todasLabel="Todas las certificaciones"
            opciones={opciones.etiquetas}
            seleccion={filtroEtiquetas}
            onChange={setFiltroEtiquetas}
          />
          <MultiSelect label="tags" todasLabel="Todos los tags" opciones={opciones.tags} seleccion={filtroTags} onChange={setFiltroTags} />
          <MultiSelect
            label="vendedores"
            todasLabel="Todos los vendedores"
            opciones={opciones.vendedores}
            seleccion={filtroVendedor}
            onChange={setFiltroVendedor}
          />
          {hayFiltrosActivos && (
            <button
              onClick={limpiarFiltros}
              className="ease-spring ml-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {clientes !== null && (
        <p className="text-xs text-muted">
          {filtrados.length} de {clientes.length} clientes
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-silver">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Región</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {clientes === null && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Cargando…
                </td>
              </tr>
            )}
            {clientes !== null && filtrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  No hay clientes.
                </td>
              </tr>
            )}
            {filtrados.map((c) => {
              const estado = estadoReal(c);
              return (
                <tr key={c.id} className="border-t border-silver/60 transition hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link href={`/certificaciones/${encodeURIComponent(c.id)}`} className="hover:underline">
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{c.region ? REGION_CERTIFICACION_LABEL[c.region] : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[estado]}`}>
                      {ESTADO_LABEL[estado]}
                      {c.pausada ? " (pausada)" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString("es-MX") : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resultadoSync && (
        <RevisionSincronizacion resultado={resultadoSync} onCerrar={() => setResultadoSync(null)} onAplicado={cargar} />
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-silver bg-surface p-5 shadow-xl">
        <h3 className="text-sm font-semibold text-foreground">Revisión de la hoja de ventas</h3>
        <p className="mt-1 text-xs text-muted">
          {resultado.filasLeidas} filas leídas · {resultado.ganadoras} ventas ganadoras · {resultado.omitidos} sin
          cambios
        </p>
        {resultado.errores.length > 0 && (
          <p className="mt-2 text-xs text-danger">{resultado.errores.join(" · ")}</p>
        )}

        {resultado.cambiosPendientes.length > 0 && (
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Cambios en clientes existentes ({resultado.cambiosPendientes.length})
            </h4>
            <div className="space-y-2">
              {resultado.cambiosPendientes.map((c) => (
                <label
                  key={c.clienteId}
                  className="flex items-start gap-2 rounded-lg border border-silver p-2.5 text-xs"
                >
                  <input
                    type="checkbox"
                    checked={cambiosSel.has(c.clienteId)}
                    onChange={() => toggle(cambiosSel, setCambiosSel, c.clienteId)}
                    className="mt-0.5"
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
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Clientes nuevos ({resultado.nuevosPendientes.length})
            </h4>
            <div className="space-y-2">
              {resultado.nuevosPendientes.map((n) => (
                <label key={n.correo} className="flex items-start gap-2 rounded-lg border border-silver p-2.5 text-xs">
                  <input
                    type="checkbox"
                    checked={nuevosSel.has(n.correo)}
                    onChange={() => toggle(nuevosSel, setNuevosSel, n.correo)}
                    className="mt-0.5"
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

        {resultado.cambiosPendientes.length === 0 && resultado.nuevosPendientes.length === 0 && (
          <p className="mt-4 text-sm text-muted">No hay nada nuevo que aplicar.</p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onCerrar}
            className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
          >
            Cerrar
          </button>
          {(resultado.cambiosPendientes.length > 0 || resultado.nuevosPendientes.length > 0) && (
            <button
              onClick={aplicar}
              disabled={aplicando}
              className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
            >
              {aplicando ? "Aplicando…" : "Aplicar seleccionados"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Mismo componente/patrón que MultiSelect en /clientes (Club) — copiado en
// vez de compartido a propósito, mientras esta sección sigue chica y con
// sus propias opciones (regiones/tags/etiquetas propios de Certificaciones).
function MultiSelect({
  label,
  todasLabel,
  opciones,
  seleccion,
  onChange,
}: {
  label: string;
  todasLabel: string;
  opciones: string[];
  seleccion: string[];
  onChange: (v: string[]) => void;
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

  const texto = seleccion.length === 0 ? todasLabel : seleccion.length === 1 ? seleccion[0] : `${seleccion.length} ${label}`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setAbierto((a) => !a)}
        className={`ease-spring flex max-w-[180px] items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
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
              <p className="px-2.5 py-2 text-xs text-muted">{opciones.length === 0 ? "Sin opciones disponibles." : "Sin resultados."}</p>
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
