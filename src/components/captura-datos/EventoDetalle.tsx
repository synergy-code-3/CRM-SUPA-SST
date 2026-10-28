"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowLeft, ChevronDown, CloudUpload, Lock, Download, ExternalLink, Eye, History, Loader2, Pencil, PlayCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import { AvisoTemporal } from "./AvisoTemporal";
import { EditorHoja } from "./EditorHoja";
import { HistorialModal } from "./HistorialModal";
import { Modal } from "./Modal";
import { BorrarEventoModal } from "./BorrarEventoModal";
import { SubirFotosModal } from "./SubirFotosModal";
import { api, ErrorApi, formatearFecha, imagenAJpeg } from "@/lib/captura-datos/cliente";
import { guardarCache, leerCache, olvidarCache } from "@/lib/captura-datos/cache";
import { usePolling } from "@/lib/captura-datos/usePolling";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import { ESTATUS, type Estatus } from "@/lib/captura-datos/fields";
import { useSesion } from "@/lib/session-context";
import type { EventoCaptura, HojaCaptura } from "@/lib/captura-datos/modelo";

const POLLING_MS = 10_000;
const FOTOS_POR_TANDA = 30; // límite de la ruta /hojas/subir
const BORDE_ESTADO = { pendiente: "border-l-silver", leida: "border-l-amber-500", confirmada: "border-l-success", no_valida: "border-l-danger" } as const;
const INSIGNIA_ESTADO = { pendiente: "bg-silver/50 text-muted", leida: "bg-amber-500/15 text-amber-700", confirmada: "bg-success/15 text-success", no_valida: "bg-danger/15 text-danger" } as const;

