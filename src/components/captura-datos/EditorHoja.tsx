"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, Sparkles, Undo2 } from "lucide-react";
import { AvisoTemporal } from "./AvisoTemporal";
import { VisorHoja } from "./VisorHoja";
import { api, ErrorApi } from "@/lib/captura-datos/cliente";
import { telefonoConsultable, conciliar, valorDeAxis, type CampoComparable, type EstadoCampo, type ResultadoAxis } from "@/lib/captura-datos/conciliacion";
import { urlDuplicado, type Duplicado } from "@/lib/captura-datos/enlaces";
import {
  EMPTY_FIELDS, LADAS, MEMBRESIAS, METODOS_PAGO, MARCAS_TARJETA, formatCantidadInput, llevaPago, membresiaPorCantidad, normalizeFields,
  requiereTarjeta, sanitizeInput, validateFields,
  type Box, type FieldKey, type SheetFields,
} from "@/lib/captura-datos/fields";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

const AUTOGUARDADO_MS = 1500;
const AVISO_BLOQUEO_MS = 8 * 60 * 1000; // el bloqueo dura 10 min y se renueva con cada guardado
const CLASE_INPUT = "w-full rounded-lg border border-silver bg-surface px-2.5 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2";
// Nombre y correo se pintan según coincidan o no con Axis; sin dato de Axis (o sin comparar) quedan neutros.
const COLOR_AXIS: Record<EstadoCampo, string> = { ok: "border-success bg-success/10", distinto: "border-danger bg-danger/10", sin_dato: "border-silver bg-surface" };
const claseAxis = (estado?: EstadoCampo) => CLASE_INPUT.replace("border-silver bg-surface", COLOR_AXIS[estado ?? "sin_dato"]);

type Guardado = "guardado" | "pendiente" | "guardando" | "error";

