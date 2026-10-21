"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { AlertTriangle, Check, Loader2, Sparkles, Undo2 } from "lucide-react";
import { api, ErrorApi } from "@/lib/captura-datos/cliente";
import { telefonoConsultable, conciliar, type ResultadoAxis } from "@/lib/captura-datos/conciliacion";
import { urlDuplicado, type Duplicado } from "@/lib/captura-datos/enlaces";
import {
  EMPTY_FIELDS, LADAS, MEMBRESIAS, METODOS_PAGO, MARCAS_TARJETA, llevaPago, normalizeFields, requiereTarjeta, validateFields,
  type FieldKey, type SheetFields,
} from "@/lib/captura-datos/fields";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

const AUTOGUARDADO_MS = 1500;
const AVISO_BLOQUEO_MS = 8 * 60 * 1000; // el bloqueo dura 10 min y se renueva con cada guardado
const CLASE_INPUT = "w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2";

type Guardado = "guardado" | "pendiente" | "guardando" | "error";

export function EditorHoja({ hoja: inicial, onTerminar }: { hoja: HojaCaptura; onTerminar: () => void }) {
  const [campos, setCampos] = useState<SheetFields>({ ...EMPTY_FIELDS, ...(inicial.campos ?? {}) });
  const [version, setVersion] = useState(inicial.version);
  const [guardado, setGuardado] = useState<Guardado>("guardado");
  const [error, setError] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [duplicado, setDuplicado] = useState<{ mensaje: string; datos: Duplicado | null } | null>(null);
  const [axis, setAxis] = useState<ResultadoAxis | null>(null);
  const [intentoConfirmar, setIntentoConfirmar] = useState(false);
  const [lockPorVencer, setLockPorVencer] = useState(false);
  const [bloqueada, setBloqueada] = useState(false); // 409: la hoja cambió o la tomó otra persona
  const enVuelo = useRef(false);
  const versionRef = useRef(version);
  const camposRef = useRef(campos);
  const ultimoGuardado = useRef(Date.now());
  const sucio = useRef(false);
  versionRef.current = version;
  camposRef.current = campos;

  const urlFoto = `/api/captura-datos/hojas/${inicial.id}/foto`;
  const esPdf = inicial.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(inicial.origen.nombreOriginal);
  const errores = validateFields(normalizeFields(campos, inicial.estatus), inicial.estatus);

  /** Guarda lo pendiente de a un PATCH a la vez; devuelve false si no se pudo guardar. */
  const guardar = useCallback(async (): Promise<boolean> => {
    while (enVuelo.current) await new Promise((r) => setTimeout(r, 100));
    if (!sucio.current) return true;
    enVuelo.current = true;
    sucio.current = false;
    setGuardado("guardando");
    try {
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}`, {
        method: "PATCH", json: { campos: camposRef.current, version: versionRef.current },
      });
      versionRef.current = r.hoja.version;
      setVersion(r.hoja.version);
      ultimoGuardado.current = Date.now();
      setLockPorVencer(false);
      setGuardado(sucio.current ? "pendiente" : "guardado");
      return true;
    } catch (err) {
      sucio.current = true;
      setGuardado("error");
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      if (err instanceof ErrorApi && err.status === 409) setBloqueada(true);
      return false;
    } finally {
      enVuelo.current = false;
    }
  }, [inicial.id]);

  async function recargar() {
    const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}`);
    setCampos({ ...EMPTY_FIELDS, ...(r.hoja.campos ?? {}) });
    versionRef.current = r.hoja.version;
    setVersion(r.hoja.version);
    sucio.current = false;
    setBloqueada(false);
    setError(null);
    setGuardado("guardado");
  }

  // Autoguardado con debounce.
  useEffect(() => {
    if (!sucio.current || bloqueada) return;
    const t = setTimeout(guardar, AUTOGUARDADO_MS);
    return () => clearTimeout(t);
  }, [campos, guardar, bloqueada]);

  // Aviso si pasa mucho tiempo sin guardar (el bloqueo de 10 min está por vencer).
  useEffect(() => {
    const t = setInterval(() => setLockPorVencer(Date.now() - ultimoGuardado.current > AVISO_BLOQUEO_MS), 30_000);
    return () => clearInterval(t);
  }, []);

  // Consulta a Axis cuando el teléfono está completo.
  const telefono = telefonoConsultable(campos);
  useEffect(() => {
    if (!telefono) { setAxis(null); return; }
    let vigente = true;
    api<ResultadoAxis>("/api/captura-datos/axis", { json: { telefono } })
      .then((r) => vigente && setAxis(r))
      .catch(() => vigente && setAxis({ estado: "no_disponible" }));
    return () => { vigente = false; };
  }, [telefono]);

  function cambiar<K extends FieldKey>(k: K, valor: SheetFields[K]) {
    sucio.current = true;
    setGuardado("pendiente");
    setCampos((c) => ({ ...c, [k]: valor }));
  }

  async function leerConIa() {
    setLeyendo(true);
    setError(null);
    try {
      if (!(await guardar())) return;
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${inicial.id}/extract`, { method: "POST" });
      setCampos({ ...EMPTY_FIELDS, ...(r.hoja.campos ?? {}) });
      versionRef.current = r.hoja.version;
      setVersion(r.hoja.version);
      sucio.current = false;
      setGuardado("guardado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo leer la hoja.");
      if (err instanceof ErrorApi && err.status === 422) onTerminar(); // no es una hoja de registro: ya quedó marcada
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
        method: "PATCH", json: { campos: normalizeFields(campos, inicial.estatus), voucherBox: inicial.voucherBox, confirmar: true },
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
    await guardar(); // no perder lo escrito en los últimos segundos
    await api(`/api/captura-datos/hojas/${inicial.id}/liberar`, { method: "POST" }).catch(() => {});
    onTerminar();
  }

  const campo = (k: FieldKey) => (intentoConfirmar ? errores[k] : undefined);
  const enlaceDuplicado = duplicado?.datos ? urlDuplicado(duplicado.datos) : null;
  const conciliacion = axis?.estado === "encontrado" ? conciliar(campos, axis.contacto) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-[50vh] overflow-hidden rounded-2xl border border-silver bg-black/5 lg:sticky lg:top-4 lg:h-[80vh]">
        {esPdf ? (
          <iframe src={urlFoto} title="Hoja de inscripción (PDF)" className="h-full w-full" />
        ) : (
          <TransformWrapper>
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={urlFoto} alt="Hoja de inscripción" className="max-h-full w-full object-contain" />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs text-muted">
          <span>{inicial.estatus} · {inicial.origen.nombreOriginal}</span>
          <span>{{ guardado: "Guardado", pendiente: "Cambios sin guardar…", guardando: "Guardando…", error: "Error al guardar" }[guardado]}</span>
        </div>

        {lockPorVencer && <Aviso>Llevas varios minutos sin guardar: la hoja podría liberarse para otra persona. Haz un cambio o confirma.</Aviso>}
        {error && <Aviso peligro>{error}</Aviso>}
        {bloqueada && <button onClick={recargar} className="rounded-lg border border-silver px-3 py-1.5 text-sm">Recargar hoja</button>}

        <button onClick={leerConIa} disabled={leyendo} className="inline-flex items-center gap-2 rounded-lg border border-primary px-3 py-2 text-sm text-primary disabled:opacity-50">
          {leyendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Leer con IA
        </button>

        <fieldset disabled={leyendo || bloqueada} className="min-w-0 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Folio" error={campo("folio")}><input value={campos.folio} onChange={(e) => cambiar("folio", e.target.value)} inputMode="numeric" className={CLASE_INPUT} /></Campo>
          <Campo etiqueta="Teléfono" error={campo("telefono") ?? campo("lada")}>
            <div className="flex gap-1">
              <select value={campos.lada} onChange={(e) => cambiar("lada", e.target.value as SheetFields["lada"])} className="rounded-lg border border-silver bg-surface px-1 text-sm">
                {LADAS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
              <input value={campos.telefono} onChange={(e) => cambiar("telefono", e.target.value.replace(/\D/g, ""))} inputMode="tel" className={CLASE_INPUT} />
            </div>
          </Campo>
        </div>
        <Campo etiqueta="Nombre" error={campo("nombre")} aviso={conciliacion?.nombre === "distinto" ? "No coincide con Axis" : undefined}>
          <input value={campos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} className={CLASE_INPUT} />
        </Campo>
        <Campo etiqueta="Correo" error={campo("correo")} aviso={conciliacion?.correo === "distinto" ? "No coincide con Axis" : undefined}>
          <input value={campos.correo} onChange={(e) => cambiar("correo", e.target.value)} type="email" className={CLASE_INPUT} />
        </Campo>
        {axis?.estado === "encontrado" && (
          <p className="text-xs text-muted">Axis: {axis.contacto.nombre || "—"} · {axis.contacto.correo || "—"}{axis.coincidencias > 1 ? ` (${axis.coincidencias} coincidencias)` : ""}</p>
        )}
        {axis?.estado === "no_encontrado" && <p className="text-xs text-muted">Este teléfono no está en Axis.</p>}

        {llevaPago(inicial.estatus) && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Método de pago" error={campo("metodoPago")}>
                <select value={campos.metodoPago} onChange={(e) => cambiar("metodoPago", e.target.value)} className={CLASE_INPUT}>
                  <option value="">Elige…</option>
                  {METODOS_PAGO.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Campo>
              <Campo etiqueta="Cantidad pagada" error={campo("cantidad")}><input value={campos.cantidad} onChange={(e) => cambiar("cantidad", e.target.value)} inputMode="decimal" className={CLASE_INPUT} /></Campo>
            </div>
            {requiereTarjeta(campos.metodoPago) && (
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Marca">
                  <select value={campos.marcaTarjeta} onChange={(e) => cambiar("marcaTarjeta", e.target.value)} className={CLASE_INPUT}>
                    <option value="">—</option>
                    {MARCAS_TARJETA.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </Campo>
                <Campo etiqueta="Últimos 4 dígitos" error={campo("tarjeta")}><input value={campos.tarjeta} onChange={(e) => cambiar("tarjeta", e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" className={CLASE_INPUT} /></Campo>
              </div>
            )}
            <Campo etiqueta={inicial.estatus === "Completo" ? "Membresía" : "Membresía (opcional)"} error={campo("membresia")}>
              <select value={campos.membresia} onChange={(e) => cambiar("membresia", e.target.value)} className={CLASE_INPUT}>
                <option value="">Elige…</option>
                {MEMBRESIAS.map((m) => <option key={m.value} value={m.value}>{m.value} — {m.detalle}</option>)}
              </select>
            </Campo>
          </>
        )}
        <Campo etiqueta="Notas" error={campo("notas")}><textarea value={campos.notas} onChange={(e) => cambiar("notas", e.target.value)} rows={2} className={CLASE_INPUT} /></Campo>

        </fieldset>

        {duplicado && (
          <Aviso peligro>
            {duplicado.mensaje}.{" "}
            {enlaceDuplicado && <a href={enlaceDuplicado.url} target="_blank" rel="noreferrer" className="underline">{enlaceDuplicado.texto}</a>}
            <button onClick={() => confirmar(true)} className="ml-2 underline">Confirmar de todos modos</button>
          </Aviso>
        )}

        <div className="flex justify-between gap-2 pt-2">
          <button onClick={liberar} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted hover:bg-silver/40"><Undo2 className="h-4 w-4" /> Guardar y salir</button>
          <button onClick={() => confirmar()} disabled={confirmando || leyendo} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {confirmando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Confirmar hoja
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ etiqueta, error, aviso, children }: { etiqueta: string; error?: string; aviso?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted">{etiqueta}</span>
      {children}
      {error && <span className="block text-xs text-danger">{error}</span>}
      {!error && aviso && <span className="block text-xs text-amber-600">{aviso}</span>}
    </label>
  );
}

function Aviso({ peligro, children }: { peligro?: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${peligro ? "border-danger/30 bg-danger/10 text-danger" : "border-amber-500/30 bg-amber-500/10 text-amber-700"}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{children}</span>
    </p>
  );
}
