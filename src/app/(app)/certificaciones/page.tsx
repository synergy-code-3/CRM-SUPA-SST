"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Search, Trash2 } from "lucide-react";
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

  const filtrados = useMemo(() => {
    if (!clientes) return [];
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) => c.nombre.toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

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
