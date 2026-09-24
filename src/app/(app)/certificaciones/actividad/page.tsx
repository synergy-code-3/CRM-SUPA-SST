"use client";

import { useEffect, useState } from "react";
import { Download, History, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { EVENTO_LABEL, CERTIFICACION_LEGENDAR_IA } from "@/components/certificaciones/constantes";
import { FilterMultiSelect } from "@/components/certificaciones/FilterMultiSelect";

type Actividad = {
  id: string;
  clienteId: string;
  clienteNombre: string;
  email: string | null;
  telefono: string | null;
  vendedor: string | null;
  etiquetas: string[];
  accion: string;
  autor: string;
  nota: string | null;
  fecha: string;
};

function aInputDate(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// Bitácora de Certificaciones (réplica de "Actividad" del CRM original): cada
// movimiento de la línea de tiempo de todos los clientes en un rango.
export default function ActividadCertificacionesPage() {
  const { usuario, cargando: cargandoSesion } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");

  const hoy = new Date();
  const [desde, setDesde] = useState(aInputDate(hoy));
  const [hasta, setHasta] = useState(aInputDate(hoy));
  const [autor, setAutor] = useState("");
  const [autores, setAutores] = useState<string[]>([]);
  const [filtroVendedor, setFiltroVendedor] = useState<string[]>([]);
  const [filtroCertificacion, setFiltroCertificacion] = useState<string[]>([]);
  const [resultados, setResultados] = useState<Actividad[] | null>(null);
  const [cargando, setCargando] = useState(false);

  async function buscar(rangoDesde = desde, rangoHasta = hasta) {
    setCargando(true);
    try {
      const params = new URLSearchParams({
        desde: new Date(`${rangoDesde}T00:00:00`).toISOString(),
        hasta: new Date(`${rangoHasta}T23:59:59.999`).toISOString(),
      });
      if (autor) params.set("autor", autor);
      const res = await fetch(`/api/certificaciones/actividad?${params}`);
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo consultar la actividad");
        return;
      }
      setResultados(data.resultados);
      setAutores(data.autores ?? []);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (puedeGestionar) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puedeGestionar]);

  const vendedores = Array.from(new Set((resultados ?? []).map((r) => r.vendedor).filter((v): v is string => !!v))).sort(
    (a, b) => a.localeCompare(b)
  );

  const filtrados = (resultados ?? []).filter((r) => {
    if (filtroVendedor.length && !(r.vendedor && filtroVendedor.includes(r.vendedor))) return false;
    if (filtroCertificacion.length) {
      const conLegendar = r.etiquetas.length === 0 || r.etiquetas.some((e) => filtroCertificacion.includes(e));
      if (!conLegendar) return false;
    }
    return true;
  });

  function preset(tipo: "hoy" | "semana" | "mes") {
    const ahora = new Date();
    let inicio = ahora;
    let fin = ahora;
    if (tipo === "semana") {
      const dia = (ahora.getDay() + 6) % 7; // lunes = 0
      inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - dia);
      fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + 6);
    } else if (tipo === "mes") {
      inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0);
    }
    const d = aInputDate(inicio);
    const h = aInputDate(fin);
    setDesde(d);
    setHasta(h);
    buscar(d, h);
  }

  function exportar() {
    if (filtrados.length === 0) return;
    descargarCsv(
      `actividad_certificaciones_${desde}_a_${hasta}.csv`,
      ["Fecha", "Nombre", "Correo", "Teléfono", "Autor", "Acción", "Detalle"],
      filtrados.map((r) => [
        new Date(r.fecha).toLocaleString("es-MX"),
        r.clienteNombre,
        r.email ?? "",
        r.telefono ?? "",
        r.autor,
        EVENTO_LABEL[r.accion] ?? r.accion,
        r.nota ?? "",
      ])
    );
  }

  if (cargandoSesion) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Solo un administrador puede ver la actividad.</p>
        </div>
      </div>
    );
  }

  const chipPreset =
    "rounded-full bg-surface-2 px-4 py-2 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:bg-primary-dim hover:text-primary-deep";
  const inputFecha =
    "rounded-xl border border-silver-deep/60 bg-surface-2 px-3 py-2 text-sm text-foreground outline-none transition-all duration-500 ease-spring focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          Bitácora
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Actividad de usuarios</h1>
        <p className="text-sm text-muted">
          Registro de cada movimiento (altas, invitaciones, aceptaciones, renovaciones y notas) de todos los clientes de
          Certificaciones.
        </p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col gap-4 rounded-[calc(2rem-0.5rem)] p-6">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => preset("hoy")} className={chipPreset}>
              Hoy
            </button>
            <button onClick={() => preset("semana")} className={chipPreset}>
              Esta semana
            </button>
            <button onClick={() => preset("mes")} className={chipPreset}>
              Este mes
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Desde</span>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={inputFecha} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Hasta</span>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={inputFecha} />
            </label>
            <div className="flex w-56 flex-none flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Usuario (opcional)</span>
              <ComboboxBuscador
                opciones={autores.map((a) => ({ valor: a, etiqueta: a }))}
                valor={autor}
                onChange={setAutor}
                placeholder="Todos los usuarios"
                etiquetaVacio="Todos los usuarios"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Vendedor</span>
              <FilterMultiSelect
                label="Todos los vendedores"
                opciones={vendedores.map((v) => ({ value: v, label: v }))}
                seleccionados={filtroVendedor}
                onChange={setFiltroVendedor}
                buscable
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">Certificación</span>
              <FilterMultiSelect
                label="Todas las certificaciones"
                opciones={[{ value: CERTIFICACION_LEGENDAR_IA, label: CERTIFICACION_LEGENDAR_IA }]}
                seleccionados={filtroCertificacion}
                onChange={setFiltroCertificacion}
              />
            </div>
            <button
              onClick={() => buscar()}
              disabled={cargando}
              className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-60"
            >
              {cargando ? (
                <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.75} />
              ) : (
                <Search className="h-4 w-4" strokeWidth={1.75} />
              )}
              Buscar
            </button>
            <button
              onClick={exportar}
              disabled={filtrados.length === 0}
              className="flex items-center gap-2 rounded-full border border-silver-deep/60 bg-surface-2 px-5 py-2.5 text-sm font-medium text-muted transition-all duration-500 ease-spring hover:text-primary disabled:opacity-40"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Descargar CSV
            </button>
          </div>
        </div>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
          {resultados === null ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <History className="h-6 w-6 text-muted" strokeWidth={1.5} />
              <p className="text-sm text-muted">Cargando movimientos…</p>
            </div>
          ) : filtrados.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-muted">No hay movimientos en ese rango.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted">
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Usuario</th>
                    <th className="px-4 py-3 font-medium">Acción</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-silver">
                  {filtrados.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-muted">
                        {new Date(r.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{r.autor}</td>
                      <td className="px-4 py-3 text-foreground">{EVENTO_LABEL[r.accion] ?? r.accion}</td>
                      <td className="px-4 py-3 text-muted">{r.clienteNombre}</td>
                      <td className="px-4 py-3 text-muted">{r.nota || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