export function EventoDetalle({ id }: { id: string }) {
  const { usuario } = useSesion();
  const router = useRouter();
  const cacheado = leerCache<{ evento: EventoCaptura; hojas: HojaCaptura[] }>(usuario?.id, `evento:${id}`);
  const [evento, setEvento] = useState<EventoCaptura | null>(cacheado?.evento ?? null);
  const [hojas, setHojas] = useState<HojaCaptura[]>(cacheado?.hojas ?? []);
  const [actual, setActual] = useState<HojaCaptura | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [colapsadas, setColapsadas] = useState<ReadonlySet<Estatus>>(new Set());
  const [exito, setExito] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [e, h] = await Promise.all([
        api<{ evento: EventoCaptura }>(`/api/captura-datos/eventos/${id}`),
        api<{ hojas: HojaCaptura[] }>(`/api/captura-datos/eventos/${id}/hojas`),
      ]);
      setEvento(e.evento);
      setHojas(h.hojas);
      guardarCache(usuario?.id, `evento:${id}`, { evento: e.evento, hojas: h.hojas });
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo cargar el evento.");
    }
  }, [id, usuario?.id]);

  usePolling(cargar, POLLING_MS, true); // también dentro del editor: la tira de hojas se actualiza sola

  async function tomarSiguiente(): Promise<boolean> {
    setOcupado("tomar");
    setMensaje(null);
    try {
      const r = await api<{ hoja: HojaCaptura | null }>(`/api/captura-datos/eventos/${id}/tomar-hoja`, { method: "POST" });
      if (r.hoja) setActual(r.hoja);
      else setMensaje("No quedan hojas libres: están confirmadas o las tiene otra persona.");
      return !!r.hoja;
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo tomar una hoja.");
      return false;
    } finally {
      setOcupado(null);
    }
  }

  /** Tras confirmar una hoja nueva se pasa directo a la siguiente; al terminar la última (o al corregir una ya guardada) se vuelve al evento. */
  async function siguiente(hojaTerminada: HojaCaptura) {
    // El editor se queda en pantalla hasta tener la siguiente hoja: así no aparece un instante el listado.
    if (hojaTerminada.estado === "confirmada") {
      await cargar();
      setActual(null);
      return;
    }
    const [hayOtra] = await Promise.all([tomarSiguiente(), cargar()]);
    if (!hayOtra) setActual(null);
  }

  async function abrirHoja(hojaId: string) {
    setOcupado(hojaId);
    setMensaje(null);
    try {
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${hojaId}/tomar`, { method: "POST" });
      setActual(r.hoja);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo abrir la hoja.");
      await cargar(); // por si cambió de estado mientras tanto
    } finally {
      setOcupado(null);
    }
  }

  async function subirFotos(archivos: File[], estatus: Estatus) {
    setMensaje(null);
    try {
      const lista = archivos.filter((a) => a.type.startsWith("image/") || a.type === "application/pdf");
      for (let i = 0; i < lista.length; i += FOTOS_POR_TANDA) {
        const tanda = lista.slice(i, i + FOTOS_POR_TANDA);
        const form = new FormData();
        form.set("estatus", estatus);
        form.set("metas", JSON.stringify(tanda.map((a) => ({ nombreOriginal: a.name }))));
        // Los PDF se suben tal cual (sin partir); las imágenes se reducen a JPEG.
        for (const a of tanda) {
          if (a.type === "application/pdf") form.append("archivos", a, a.name);
          else form.append("archivos", await imagenAJpeg(a), a.name.replace(/\.\w+$/, ".jpg"));
        }
        await api(`/api/captura-datos/eventos/${id}/hojas/subir`, { method: "POST", body: form });
      }
      await cargar();
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudieron subir las fotos.");
      throw err;
    }
  }

  /** "confirmar" guarda en Drive y deja el evento abierto; "cerrar" además lo cierra. */
  async function guardarEvento(accion: "confirmar" | "cerrar", opciones: { crearCarpeta?: boolean; sinFotos?: boolean } = {}) {
    setOcupado("confirmar");
    setMensaje(null);
    setExito(null);
    try {
      await api(`/api/captura-datos/eventos/${id}`, { method: "PATCH", json: { accion, ...opciones } });
      setExito(accion === "cerrar" ? "Evento cerrado y subido a Drive correctamente." : evento?.estado === "abierto" ? "Se subió a Drive correctamente. El evento sigue abierto." : "Se subió a Drive correctamente.");
      await cargar();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409 && err.datos.faltaCarpeta) {
        if (window.confirm("Falta la subcarpeta de fotos en Drive. ¿Crearla y continuar?")) return await guardarEvento(accion, { ...opciones, crearCarpeta: true });
      } else {
        setMensaje(err instanceof Error ? err.message : "No se pudo guardar en Drive.");
      }
    } finally {
      setOcupado(null);
    }
  }

  async function reabrir() {
    const motivo = window.prompt("Motivo de la reapertura:");
    if (!motivo?.trim()) return;
    try {
      await api(`/api/captura-datos/eventos/${id}`, { method: "PATCH", json: { accion: "reabrir", motivo } });
      await cargar();
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo reabrir.");
    }
  }

  function alternarSeccion(estatus: Estatus) {
    setColapsadas((previas) => {
      const nuevas = new Set(previas);
      if (!nuevas.delete(estatus)) nuevas.add(estatus);
      return nuevas;
    });
  }

  if (!evento) return <p className="py-12 text-center text-sm text-muted">{mensaje ?? "Cargando…"}</p>;

  const conteo = (e: HojaCaptura["estado"]) => hojas.filter((h) => h.estado === e).length;
  const porRevisar = conteo("pendiente") + conteo("leida");
  const hayCaptura = conteo("confirmada") > 0;

  if (actual) {
    return (
      <div className="space-y-4">
        <EditorHoja key={actual.id} hoja={actual} hojas={hojas} onTerminar={() => { setActual(null); cargar(); }} onSiguiente={() => siguiente(actual)} onIr={(hojaId) => { void cargar(); return abrirHoja(hojaId); }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/captura-datos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Eventos</Link>
      <div>
        <h1 className="break-words text-2xl font-semibold text-foreground">{evento.nombre}</h1>
        <p className="text-sm text-muted">
          {evento.fecha && <>{formatearFecha(evento.fecha)} · </>}
          {conteo("confirmada")} confirmadas · {porRevisar} por revisar{conteo("no_valida") ? ` · ${conteo("no_valida")} no válidas` : ""}
          {evento.drive && <> · <a href={evento.drive.hojaUrl} target="_blank" rel="noreferrer" className="text-primary underline">Hoja en Drive</a></>}
        </p>
      </div>

      {exito && <AvisoTemporal key={exito} onCerrar={() => setExito(null)}>{exito}</AvisoTemporal>}
      {mensaje && <AvisoTemporal key={mensaje} peligro onCerrar={() => setMensaje(null)}>{mensaje}</AvisoTemporal>}

      <div className="flex flex-wrap items-center gap-2">
        {evento.estado === "abierto" && (
          <>
            <Boton onClick={() => void tomarSiguiente()} cargando={ocupado === "tomar"} icono={<PlayCircle className="h-4 w-4" />} primario>{hayCaptura ? "Seguir capturando" : "Empezar a Capturar"}</Boton>
            <Boton onClick={() => setSubiendoFotos(true)} icono={<Upload className="h-4 w-4" />}>Subir fotos o PDF</Boton>
          </>
        )}
        <Boton onClick={() => window.confirm(evento.estado === "abierto" && porRevisar ? `Quedan ${porRevisar} hojas por revisar. ¿Guardar en Drive solo lo confirmado?` : "¿Guardar el evento en Drive?") && guardarEvento("confirmar")} cargando={ocupado === "confirmar"} icono={<CloudUpload className="h-4 w-4" />}>Guardar en Drive</Boton>
        {evento.estado !== "abierto" && <Boton onClick={reabrir} icono={<RotateCcw className="h-4 w-4" />}>Reabrir evento</Boton>}
        {evento.estado !== "abierto" && <a href={urlExcelEvento(id)} className="inline-flex items-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm"><Download className="h-4 w-4" /> Excel</a>}
        {evento.estado === "abierto" && <Boton onClick={() => window.confirm(porRevisar ? `Quedan ${porRevisar} hojas por revisar y no se incluirán. ¿Guardar en Drive y cerrar el evento?` : "¿Guardar en Drive y cerrar el evento?") && guardarEvento("cerrar")} cargando={ocupado === "confirmar"} icono={<Lock className="h-4 w-4" />}>Cerrar evento</Boton>}
        <Boton onClick={() => setVerHistorial(true)} icono={<History className="h-4 w-4" />}>Historial</Boton>
        <Boton onClick={() => setBorrando(true)} icono={<Trash2 className="h-4 w-4" />} peligro className="ml-auto hover:bg-danger hover:text-white">Borrar evento</Boton>
      </div>
      {verHistorial && <HistorialModal eventoId={id} titulo={`Historial de ${evento.nombre}`} onCerrar={() => setVerHistorial(false)} />}

      {ocupado === "confirmar" && <SubiendoADrive />}
      {subiendoFotos && <SubirFotosModal onCerrar={() => setSubiendoFotos(false)} onSubir={subirFotos} />}
      {borrando && (
        <BorrarEventoModal
          eventoId={id}
          nombre={evento.nombre}
          onCerrar={() => setBorrando(false)}
          onBorrado={() => {
            setBorrando(false);
            olvidarCache(usuario?.id, `evento:${id}`);
            olvidarCache(usuario?.id, "eventos");
            router.push("/captura-datos");
          }}
        />
      )}

      {/* Completos, apartados e interesados van en secciones separadas. */}
      {hojas.length > 0 && (
        <div className="space-y-6 rounded-2xl border border-silver bg-white p-3 shadow-sm sm:p-5">
          {ESTATUS.map((e) => ({ e, lista: hojas.filter((h) => h.estatus === e.value) })).filter(({ lista }) => lista.length > 0).map(({ e, lista }) => (
            <section key={e.value} aria-label={e.carpeta} className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">
                <button onClick={() => alternarSeccion(e.value)} aria-expanded={!colapsadas.has(e.value)} className="flex w-full items-center gap-2 text-left">
                  <ChevronDown className={`h-4 w-4 text-muted transition ${colapsadas.has(e.value) ? "-rotate-90" : ""}`} /> {e.carpeta} <span className="rounded-full bg-silver/40 px-2 py-0.5 text-xs font-medium text-muted">{lista.length}</span>
                </button>
              </h2>
              {!colapsadas.has(e.value) && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((h) => (
                  <li key={h.id} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-l-4 border-silver bg-white px-3.5 py-3 text-xs shadow-sm transition hover:shadow-md ${BORDE_ESTADO[h.estado]}`}>
                    <span className="min-w-0 flex-1 basis-40 space-y-1">
                      <span className="block truncate text-sm font-medium text-foreground">{h.folio ? `Folio ${h.folio}${h.campos?.nombre ? ` · ${h.campos.nombre}` : ""}` : h.origen.nombreOriginal}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${INSIGNIA_ESTADO[h.estado]}`}>{h.estado.replace("_", " ")}</span>
                        {h.bloqueadaHasta && new Date(h.bloqueadaHasta) > new Date() && <span className="text-muted">en edición</span>}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {evento.estado === "abierto" && h.estado !== "no_valida" && (
                        <button onClick={() => abrirHoja(h.id)} disabled={ocupado !== null} className="inline-flex items-center gap-1 rounded-lg border border-silver bg-surface px-2.5 py-1.5 font-medium text-foreground transition hover:border-primary hover:text-primary disabled:opacity-50">
                          {ocupado === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : h.estado === "confirmada" ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {h.estado === "confirmada" ? "Editar" : "Abrir"}
                        </button>
                      )}
                      {(evento.estado !== "abierto" || h.estado === "confirmada" || h.estado === "no_valida") && (
                        <a href={`/api/captura-datos/hojas/${h.id}/foto`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-silver bg-surface px-2.5 py-1.5 font-medium text-foreground transition hover:border-primary hover:text-primary">
                          <ExternalLink className="h-3.5 w-3.5" /> Ver foto
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ul>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Boton({ onClick, cargando, icono, primario, peligro, className = "", children }: { onClick: () => void; cargando?: boolean; icono: React.ReactNode; primario?: boolean; peligro?: boolean; className?: string; children: React.ReactNode }) {
  const variante = primario ? "bg-primary text-white" : peligro ? "border border-danger text-danger" : "border border-silver";
  return (
    <button onClick={onClick} disabled={cargando} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${variante} ${className}`}>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : icono} {children}
    </button>
  );
}

/** Cuadro que bloquea la pantalla mientras se sube el evento a Drive. */
function SubiendoADrive() {
  return (
    <Modal titulo="Guardando en Drive" onCerrar={() => {}} bloqueado>
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-4 text-center">
        <CloudUpload className="h-12 w-12 animate-bounce text-primary" />
        <p className="text-sm text-foreground">Subiendo a Drive… No cierres esta ventana.</p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-silver/50">
          <div className="h-full w-1/3 animate-[subida_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      </div>
    </Modal>
  );
}
