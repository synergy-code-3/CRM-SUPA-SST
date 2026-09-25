"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  CheckCircle2,
  Download,
  LoaderCircle,
  ShieldAlert,
  Tag as TagIcon,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { descargarCsv } from "@/lib/csv";
import { filasAClientes, parsearCSV, type FilaClienteCSV } from "@/lib/certificaciones-csv";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { REGIONES_CERTIFICACION, REGION_CERTIFICACION_LABEL, type RegionCertificacion } from "@/lib/certificaciones-tipos";
import { CERTIFICACION_LEGENDAR_IA } from "@/components/certificaciones/constantes";
import { TagPicker } from "@/components/certificaciones/Selectores";

const LOTE = 50;

const OPCIONES_EVENTO = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));

export default function ImportarCertificacionesPage() {
  const router = useRouter();
  const { usuario, cargando } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");
  const inputRef = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<FilaClienteCSV[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [tagLote, setTagLote] = useState<string | null>(null);
  const [etiquetaLote, setEtiquetaLote] = useState(CERTIFICACION_LEGENDAR_IA);
  // Evento para todo el lote: si se elige, se le aplica a todos los
  // clientes del CSV sin importar lo que traiga (o no) la columna "evento".
  const [regionLote, setRegionLote] = useState<RegionCertificacion | "">("");
  const [importando, setImportando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultado, setResultado] = useState<{ ok: number; errores: { email: string; error: string }[] } | null>(null);

  function plantilla() {
    descargarCsv(
      "plantilla_certificaciones.csv",
      ["nombre", "email", "telefono", "evento", "fecha_inscripcion", "notas", "vendedor"],
      [["Juan Pérez", "juan@correo.com", "555-1234", "MX", "2026-06-15", "Contactado en evento", "María López"]]
    );
  }

  async function handleArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setNombreArchivo(file.name);
    setResultado(null);
    setFilas(filasAClientes(parsearCSV(await file.text())));
  }

  async function importar() {
    if (!filas) return;
    const validas = filas.filter((f) => f.valido);
    setImportando(true);
    setProgreso(0);
    let ok = 0;
    const errores: { email: string; error: string }[] = [];

    for (let i = 0; i < validas.length; i += LOTE) {
      const lote = validas.slice(i, i + LOTE);
      try {
        const res = await fetch("/api/certificaciones/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filas: lote.map((f) => ({
              nombre: f.nombre,
              email: f.email,
              telefono: f.telefono,
              region: f.region,
              notas: f.notas,
              vendedor: f.vendedor,
              fechaInscripcion: f.fechaInscripcion,
            })),
            region: regionLote,
            etiqueta: etiquetaLote,
            tag: tagLote ?? "",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          lote.forEach((f) => errores.push({ email: f.email, error: data.error ?? "Error del servidor" }));
        } else {
          ok += data.ok;
          errores.push(...data.errores);
        }
      } catch {
        lote.forEach((f) => errores.push({ email: f.email, error: "Sin conexión" }));
      }
      setProgreso(Math.min(i + LOTE, validas.length));
    }

    setImportando(false);
    setResultado({ ok, errores });
  }

  if (cargando) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Solo un administrador puede importar clientes.</p>
        </div>
      </div>
    );
  }

  const validas = filas?.filter((f) => f.valido).length ?? 0;
  const invalidas = filas ? filas.length - validas : 0;
  const chip = (activo: boolean) =>
    `rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-500 ease-spring ${
      activo ? "border-primary/50 bg-primary-dim text-primary-deep" : "border-silver-deep/60 bg-surface-2 text-muted"
    }`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          Alta masiva
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Importar clientes por CSV</h1>
        <p className="text-sm text-muted">
          Sube un archivo con columnas nombre, email, telefono, evento ({REGIONES_CERTIFICACION.join(", ")}),
          fecha_inscripcion (AAAA-MM-DD), notas y vendedor (opcional). El correo es obligatorio.
        </p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col gap-4 rounded-[calc(2rem-0.5rem)] p-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={plantilla}
              className="flex items-center gap-2 rounded-full border border-silver-deep/60 bg-surface-2 px-5 py-2.5 text-sm font-medium text-muted transition-all duration-500 ease-spring hover:text-primary"
            >
              <Download className="h-4 w-4" strokeWidth={1.75} />
              Descargar plantilla
            </button>
            <button
              onClick={() => inputRef.current?.click()}
              className="group flex items-center gap-2 rounded-full bg-primary py-1 pl-5 pr-1 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98]"
            >
              <span className="flex items-center gap-2 py-2">
                <UploadCloud className="h-4 w-4" strokeWidth={1.75} />
                {nombreArchivo || "Elegir archivo CSV"}
              </span>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-1">
                <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} />
              </span>
            </button>
            <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={handleArchivo} className="hidden" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Certificación de este lote</span>
            <button type="button" onClick={() => setEtiquetaLote(CERTIFICACION_LEGENDAR_IA)} className={chip(etiquetaLote === CERTIFICACION_LEGENDAR_IA)}>
              {CERTIFICACION_LEGENDAR_IA}
            </button>
            <button type="button" onClick={() => setEtiquetaLote("")} className={chip(etiquetaLote === "")}>
              Ninguna
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Evento de este lote</span>
            <div className="w-full max-w-sm">
              <ComboboxBuscador
                opciones={OPCIONES_EVENTO}
                valor={regionLote}
                onChange={(v) => setRegionLote(v as RegionCertificacion | "")}
                placeholder="Seleccionar evento…"
                etiquetaVacio="La que traiga el CSV"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted">Tag para todo el lote (opcional)</span>
            {tagLote ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-dim px-3 py-1 text-xs font-medium text-primary-deep">
                <TagIcon className="h-3 w-3" strokeWidth={2} />
                {tagLote}
                <button onClick={() => setTagLote(null)} title="Quitar tag">
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              </span>
            ) : (
              <TagPicker seleccionados={[]} onAgregar={(tags) => setTagLote(tags[0] ?? null)} />
            )}
          </div>

          {filas && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-success">
                <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                {validas} listos para importar
              </span>
              {invalidas > 0 && (
                <span className="flex items-center gap-1.5 text-danger">
                  <XCircle className="h-4 w-4" strokeWidth={1.75} />
                  {invalidas} con errores (se omitirán)
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {filas && filas.length > 0 && (
        <div className="shell rounded-[2rem] p-2 diffused-lg">
          <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="text-xs uppercase tracking-wider text-muted">
                    <th className="px-4 py-3 font-medium">Nombre</th>
                    <th className="px-4 py-3 font-medium">Correo</th>
                    <th className="px-4 py-3 font-medium">Teléfono</th>
                    <th className="px-4 py-3 font-medium">Oferta</th>
                    <th className="px-4 py-3 font-medium">Vendedor</th>
                    <th className="px-4 py-3 font-medium">Inscripción</th>
                    <th className="px-4 py-3 font-medium">Notas</th>
                    <th className="px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-silver">
                  {filas.map((f, i) => {
                    const efectiva = regionLote || f.region;
                    return (
                      <tr key={i} className={f.valido ? "" : "bg-danger/5"}>
                        <td className="px-4 py-3 text-foreground">{f.nombre || "—"}</td>
                        <td className="px-4 py-3 text-muted">{f.email || "—"}</td>
                        <td className="px-4 py-3 text-muted">{f.telefono || "—"}</td>
                        <td className="px-4 py-3 text-muted">
                          {efectiva ? REGION_CERTIFICACION_LABEL[efectiva as RegionCertificacion] : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted">{f.vendedor || "—"}</td>
                        <td className="px-4 py-3 text-muted">
                          {f.fechaInscripcion ? new Date(f.fechaInscripcion).toLocaleDateString("es-MX") : "Hoy"}
                        </td>
                        <td className="px-4 py-3 text-muted">{f.notas || "—"}</td>
                        <td className="px-4 py-3">
                          {f.valido ? <span className="text-success">Listo</span> : <span className="text-danger">{f.error}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {resultado && resultado.errores.length > 0 && (
              <div className="mx-4 mb-2 rounded-2xl bg-danger/5 p-3 text-xs text-danger">
                <p className="mb-1 font-medium">No se pudieron crear ({resultado.errores.length}):</p>
                <ul className="max-h-32 overflow-y-auto">
                  {resultado.errores.map((e, i) => (
                    <li key={i}>
                      {e.email || "(sin correo)"} — {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 p-4">
              <p className="text-xs text-muted">
                {importando && `Importando ${progreso} de ${validas}…`}
                {resultado &&
                  `Importación terminada: ${resultado.ok} creados${
                    resultado.errores.length > 0 ? `, ${resultado.errores.length} con error` : ""
                  }.`}
              </p>
              {resultado ? (
                <button
                  onClick={() => router.push("/certificaciones")}
                  className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white transition-all duration-500 ease-spring active:scale-[0.98]"
                >
                  Ver clientes
                </button>
              ) : (
                <button
                  onClick={importar}
                  disabled={importando || validas === 0}
                  className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-50"
                >
                  {importando && <LoaderCircle className="h-4 w-4 animate-spin" strokeWidth={1.75} />}
                  Importar {validas} clientes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
