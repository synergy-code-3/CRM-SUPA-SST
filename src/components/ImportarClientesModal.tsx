"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, Download, CheckCircle2, XCircle, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { descargarCsv } from "@/lib/csv";
import { ComboboxBuscador } from "./ComboboxBuscador";

// Evento y Etiqueta ya no van en el CSV: se eligen una sola vez en pantalla
// y se aplican a todos los renglones del archivo.
const COLUMNAS = ["Nombre completo", "Correo", "País", "Teléfono", "Tipo de membresía"];

type FilaCsv = {
  nombre: string;
  email: string;
  pais: string;
  telefono: string;
  tipoMembresia: string;
};

type EstadoWhatsapp = "confirmando" | "enviado" | "fallido" | "sin_confirmacion";

type ResultadoFila = {
  fila: FilaCsv;
  ok: boolean;
  error?: string;
  // true cuando el error es específicamente "ya existe un cliente con ese
  // correo" (altaCompletaCliente lo rechaza antes de tocar Kajabi) — se
  // separa de los demás errores porque no es una falla real, es esperado:
  // la persona ya cayó por Kajabi (o por cualquier otro medio) antes de
  // subir este CSV.
  yaExistia?: boolean;
  avisoKajabi?: string | null;
  avisoSkool?: string | null;
  avisoGhl?: string | null;
  // Si el cliente quedó con teléfono guardado: determina si aplica esperar
  // confirmación de WhatsApp (nunca se asume "OK" — la entrega real solo la
  // confirma el webhook de GHL).
  tieneTelefono?: boolean;
  // Id del cliente ya creado — hace falta para poder consultar su timeline y
  // esperar ahí la confirmación real de GHL.
  clienteId?: string;
  estadoWhatsApp?: EstadoWhatsapp;
};

type FiltroResultados = "todos" | "exitosos" | "avisos" | "ya_existian" | "errores";

const LABEL_FILTRO: Record<FiltroResultados, string> = {
  todos: "Todos",
  exitosos: "Exitosos",
  avisos: "Revisar",
  ya_existian: "Ya en el CRM",
  errores: "Errores",
};

const MENSAJE_YA_EXISTE = "Ya existe un cliente con ese correo";

// Mismo intervalo/tope ya probado en el panel del cliente (ver
// esperarConfirmacionWa en ClientePanel.tsx): el Workflow real de GHL ha
// tardado entre 13 y 46s en pruebas, con margen hasta ~90s.
const INTERVALO_WA_MS = 3000;
const MAX_INTENTOS_WA = 30;

// Si Kajabi rechazó el correo, la invitación de Skool que se mandó en
// paralelo (Skool no valida nada, solo confirma que recibió la petición) no
// sirve de nada hasta que se corrija el correo — no tiene sentido mostrarla
// como "solicitada".
function correoInvalidoEnKajabi(r: ResultadoFila): boolean {
  return Boolean(r.avisoKajabi?.startsWith("Correo inválido"));
}

// Quita marcas diacríticas (acentos) después de normalizar a NFD, para
// comparar encabezados sin importar si el usuario escribió "Pais" o "País".
const MARCAS_DIACRITICAS = new RegExp("[" + String.fromCharCode(0x0300) + "-" + String.fromCharCode(0x036f) + "]", "g");

function normalizarEncabezado(s: string): string {
  return s.normalize("NFD").replace(MARCAS_DIACRITICAS, "").trim().toLowerCase();
}

// Parser CSV mínimo con soporte de comillas (RFC 4180 básico) — evita
// depender de una librería de parsing en el navegador.
function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      enComillas = true;
    } else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((v) => v.trim() !== ""));
}

function descargarPlantilla() {
  descargarCsv(
    "plantilla-clientes.csv",
    COLUMNAS,
    [["Juan Pérez", "juan@correo.com", "México", "+52 5512345678", "12 Meses"]]
  );
}

