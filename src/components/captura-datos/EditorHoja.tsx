"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, Sparkles, Undo2 } from "lucide-react";
import { AvisoTemporal } from "./AvisoTemporal";
import { Modal } from "./Modal";
import { InsigniaEstatus } from "./InsigniaEstatus";
import { TiraHojas } from "./TiraHojas";
import { VisorHoja } from "./VisorHoja";
import { api, ErrorApi } from "@/lib/captura-datos/cliente";
import { telefonoConsultable, conciliar, valorDeAxis, type CampoComparable, type EstadoCampo, type ResultadoAxis } from "@/lib/captura-datos/conciliacion";
import { urlDuplicado, type Duplicado } from "@/lib/captura-datos/enlaces";
import {
  EMPTY_FIELDS, LADAS, NOTAS_MAX, MEMBRESIAS, METODOS_PAGO, MARCAS_TARJETA, conNotaAMeses, formatCantidadInput, llevaPago, membresiaPorCantidad, normalizeFields,
  requiereTarjeta, sanitizeInput, sinNotaAMeses, validateFields,
  type Box, type FieldKey, type SheetFields,
} from "@/lib/captura-datos/fields";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

const AUTOGUARDADO_MS = 1500;
const AVISO_BLOQUEO_MS = 8 * 60 * 1000; // el bloqueo dura 10 min y se renueva con cada guardado
const CLASE_INPUT = "w-full rounded-lg border border-silver bg-surface px-2.5 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2";
// Nombre y correo se pintan según coincidan o no con Axis; sin dato de Axis (o sin comparar) quedan neutros.
const COLOR_AXIS: Record<EstadoCampo, string> = { ok: "border-success bg-success/10", distinto: "border-danger bg-danger/10", sin_dato: "border-silver bg-surface" };
const claseAxis = (estado?: EstadoCampo) => CLASE_INPUT.replace("border-silver bg-surface", COLOR_AXIS[estado ?? "sin_dato"]);

const CAMPOS_COMPARABLES_ETIQUETA: { k: CampoComparable; texto: string }[] = [{ k: "nombre", texto: "Usar nombre de Axis" }, { k: "correo", texto: "Usar correo de Axis" }];

type Guardado = "guardado" | "pendiente" | "guardando" | "error";