export function EditorHoja({ hoja: inicial, onTerminar }: { hoja: HojaCaptura; onTerminar: () => void }) {
  const [campos, setCampos] = useState<SheetFields>({ ...EMPTY_FIELDS, ...(inicial.campos ?? {}) });
  const [guardado, setGuardado] = useState<Guardado>("guardado");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [duplicado, setDuplicado] = useState<{ mensaje: string; datos: Duplicado | null } | null>(null);
  const [axis, setAxis] = useState<ResultadoAxis | null>(null);
  const [intentoConfirmar, setIntentoConfirmar] = useState(false);
  const [lockPorVencer, setLockPorVencer] = useState(false);
  const [bloqueada, setBloqueada] = useState(false); // 409: la hoja cambió o la tomó otra persona
  const [voucherBox, setVoucherBox] = useState<Box | null>(inicial.voucherBox ?? null);
  const cola = useRef<Promise<boolean>>(Promise.resolve(true)); // un guardado a la vez, en orden
  const bloqueadaRef = useRef(false);
  const versionRef = useRef(inicial.version);
  const camposRef = useRef(campos); // siempre lo último escrito (el estado va un render atrasado)
  const ultimoGuardado = useRef(Date.now());
  const voucherBoxRef = useRef<Box | null>(inicial.voucherBox ?? null);
  const sucio = useRef(false);
  const avisoBloqueoDescartado = useRef(false); // si lo cerró, no vuelve hasta el siguiente guardado
  // Una membresía elegida a mano no se pisa al cambiar la cantidad; solo se deduce sola mientras nadie la haya tocado.
  const membresiaManual = useRef(!!inicial.campos?.membresia && inicial.campos.membresia !== membresiaPorCantidad(inicial.campos.cantidad ?? ""));
  const trabajando = leyendo || confirmando || saliendo;

  const urlFoto = `/api/captura-datos/hojas/${inicial.id}/foto`;
  const esPdf = inicial.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(inicial.origen.nombreOriginal);
  const errores = validateFields(normalizeFields(campos, inicial.estatus), inicial.estatus);

  const ejecutarGuardado = useCallback(async (): Promise<boolean> => {
    if (bloqueadaRef.current) return false;
    if (!sucio.current) return true;
    sucio.current = false;
    setGuardado("guardando");
    try {
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}`, {
        method: "PATCH", json: { campos: camposRef.current, voucherBox: voucherBoxRef.current, version: versionRef.current },
      });
      versionRef.current = r.hoja.version;
      ultimoGuardado.current = Date.now();
      avisoBloqueoDescartado.current = false;
      setLockPorVencer(false);
      setGuardado(sucio.current ? "pendiente" : "guardado");
      return true;
    } catch (err) {
      sucio.current = true;
      setGuardado("error");
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      if (err instanceof ErrorApi && err.status === 409) {
        bloqueadaRef.current = true;
        setBloqueada(true);
      }
      return false;
    }
  }, [inicial.id]);

  /** Guarda lo pendiente encolando los PATCH (nunca dos a la vez); devuelve false si no se pudo guardar. */
  const guardar = useCallback((): Promise<boolean> => {
    cola.current = cola.current.then(ejecutarGuardado, ejecutarGuardado);
    return cola.current;
  }, [ejecutarGuardado]);

  async function recargar() {
    try {
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}`);
      const nuevos = { ...EMPTY_FIELDS, ...(r.hoja.campos ?? {}) };
      camposRef.current = nuevos;
      setCampos(nuevos);
      voucherBoxRef.current = r.hoja.voucherBox ?? null;
      setVoucherBox(voucherBoxRef.current);
      versionRef.current = r.hoja.version;
      sucio.current = false;
      bloqueadaRef.current = false;
      setBloqueada(false);
      setError(null);
      setGuardado("guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo recargar la hoja.");
    }
  }

  // Autoguardado con debounce.
  useEffect(() => {
    if (!sucio.current || bloqueada) return;
    const t = setTimeout(guardar, AUTOGUARDADO_MS);
    return () => clearTimeout(t);
  }, [campos, voucherBox, guardar, bloqueada]);

  // Aviso si pasa mucho tiempo sin guardar (el bloqueo de 10 min está por vencer).
  useEffect(() => {
    const t = setInterval(() => setLockPorVencer(!avisoBloqueoDescartado.current && Date.now() - ultimoGuardado.current > AVISO_BLOQUEO_MS), 30_000);
    return () => clearInterval(t);
  }, []);

  // Consulta a Axis cuando el teléfono está completo.
  const telefono = telefonoConsultable(campos);
  useEffect(() => {
    setAxis(null); // no mostrar el resultado del teléfono anterior mientras llega el nuevo
    if (!telefono) return;
    let vigente = true;
    api<ResultadoAxis>("/api/captura-datos/axis", { json: { telefono } })
      .then((r) => vigente && setAxis(r))
      .catch(() => vigente && setAxis({ estado: "no_disponible" }));
    return () => { vigente = false; };
  }, [telefono]);

  function aplicar(parcial: Partial<SheetFields>) {
    sucio.current = true;
    camposRef.current = { ...camposRef.current, ...parcial };
    setGuardado("pendiente");
    setCampos(camposRef.current);
  }

  function cambiar<K extends FieldKey>(k: K, valor: SheetFields[K]) {
    if (k === "membresia") membresiaManual.current = true;
    aplicar({ [k]: valor });
  }

  function cambiarVoucherBox(caja: Box | null) {
    sucio.current = true;
    voucherBoxRef.current = caja;
    setGuardado("pendiente");
    setVoucherBox(caja);
  }

  function cambiarCantidad(valor: string) {
    const plan = inicial.estatus === "Completo" && !membresiaManual.current ? membresiaPorCantidad(valor) : "";
    aplicar(plan ? { cantidad: valor, membresia: plan } : { cantidad: valor });
  }

  async function leerConIa() {
    setLeyendo(true);
    setError(null);
    try {
      if (!(await guardar())) return;
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}/extract`, { method: "POST" });
      const leidos = { ...EMPTY_FIELDS, ...(r.hoja.campos ?? {}) };
      if (inicial.estatus === "Completo" && !leidos.membresia) leidos.membresia = membresiaPorCantidad(leidos.cantidad);
      camposRef.current = leidos;
      setCampos(leidos);
      voucherBoxRef.current = r.hoja.voucherBox ?? null;
      setVoucherBox(voucherBoxRef.current);
      versionRef.current = r.hoja.version;
      sucio.current = false;
      setGuardado("guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la hoja.");
      if (err instanceof ErrorApi && err.status === 422) onTerminar(); // no es una hoja de registro: ya quedó marcada
      else if (err instanceof ErrorApi && err.status === 409) { bloqueadaRef.current = true; setBloqueada(true); }
    } finally {
      setLeyendo(false);
    }
  }

  async function confirmar(forzar = false) {
    setIntentoConfirmar(true);
    if (Object.keys(errores).length > 0) return;
    setConfirmando(true);
    setError(null);
    try {
      if (!(await guardar())) return;
      await api(`/api/captura-datos/hojas/${inicial.id}${forzar ? "?force=1" : ""}`, {
        method: "PATCH", json: { campos: normalizeFields(camposRef.current, inicial.estatus), voucherBox: voucherBoxRef.current, confirmar: true, version: versionRef.current },
      });
      onTerminar();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409 && err.datos.duplicado) {
        setDuplicado({ mensaje: err.message, datos: err.datos.duplicado as unknown as Duplicado });
      } else {
        setError(err instanceof Error ? err.message : "No se pudo confirmar.");
      }
    } finally {
      setConfirmando(false);
    }
  }

  async function liberar() {
    setSaliendo(true);
    if (!(await guardar())) {
      setSaliendo(false); // no se pudo guardar: no se sale ni se suelta la hoja perdiendo lo escrito
      return;
    }
    await api(`/api/captura-datos/hojas/${inicial.id}/liberar`, { method: "POST" }).catch(() => {});
    onTerminar();
  }

  const campo = (k: FieldKey) => (intentoConfirmar ? errores[k] : undefined);
  const enlaceDuplicado = duplicado?.datos ? urlDuplicado(duplicado.datos) : null;
  const conciliacion = axis?.estado === "encontrado" ? conciliar(campos, axis.contacto) : null;

  /** "Usar dato de Axis": solo cuando el campo no coincide y Axis sí trae un dato. */
  function botonAxis(k: CampoComparable) {
    if (axis?.estado !== "encontrado" || conciliacion?.[k] !== "distinto") return undefined;
    const valor = valorDeAxis(axis.contacto, k);
    return (
      <button type="button" onClick={() => cambiar(k, valor)} className="inline-flex items-center gap-1 text-xs text-primary underline">
        <ArrowLeftRight className="h-3 w-3" /> Usar dato de Axis: {valor}
      </button>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="h-[60vh] lg:sticky lg:top-2 lg:h-[calc(100vh-6rem)]">
        <VisorHoja url={urlFoto} esPdf={esPdf} voucherBox={voucherBox} onVoucherBox={cambiarVoucherBox} />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{inicial.estatus} · {inicial.origen.nombreOriginal}</span>
          <span role="status" aria-live="polite" className="shrink-0">{{ guardado: "Guardado", pendiente: "Cambios sin guardar…", guardando: "Guardando…", error: "Error al guardar" }[guardado]}</span>
        </div>

        {lockPorVencer && <AvisoTemporal onCerrar={() => { avisoBloqueoDescartado.current = true; setLockPorVencer(false); }}>Llevas varios minutos sin guardar: la hoja podría liberarse para otra persona. Haz un cambio o confirma.</AvisoTemporal>}
        {error && <AvisoTemporal key={error} peligro onCerrar={() => setError(null)}>{error}</AvisoTemporal>}
        {bloqueada && (
          <div className="flex gap-2">
            <button onClick={recargar} className="rounded-lg border border-silver px-3 py-1.5 text-sm">Recargar hoja</button>
            <button onClick={onTerminar} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-silver/40">Salir sin guardar</button>
          </div>
        )}

        <button onClick={leerConIa} disabled={trabajando} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-1.5 text-sm text-primary disabled:opacity-50">
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Leer con IA
        </button>

        <fieldset disabled={trabajando || bloqueada} className="min-w-0 space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
            <Campo etiqueta="Folio" error={campo("folio")}><input value={campos.folio} onChange={(e) => cambiar("folio", e.target.value)} inputMode="numeric" className={CLASE_INPUT} /></Campo>
            <Campo etiqueta="Teléfono" error={campo("telefono") ?? campo("lada")}>
              <div className="flex gap-1">
                <select aria-label="Lada" value={campos.lada} onChange={(e) => cambiar("lada", e.target.value as SheetFields["lada"])} className="rounded-lg border border-silver bg-surface px-1 text-sm">
                  {LADAS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input aria-label="Teléfono (10 dígitos)" value={campos.telefono} onChange={(e) => cambiar("telefono", e.target.value.replace(/\D/g, ""))} inputMode="tel" className={CLASE_INPUT} />
              </div>
            </Campo>
          </div>

          <div className="space-y-2.5">
            <Campo etiqueta="Nombre" error={campo("nombre")} aviso={conciliacion?.nombre === "distinto" ? "No coincide con Axis" : undefined} accion={botonAxis("nombre")}>
              <input value={campos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} className={claseAxis(conciliacion?.nombre)} />
            </Campo>
            <Campo etiqueta="Correo" error={campo("correo")} aviso={conciliacion?.correo === "distinto" ? "No coincide con Axis" : undefined} accion={botonAxis("correo")}>
              <input value={campos.correo} onChange={(e) => cambiar("correo", e.target.value)} type="email" className={claseAxis(conciliacion?.correo)} />
            </Campo>
          </div>
          {axis?.estado === "encontrado" && (
            <p className="text-xs text-muted">Axis: {axis.contacto.nombre || "—"} · {axis.contacto.correo || "—"}{axis.coincidencias > 1 ? ` (${axis.coincidencias} coincidencias)` : ""}</p>
          )}
          {axis?.estado === "no_encontrado" && <Aviso>Este teléfono no se encontró en Axis.</Aviso>}

          {llevaPago(inicial.estatus) && (
            <>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,0.8fr)]">
                <Campo etiqueta="Método de pago" error={campo("metodoPago")}>
                  <select value={campos.metodoPago} onChange={(e) => cambiar("metodoPago", e.target.value)} className={CLASE_INPUT}>
                    <option value="">Elige…</option>
                    {METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Cantidad pagada" error={campo("cantidad")}><input value={formatCantidadInput(campos.cantidad)} onChange={(e) => cambiarCantidad(sanitizeInput("cantidad", e.target.value))} inputMode="decimal" placeholder="$0.00" className={CLASE_INPUT} /></Campo>
                <Campo etiqueta={inicial.estatus === "Completo" ? "Membresía" : "Membresía (opcional)"} error={campo("membresia")}>
                  <select value={campos.membresia} onChange={(e) => cambiar("membresia", e.target.value)} className={CLASE_INPUT}>
                    <option value="">Elige…</option>
                    {MEMBRESIAS.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}
                  </select>
                </Campo>
              </div>
              {requiereTarjeta(campos.metodoPago) && (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Campo etiqueta="Marca">
                    <select value={campos.marcaTarjeta} onChange={(e) => cambiar("marcaTarjeta", e.target.value)} className={CLASE_INPUT}>
                      <option value="">—</option>
                      {MARCAS_TARJETA.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Campo>
                  <Campo etiqueta="Últimos 4 dígitos" error={campo("tarjeta")}><input value={campos.tarjeta} onChange={(e) => cambiar("tarjeta", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className={CLASE_INPUT} /></Campo>
                </div>
              )}
            </>
          )}
          <Campo etiqueta="Notas" error={campo("notas")}><textarea value={campos.notas} onChange={(e) => cambiar("notas", e.target.value)} rows={4} className={`${CLASE_INPUT} resize-y`} /></Campo>
        </fieldset>

        {duplicado && (
          <Aviso peligro>
            {duplicado.mensaje}.{" "}
            {enlaceDuplicado && <a href={enlaceDuplicado.url} target="_blank" rel="noreferrer" className="underline">{enlaceDuplicado.texto}</a>}
            <button onClick={() => confirmar(true)} className="ml-2 underline">Confirmar de todos modos</button>
          </Aviso>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <button onClick={liberar} disabled={trabajando} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-silver/40"><Undo2 className="h-4 w-4" /> Guardar y salir</button>
          <button onClick={() => confirmar()} disabled={trabajando} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar hoja
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, error, aviso, accion, children }: { etiqueta: string; error?: string; aviso?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block space-y-1 text-sm">
        <span className="text-muted">{etiqueta}</span>
        {children}
        {error && <span className="block text-xs text-danger">{error}</span>}
        {!error && aviso && <span className="block text-xs text-amber-600">{aviso}</span>}
      </label>
      {accion}
    </div>
  );
}

function Aviso({ peligro, children }: { peligro?: boolean; children: React.ReactNode }) {
  return (
    <p role={peligro ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${peligro ? "border-danger/30 bg-danger/10 text-danger" : "border-amber-500/30 bg-amber-500/10 text-amber-700"}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}