export function ImportarClientesModal({
  onClose,
  onTerminado,
}: {
  onClose: () => void;
  onTerminado: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<FilaCsv[] | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [resultados, setResultados] = useState<ResultadoFila[] | null>(null);
  const [filtroResultados, setFiltroResultados] = useState<FiltroResultados>("todos");
  const [eventos, setEventos] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [etiquetas, setEtiquetas] = useState<{ valor: string; etiqueta: string }[]>([]);
  const [eventoGlobal, setEventoGlobal] = useState("");
  const [etiquetaGlobal, setEtiquetaGlobal] = useState("");

  useEffect(() => {
    fetch("/api/biblioteca?tipo=evento")
      .then((r) => r.json())
      .then((data) => setEventos((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setEventos([]));
    fetch("/api/biblioteca?tipo=etiqueta")
      .then((r) => r.json())
      .then((data) => setEtiquetas((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setEtiquetas([]));
  }, []);

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorArchivo(null);
    setResultados(null);
    setNombreArchivo(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const texto = String(reader.result ?? "");
      const crudo = parsearCsv(texto);
      if (crudo.length < 2) {
        setErrorArchivo("El archivo no tiene filas de datos.");
        setFilas(null);
        return;
      }
      const encabezados = crudo[0].map(normalizarEncabezado);
      const idx = {
        nombre: encabezados.indexOf("nombre completo"),
        email: encabezados.indexOf("correo"),
        pais: encabezados.indexOf("pais"),
        telefono: encabezados.indexOf("telefono"),
        tipoMembresia: encabezados.indexOf("tipo de membresia"),
      };
      if (idx.nombre === -1 || idx.email === -1) {
        setErrorArchivo('El CSV debe tener al menos las columnas "Nombre completo" y "Correo".');
        setFilas(null);
        return;
      }
      const datos: FilaCsv[] = crudo.slice(1).map((f) => ({
        nombre: (f[idx.nombre] ?? "").trim(),
        email: (f[idx.email] ?? "").trim(),
        pais: idx.pais >= 0 ? (f[idx.pais] ?? "").trim() : "",
        telefono: idx.telefono >= 0 ? (f[idx.telefono] ?? "").trim() : "",
        tipoMembresia: idx.tipoMembresia >= 0 ? (f[idx.tipoMembresia] ?? "").trim() : "",
      }));
      setFilas(datos);
    };
    reader.readAsText(file, "utf-8");
  }

  async function importar() {
    if (!filas) return;
    setProcesando(true);
    setProgreso(0);
    const salida: ResultadoFila[] = [];
    for (const fila of filas) {
      if (!fila.nombre || !fila.email) {
        salida.push({ fila, ok: false, error: "Falta nombre o correo" });
        setProgreso((p) => p + 1);
        continue;
      }
      try {
        const res = await fetch("/api/clientes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre: fila.nombre,
            email: fila.email,
            pais: fila.pais || undefined,
            telefono: fila.telefono || undefined,
            evento: eventoGlobal || undefined,
            tipoMembresia: fila.tipoMembresia || undefined,
            etiqueta: etiquetaGlobal || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const error = data.error ?? "Error desconocido";
          salida.push({ fila, ok: false, error, yaExistia: error === MENSAJE_YA_EXISTE });
        } else {
          salida.push({
            fila,
            ok: true,
            avisoKajabi: data.avisoKajabi,
            avisoSkool: data.avisoSkool,
            avisoGhl: data.avisoGhl,
            tieneTelefono: Boolean(data.cliente?.telefono),
            clienteId: data.cliente?.id,
            estadoWhatsApp: data.cliente?.telefono && !data.avisoGhl ? "confirmando" : undefined,
          });
        }
      } catch {
        salida.push({ fila, ok: false, error: "Error de red" });
      }
      setProgreso((p) => p + 1);
    }
    setResultados(salida);
    setProcesando(false);
    onTerminado();
    void esperarConfirmacionesWa(salida);
  }

  // Espera, en paralelo para todos los clientes recién creados, la
  // confirmación real de GHL sobre si el WhatsApp de bienvenida se entregó o
  // no — igual que hace el panel del cliente al reenviarlo a mano, en vez de
  // asumir "OK" solo porque se pidió el envío.
  async function esperarConfirmacionesWa(filas: ResultadoFila[]): Promise<void> {
    const pendientes = filas.filter((r) => r.ok && !r.avisoGhl && r.tieneTelefono && r.clienteId);
    if (pendientes.length === 0) return;
    await Promise.all(pendientes.map((r) => esperarUnaConfirmacionWa(r.clienteId as string)));
    onTerminado();
  }

  // Botón "Reintentar" para las filas que quedaron en "sin_confirmacion" —
  // el Workflow de GHL puede tardar más de los ~90s que ya se esperaron.
  function reintentarConfirmacionWa(clienteId: string) {
    actualizarEstadoWa(clienteId, "confirmando");
    void esperarUnaConfirmacionWa(clienteId).then(() => onTerminado());
  }

  async function esperarUnaConfirmacionWa(clienteId: string): Promise<void> {
    for (let intento = 0; intento < MAX_INTENTOS_WA; intento++) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_WA_MS));
      const data = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/eventos`)
        .then((r) => r.json())
        .catch(() => null);
      const eventosCliente: { tipo: string; autor: string; detalle: string }[] = data?.eventos ?? [];
      const confirmacion = eventosCliente.find((e) => e.tipo === "WA_BIENVENIDA" && e.autor === "GHL");
      if (confirmacion) {
        actualizarEstadoWa(clienteId, confirmacion.detalle.includes("no se pudo entregar") ? "fallido" : "enviado");
        return;
      }
    }
    actualizarEstadoWa(clienteId, "sin_confirmacion");
  }

  function actualizarEstadoWa(clienteId: string, estado: EstadoWhatsapp) {
    setResultados((prev) => prev?.map((r) => (r.clienteId === clienteId ? { ...r, estadoWhatsApp: estado } : r)) ?? prev);
  }

  function exportarResultados() {
    if (!resultadosFiltrados.length) return;
    descargarCsv(
      "resultado-importacion.csv",
      ["Nombre", "Correo", "Teléfono", "CRM", "Motivo (si no se dio la oferta)", "Skool", "WhatsApp (GHL)"],
      resultadosFiltrados.map((r) => [
        r.fila.nombre,
        r.fila.email,
        r.fila.telefono,
        r.ok ? "Creado" : r.yaExistia ? "Ya existe en el CRM" : `Error: ${r.error ?? ""}`,
        textoKajabi(r),
        textoSkool(r),
        textoWhatsapp(r),
      ])
    );
  }

  // Kajabi: "OK" sí es una confirmación real — significa que la oferta
  // quedó otorgada en Kajabi en este mismo momento. Si no, se muestra el
  // motivo puntual (ya traducido a una frase simple por kajabi.ts).
  function textoKajabi(r: ResultadoFila): string {
    if (!r.ok) return "—";
    return r.avisoKajabi ? r.avisoKajabi : "OK";
  }

  // Skool: el webhook solo confirma que Skool recibió la solicitud (HTTP
  // 200), no que el correo exista o que la invitación se haya entregado —
  // por eso nunca se llama "OK" aquí, para no dar a entender una entrega
  // confirmada que el sistema no puede verificar. Y si el propio Kajabi ya
  // dijo que el correo es inválido, esa invitación no sirve de nada hasta
  // que se corrija.
  function textoSkool(r: ResultadoFila): string {
    if (!r.ok) return "—";
    if (correoInvalidoEnKajabi(r)) return "Esperando correo correcto";
    return r.avisoSkool ? `Falló: ${r.avisoSkool}` : "Solicitada (sin confirmación de entrega)";
  }

  // WhatsApp: altaEnGhl solo crea el contacto y le pone el tag que dispara
  // el Workflow de GHL — la confirmación real de si se entregó o no viene
  // del webhook de GHL, y se espera activamente (ver esperarConfirmacionesWa)
  // en vez de asumir un resultado.
  function textoWhatsapp(r: ResultadoFila): string {
    if (!r.ok) return "—";
    if (r.avisoGhl) return `Falló: ${r.avisoGhl}`;
    if (!r.tieneTelefono) return "— (sin teléfono)";
    if (r.estadoWhatsApp === "enviado") return "Enviado (confirmado por GHL)";
    if (r.estadoWhatsApp === "fallido") return "No se pudo entregar (confirmado por GHL)";
    if (r.estadoWhatsApp === "sin_confirmacion") return "Sin confirmación de GHL (revisar más tarde)";
    return "Esperando confirmación de GHL…";
  }

  const exitosos = resultados?.filter((r) => r.ok).length ?? 0;
  const conFallas = resultados?.filter((r) => r.ok && (r.avisoKajabi || r.avisoSkool || r.avisoGhl)).length ?? 0;
  const yaExistian = resultados?.filter((r) => r.yaExistia).length ?? 0;
  const fallidos = resultados?.filter((r) => !r.ok && !r.yaExistia).length ?? 0;
  const resultadosFiltrados =
    resultados?.filter((r) => {
      if (filtroResultados === "todos") return true;
      if (filtroResultados === "exitosos") return r.ok;
      if (filtroResultados === "avisos") return r.ok && !!(r.avisoKajabi || r.avisoSkool || r.avisoGhl);
      if (filtroResultados === "ya_existian") return !!r.yaExistia;
      return !r.ok && !r.yaExistia; // errores
    }) ?? [];
  // Derivado en vez de un estado propio: siempre refleja la realidad, tanto
  // para la tanda inicial como para reintentos individuales sueltos.
  const esperandoWa = resultados?.some((r) => r.estadoWhatsApp === "confirmando") ?? false;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-foreground/30 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && !procesando && onClose()}
    >
      <div className="shell w-full max-w-3xl rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Importar clientes desde CSV</h2>
            {!procesando && (
              <button
                onClick={onClose}
                className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
              >
                <X className="h-4.5 w-4.5" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {!resultados && (
            <>
              <div className="mb-4 flex items-center justify-between rounded-xl border border-silver bg-surface-2 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">¿No sabes el formato?</p>
                  <p className="text-xs text-muted">Descarga la plantilla con las columnas exactas.</p>
                </div>
                <button
                  onClick={descargarPlantilla}
                  className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Descargar plantilla
                </button>
              </div>

              <label className="ease-spring flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-silver px-6 py-8 text-center transition hover:border-primary/50 hover:bg-surface-2">
                <Upload className="h-6 w-6 text-muted" strokeWidth={1.5} />
                <span className="text-sm font-medium text-foreground">
                  {nombreArchivo || "Elegir archivo CSV"}
                </span>
                <span className="text-xs text-muted">
                  {filas ? `${filas.length} filas detectadas` : "Nombre completo y Correo son obligatorios"}
                </span>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onArchivo}
                  className="hidden"
                />
              </label>

              {errorArchivo && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-danger">
                  <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {errorArchivo}
                </p>
              )}

              {filas && filas.length > 0 && !procesando && (
                <>
                  <div className="mt-4 max-h-56 overflow-y-auto rounded-xl border border-silver">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-2">Nombre</th>
                          <th className="px-3 py-2">Correo</th>
                          <th className="px-3 py-2">País</th>
                          <th className="px-3 py-2">Teléfono</th>
                          <th className="px-3 py-2">Membresía</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((f, i) => (
                          <tr key={i} className="border-t border-silver/60">
                            <td className="px-3 py-2 text-foreground">{f.nombre || "—"}</td>
                            <td className="px-3 py-2 text-muted">{f.email || "—"}</td>
                            <td className="px-3 py-2 text-muted">{f.pais || "—"}</td>
                            <td className="px-3 py-2 text-muted">{f.telefono || "—"}</td>
                            <td className="px-3 py-2 text-muted">{f.tipoMembresia || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Campo label="Evento (se aplica a todos)">
                      <ComboboxBuscador
                        opciones={eventos}
                        valor={eventoGlobal}
                        onChange={setEventoGlobal}
                        placeholder="Seleccionar evento…"
                        etiquetaVacio="— Ninguno —"
                      />
                    </Campo>
                    <Campo label="Etiqueta (se aplica a todos)">
                      <ComboboxBuscador
                        opciones={etiquetas}
                        valor={etiquetaGlobal}
                        onChange={setEtiquetaGlobal}
                        placeholder="Seleccionar…"
                        etiquetaVacio="— Ninguna —"
                      />
                    </Campo>
                  </div>
                </>
              )}

              {procesando && (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
                    <span>Procesando… no cierres esta ventana</span>
                    <span>
                      {progreso} / {filas?.length ?? 0}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full brand-plate transition-all"
                      style={{ width: `${filas?.length ? (progreso / filas.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}

              <button
                onClick={importar}
                disabled={!filas || filas.length === 0 || procesando}
                className="ease-spring mt-5 w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
              >
                {procesando
                  ? "Importando…"
                  : filas
                    ? `Importar ${filas.length} cliente${filas.length === 1 ? "" : "s"}`
                    : "Importar"}
              </button>
            </>
          )}

          {resultados && (
            <>
              <div className="mb-4 grid grid-cols-4 gap-2">
                <div className="rounded-xl border border-success/30 bg-success/10 p-3 text-center">
                  <p className="text-lg font-semibold text-success">{exitosos}</p>
                  <p className="text-xs text-muted">Creados</p>
                </div>
                <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-center">
                  <p className="text-lg font-semibold text-warning">{conFallas}</p>
                  <p className="text-xs text-muted">Con avisos (revisar)</p>
                </div>
                <div
                  className="rounded-xl border border-silver bg-surface-2 p-3 text-center"
                  title="No se les volvió a dar la oferta ni se les reinvitó — ya estaban en el CRM antes de este CSV."
                >
                  <p className="text-lg font-semibold text-foreground">{yaExistian}</p>
                  <p className="text-xs text-muted">Ya en el CRM</p>
                </div>
                <div className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-center">
                  <p className="text-lg font-semibold text-danger">{fallidos}</p>
                  <p className="text-xs text-muted">No creados</p>
                </div>
              </div>

              <div className="mb-3 flex items-center gap-1.5">
                {(["todos", "exitosos", "avisos", "ya_existian", "errores"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFiltroResultados(f)}
                    className={`ease-spring rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      filtroResultados === f
                        ? "brand-plate text-white"
                        : "border border-silver bg-surface text-foreground hover:bg-surface-2"
                    }`}
                  >
                    {LABEL_FILTRO[f]}
                  </button>
                ))}
              </div>

              {esperandoWa && (
                <p className="mb-3 flex items-center gap-1.5 text-xs text-muted">
                  <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" strokeWidth={1.75} />
                  Esperando que GHL confirme el envío del WhatsApp de bienvenida (puede tardar hasta ~90 segundos por cliente)…
                </p>
              )}

              <div className="max-h-80 overflow-y-auto rounded-xl border border-silver">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">CRM</th>
                      <th className="px-3 py-2">Motivo (si no se dio la oferta)</th>
                      <th className="px-3 py-2">Skool</th>
                      <th className="px-3 py-2">WhatsApp (GHL)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosFiltrados.map((r, i) => (
                      <tr key={i} className="border-t border-silver/60">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{r.fila.nombre || "—"}</p>
                          <p className="text-muted">{r.fila.email}</p>
                        </td>
                        <td className="px-3 py-2">
                          {r.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />
                          ) : r.yaExistia ? (
                            <span
                              className="flex items-center gap-1 text-muted"
                              title="Ya existía en el CRM antes de este CSV — no se le volvió a dar la oferta en Kajabi ni se le reinvitó."
                            >
                              <AlertTriangle className="h-4 w-4 flex-none" strokeWidth={1.75} />
                              Ya existe en el CRM
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-danger">
                              <XCircle className="h-4 w-4 flex-none" strokeWidth={1.75} />
                              {r.error}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <EstadoAviso ok={r.ok} aviso={r.avisoKajabi} />
                        </td>
                        <td className="px-3 py-2">
                          {!r.ok ? (
                            <span className="text-muted">—</span>
                          ) : correoInvalidoEnKajabi(r) ? (
                            <span
                              className="text-warning"
                              title="Kajabi ya dijo que este correo es inválido — la invitación de Skool no sirve de nada hasta que se corrija."
                            >
                              Esperando correo correcto
                            </span>
                          ) : (
                            <EstadoAviso
                              ok={r.ok}
                              aviso={r.avisoSkool}
                              textoOk="Solicitada"
                              tituloOk="Skool confirmó que recibió la solicitud (HTTP 200) — no confirma que el correo exista ni que la invitación se haya entregado."
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {!r.ok ? (
                            <span className="text-muted">—</span>
                          ) : r.avisoGhl ? (
                            <EstadoAviso ok={r.ok} aviso={r.avisoGhl} />
                          ) : !r.tieneTelefono ? (
                            <span className="text-muted">— sin teléfono</span>
                          ) : r.estadoWhatsApp === "enviado" ? (
                            <span className="flex items-center gap-1 text-success">
                              <CheckCircle2 className="h-4 w-4 flex-none" strokeWidth={1.75} />
                              Enviado
                            </span>
                          ) : r.estadoWhatsApp === "fallido" ? (
                            <span className="flex items-center gap-1 text-danger">
                              <XCircle className="h-4 w-4 flex-none" strokeWidth={1.75} />
                              No se pudo entregar
                            </span>
                          ) : r.estadoWhatsApp === "sin_confirmacion" ? (
                            <span className="flex items-center gap-2">
                              <span
                                className="text-muted"
                                title="GHL no confirmó a tiempo (más de ~90s) — puede que el Workflow todavía esté corriendo."
                              >
                                Sin confirmación aún
                              </span>
                              <button
                                onClick={() => reintentarConfirmacionWa(r.clienteId as string)}
                                title="Volver a esperar la confirmación de GHL"
                                className="ease-spring flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition hover:bg-primary/20"
                              >
                                <RefreshCw className="h-3 w-3" strokeWidth={2} />
                                Reintentar
                              </button>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted">
                              <Loader2 className="h-3.5 w-3.5 flex-none animate-spin" strokeWidth={1.75} />
                              Esperando confirmación…
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  onClick={exportarResultados}
                  disabled={resultadosFiltrados.length === 0}
                  className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Exportar {LABEL_FILTRO[filtroResultados].toLowerCase()} ({resultadosFiltrados.length})
                </button>
                <button
                  onClick={onClose}
                  className="ease-spring ml-auto rounded-xl brand-plate px-4 py-2 text-sm font-medium text-white transition"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EstadoAviso({
  ok,
  aviso,
  textoOk,
  tituloOk,
}: {
  ok: boolean;
  aviso?: string | null;
  textoOk?: string;
  tituloOk?: string;
}) {
  if (!ok) return <span className="text-muted">—</span>;
  if (!aviso) {
    if (!textoOk) return <CheckCircle2 className="h-4 w-4 text-success" strokeWidth={1.75} />;
    return (
      <span className="flex items-center gap-1 text-success" title={tituloOk}>
        <CheckCircle2 className="h-4 w-4 flex-none" strokeWidth={1.75} />
        {textoOk}
      </span>
    );
  }
  return (
    <span className="flex items-start gap-1 text-warning" title={aviso}>
      <AlertTriangle className="h-4 w-4 flex-none" strokeWidth={1.75} />
      <span className="line-clamp-2">{aviso}</span>
    </span>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