export function EditorHoja({ hoja: inicial, hojas, onTerminar, onSiguiente, onIr }: { hoja: HojaCaptura; hojas: HojaCaptura[]; onTerminar: () => void; onSiguiente: () => void | Promise<void>; onIr: (id: string) => void | Promise<void> }) {
  const [campos, setCampos] = useState<SheetFields>({ ...EMPTY_FIELDS, ...(inicial.campos ?? {}) });
  const [guardado, setGuardado] = useState<Guardado>("guardado");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [leidaIa, setLeidaIa] = useState(!!inicial.origen.leidaIa); // la IA solo lee una vez cada hoja
  const [confirmando, setConfirmando] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [cambiando, setCambiando] = useState(false); // saltando a otra hoja desde la tira
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
  // Una hoja ya confirmada (evento reabierto) no se autoguarda: los cambios solo se aplican al confirmar de nuevo.
  const reedicion = inicial.estado === "confirmada";
  const trabajando = leyendo || confirmando || saliendo;

  const urlFoto = `/api/captura-datos/hojas/${inicial.id}/foto`;
  const esPdf = inicial.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(inicial.origen.nombreOriginal);
  const errores = validateFields(normalizeFields(campos, inicial.estatus), inicial.estatus);

  const ejecutarGuardado = useCallback(async (): Promise<boolean> => {
    if (bloqueadaRef.current) return false;
    if (reedicion || !sucio.current) return true;
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
  }, [inicial.id, reedicion]);

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
    const plan = !membresiaManual.current ? membresiaPorCantidad(valor) : "";
    // La nota "Pago a meses" aparece (o se va) en Notas mientras se revisa la hoja, no hasta subirla a Drive.
    const notas = conNotaAMeses({ cantidad: valor, notas: sinNotaAMeses(camposRef.current.notas) }).slice(0, NOTAS_MAX);
    aplicar(plan ? { cantidad: valor, membresia: plan, notas } : { cantidad: valor, notas });
  }

  async function leerConIa() {
    if (leidaIa) return;
    setLeyendo(true);
    setError(null);
    try {
      if (!(await guardar())) return;
      setLeidaIa(true); // se bloquea de inmediato: el servidor ya cobra la lectura aunque se salgan
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}/extract`, { method: "POST" });
      const leidos = { ...EMPTY_FIELDS, ...(r.hoja.campos ?? {}) };
      if (!leidos.membresia) leidos.membresia = membresiaPorCantidad(leidos.cantidad);
      camposRef.current = leidos;
      setCampos(leidos);
      voucherBoxRef.current = r.hoja.voucherBox ?? null;
      setVoucherBox(voucherBoxRef.current);
      versionRef.current = r.hoja.version;
      sucio.current = false;
      setGuardado("guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la hoja.");
      if (err instanceof ErrorApi && err.status === 409 && !bloqueadaRef.current) setLeidaIa(true); // ya estaba leída o la tiene otra persona
      else if (!(err instanceof ErrorApi && err.status === 422)) setLeidaIa(!!inicial.origen.leidaIa); // la IA no contestó: se puede reintentar
      if (err instanceof ErrorApi && err.status === 422) await onSiguiente(); // no es una hoja de registro: ya quedó marcada
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
      await onSiguiente(); // se queda en esta hoja (con el aviso de trabajando) hasta que llegue la siguiente
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

  /** Salta a otra hoja de la tira: guarda y suelta la actual antes. */
  async function irA(id: string) {
    if (trabajando) return;
    setSaliendo(true);
    setCambiando(true);
    if (!(await guardar())) {
      setSaliendo(false);
      setCambiando(false);
      return;
    }
    await api(`/api/captura-datos/hojas/${inicial.id}/liberar`, { method: "POST" }).catch(() => {});
    await onIr(id);
    setSaliendo(false); // si la otra hoja no se pudo abrir, el editor sigue usable
    setCambiando(false);
  }

  const obligatorio = llevaPago(inicial.estatus);
  const campo = (k: FieldKey) => (intentoConfirmar ? errores[k] : undefined);
  const enlaceDuplicado = duplicado?.datos ? urlDuplicado(duplicado.datos) : null;
  const conciliacion = axis?.estado === "encontrado" ? conciliar(campos, axis.contacto) : null;

  const hayDiferencia = (k: CampoComparable) => axis?.estado === "encontrado" && conciliacion?.[k] === "distinto" && !!valorDeAxis(axis.contacto, k);

  /** Reemplaza un campo (nombre o correo) por el que trae Axis. */
  function usarDatoAxis(k: CampoComparable) {
    if (axis?.estado !== "encontrado") return;
    const valor = valorDeAxis(axis.contacto, k);
    if (valor) aplicar({ [k]: valor });
  }

  return (
    <div className="-mt-4 grid gap-3 md:-mt-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {cambiando && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-50 flex items-center justify-center gap-2 bg-white/70 text-sm text-muted">
          <Loader2 className="h-6 w-6 animate-spin text-primary" /> Cargando hoja…
        </div>
      )}
      <div className="flex h-[60vh] flex-col gap-2 lg:sticky lg:top-2 lg:h-[calc(100vh-3rem)]">
        <div className="min-h-0 flex-1">
          <VisorHoja url={urlFoto} esPdf={esPdf} voucherBox={voucherBox} onVoucherBox={cambiarVoucherBox} />
        </div>
        <TiraHojas hojas={hojas} actualId={inicial.id} onElegir={irA} />
      </div>

      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span className="flex min-w-0 items-center gap-2"><InsigniaEstatus estatus={inicial.estatus} /><span className="truncate">{inicial.origen.nombreOriginal}</span></span>
          <span role="status" aria-live="polite" className="shrink-0">{reedicion ? "Editando hoja confirmada" : { guardado: "Guardado", pendiente: "Cambios sin guardar…", guardando: "Guardando…", error: "Error al guardar" }[guardado]}</span>
        </div>

        {lockPorVencer && <AvisoTemporal onCerrar={() => { avisoBloqueoDescartado.current = true; setLockPorVencer(false); }}>Llevas varios minutos sin guardar: la hoja podría liberarse para otra persona. Haz un cambio o confirma.</AvisoTemporal>}
        {error && <AvisoTemporal key={error} peligro onCerrar={() => setError(null)}>{error}</AvisoTemporal>}
        {bloqueada && (
          <div className="flex gap-2">
            <button onClick={recargar} className="rounded-lg border border-silver px-3 py-1.5 text-sm">Recargar hoja</button>
            <button onClick={onTerminar} className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-silver/40">Salir sin guardar</button>
          </div>
        )}

        <button onClick={leerConIa} disabled={trabajando || reedicion || leidaIa} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-primary px-3 py-1.5 text-sm text-primary transition hover:bg-primary hover:text-white disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-primary">
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {leyendo ? "Leyendo con IA…" : leidaIa ? "Hoja ya leída con IA" : "Leer con IA"}
        </button>

        <fieldset disabled={trabajando || bloqueada} className="min-w-0 space-y-2.5">
          <div className="grid gap-2.5 sm:grid-cols-[6.5rem_minmax(0,1fr)]">
            <Campo etiqueta="Folio" requerido error={campo("folio")}><input value={campos.folio} onChange={(e) => cambiar("folio", sanitizeInput("folio", e.target.value))} maxLength={8} inputMode="numeric" className={CLASE_INPUT} /></Campo>
            <Campo etiqueta="Teléfono" requerido error={campo("telefono") ?? campo("lada")}>
              <div className="flex gap-1">
                <select aria-label="Lada" value={campos.lada} onChange={(e) => cambiar("lada", e.target.value as SheetFields["lada"])} className="rounded-lg border border-silver bg-surface px-1 text-sm">
                  {LADAS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
                <input aria-label="Teléfono (10 dígitos)" value={campos.telefono} onChange={(e) => cambiar("telefono", sanitizeInput("telefono", e.target.value))} maxLength={10} inputMode="tel" className={CLASE_INPUT} />
              </div>
            </Campo>
          </div>

          <div className="space-y-2.5">
            <Campo etiqueta="Nombre" requerido error={campo("nombre")}>
              <input value={campos.nombre} onChange={(e) => cambiar("nombre", sanitizeInput("nombre", e.target.value))} maxLength={80} className={claseAxis(conciliacion?.nombre)} />
            </Campo>
            <Campo etiqueta="Correo" requerido error={campo("correo")}>
              <input value={campos.correo} onChange={(e) => cambiar("correo", sanitizeInput("correo", e.target.value))} maxLength={80} type="email" className={claseAxis(conciliacion?.correo)} />
            </Campo>
          </div>
          {/* Espacio fijo: que Axis conteste no mueve el resto del formulario. Los botones siempre se ven; solo se activan si hay diferencia. */}
          <div className="space-y-1.5">
            <p className="h-4 truncate text-xs text-muted">
              {axis?.estado === "encontrado" ? (
                <>Axis: {axis.contacto.nombre || "—"} · {axis.contacto.correo || "—"}{axis.coincidencias > 1 ? ` (${axis.coincidencias} coincidencias)` : ""}</>
              ) : axis?.estado === "no_encontrado" ? (
                <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="h-3 w-3" /> Sin coincidencias en Axis para este teléfono.</span>
              ) : axis?.estado === "no_disponible" ? (
                <span className="text-amber-700">Axis no está disponible por ahora.</span>
              ) : (
                "Axis: se consulta al completar el teléfono."
              )}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {CAMPOS_COMPARABLES_ETIQUETA.map(({ k, texto }) => (
                <button key={k} type="button" onClick={() => usarDatoAxis(k)} disabled={!hayDiferencia(k)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm transition hover:bg-primary hover:text-white disabled:cursor-default disabled:border-silver disabled:bg-transparent disabled:text-muted disabled:opacity-50 disabled:shadow-none disabled:hover:bg-transparent disabled:hover:text-muted">
                  <ArrowLeftRight className="h-3 w-3" /> {texto}
                </button>
              ))}
            </div>
          </div>

          {(
            <>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_7.5rem]">
                <Campo etiqueta="Método de pago" requerido={obligatorio} error={campo("metodoPago")}>
                  <select value={campos.metodoPago} onChange={(e) => cambiar("metodoPago", e.target.value)} className={CLASE_INPUT}>
                    <option value="">Elige…</option>
                    {METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Cantidad pagada" requerido={obligatorio} error={campo("cantidad")}><input value={formatCantidadInput(campos.cantidad)} onChange={(e) => cambiarCantidad(sanitizeInput("cantidad", e.target.value))} inputMode="decimal" placeholder="$0.00" className={CLASE_INPUT} /></Campo>
                <Campo etiqueta="Membresía" requerido={inicial.estatus === "Completo"} error={campo("membresia")}>
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
                  <Campo etiqueta="Últimos 4 dígitos" requerido={obligatorio} error={campo("tarjeta")}><input value={campos.tarjeta} onChange={(e) => cambiar("tarjeta", sanitizeInput("tarjeta", e.target.value))} maxLength={4} inputMode="numeric" className={CLASE_INPUT} /></Campo>
              </div>
              )}
            </>
          )}
          <Campo etiqueta="Notas" error={campo("notas")}><textarea value={campos.notas} onChange={(e) => cambiar("notas", sanitizeInput("notas", e.target.value))} maxLength={NOTAS_MAX} rows={3} className={`${CLASE_INPUT} resize-y`} /></Campo>
        </fieldset>

        {duplicado && (
          <Modal titulo="Este folio ya existe" onCerrar={() => setDuplicado(null)} bloqueado={confirmando}>
            <div className="space-y-4">
              <p className="text-sm text-foreground">
                {duplicado.mensaje}.{" "}
                {enlaceDuplicado && <a href={enlaceDuplicado.url} target="_blank" rel="noreferrer" className="text-primary underline">{enlaceDuplicado.texto}</a>}
              </p>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button onClick={() => setDuplicado(null)} disabled={confirmando} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40 disabled:opacity-50">Cancelar</button>
                <button onClick={() => { setDuplicado(null); void confirmar(true); }} disabled={confirmando} className="inline-flex items-center justify-center gap-2 rounded-lg bg-danger px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Confirmar de todos modos
                </button>
              </div>
            </div>
          </Modal>
        )}

        <div className="flex justify-between gap-2 pt-1">
          <button onClick={liberar} disabled={trabajando} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-silver/40"><Undo2 className="h-4 w-4" /> {reedicion ? "Cancelar" : "Guardar y salir"}</button>
          <button onClick={() => confirmar()} disabled={trabajando} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">
            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar hoja
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, requerido, error, children }: { etiqueta: string; requerido?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{etiqueta}{requerido && <span className="text-danger" aria-hidden="true"> *</span>}</span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
    </label>
  );
}
