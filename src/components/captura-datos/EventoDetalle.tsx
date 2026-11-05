"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, CheckCircle2, CloudUpload, Lock, Download, History, Loader2, PlayCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import { AvisoTemporal } from "./AvisoTemporal";
import { BarraColaboracion } from "./BarraColaboracion";
import { ConfirmarModal } from "./ConfirmarModal";
import { EditorHoja } from "./EditorHoja";
import { HistorialModal } from "./HistorialModal";
import { InsigniaEstatus, ESTILO_ESTATUS } from "./InsigniaEstatus";
import { Modal } from "./Modal";
import { BorrarEventoModal } from "./BorrarEventoModal";
import { SubirFotosModal } from "./SubirFotosModal";
import { VerHojaModal } from "./VerHojaModal";
import { MenuHoja } from "./MenuHoja";
import { api, ErrorApi, formatearFecha, subirHojas } from "@/lib/captura-datos/cliente";
import { guardarCache, leerCache, olvidarCache } from "@/lib/captura-datos/cache";
import { usePolling } from "@/lib/captura-datos/usePolling";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import { carpetaDeEstatus, ESTATUS, type Estatus } from "@/lib/captura-datos/fields";
import { bloqueoVigente, misHojasEnEdicion, progresoPorPersona, type NombresUsuarios } from "@/lib/captura-datos/colaboracion";
import { useSesion } from "@/lib/session-context";
import type { EventoCaptura, HojaCaptura } from "@/lib/captura-datos/modelo";
import { mensajeError } from "./mensajeError";

const POLLING_MS = 10_000;
const BORDE_ESTADO = { pendiente: "border-l-silver", leida: "border-l-amber-500", confirmada: "border-l-success", no_valida: "border-l-danger" } as const;
const INSIGNIA_ESTADO = { pendiente: "bg-silver/50 text-muted", leida: "bg-amber-500/15 text-amber-700", confirmada: "bg-success/15 text-success", no_valida: "bg-danger/15 text-danger" } as const;

interface Dialogo {
  titulo: string;
  mensaje: string;
  textoConfirmar: string;
  /** Si se indica, la ventana pide un motivo obligatorio con esta etiqueta y lo entrega a `alConfirmar`. */
  pedirMotivo?: string;
  alConfirmar: (motivo: string) => void;
}

export function EventoDetalle({ id }: { id: string }) {
  const { usuario } = useSesion();
  const router = useRouter();
  const cacheado = leerCache<{ evento: EventoCaptura; hojas: HojaCaptura[]; nombres?: NombresUsuarios }>(usuario?.id, `evento:${id}`);
  const [evento, setEvento] = useState<EventoCaptura | null>(cacheado?.evento ?? null);
  const [hojas, setHojas] = useState<HojaCaptura[]>(cacheado?.hojas ?? []);
  const [nombres, setNombres] = useState<NombresUsuarios>(cacheado?.nombres ?? {});
  const [actual, setActual] = useState<HojaCaptura | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const [alternadas, setAlternadas] = useState<ReadonlySet<Estatus>>(new Set());
  const [exito, setExito] = useState<string | null>(null);
  const [driveSubido, setDriveSubido] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [verHistorial, setVerHistorial] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [viendo, setViendo] = useState<HojaCaptura | null>(null);
  const [hojaABorrar, setHojaABorrar] = useState<HojaCaptura | null>(null);
  const [borrandoHoja, setBorrandoHoja] = useState(false);
  const abiertaDesdeEvento = useRef(false);

  const cargar = useCallback(async (): Promise<HojaCaptura[] | null> => {
    try {
      const [e, h] = await Promise.all([
        api<{ evento: EventoCaptura }>(`/api/captura-datos/eventos/${id}`),
        api<{ hojas: HojaCaptura[]; usuarios?: NombresUsuarios }>(`/api/captura-datos/eventos/${id}/hojas`),
      ]);
      setEvento(e.evento);
      setHojas(h.hojas);
      setNombres(h.usuarios ?? {});
      guardarCache(usuario?.id, `evento:${id}`, { evento: e.evento, hojas: h.hojas, nombres: h.usuarios ?? {} });
      return h.hojas;
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudo cargar el evento."));
      return null;
    }
  }, [id, usuario?.id]);

  usePolling(cargar, POLLING_MS, true); // también dentro del editor: la tira de hojas se actualiza sola

  async function liberarMisHojas() {
    setOcupado("liberar");
    setMensaje(null);
    try {
      const r = await api<{ liberadas: number }>(`/api/captura-datos/eventos/${id}/liberar-mis-hojas`, { method: "POST" });
      setExito(r.liberadas === 1 ? "Se liberó 1 hoja: ya la puede tomar otra persona." : `Se liberaron ${r.liberadas} hojas: ya las puede tomar otra persona.`);
      await cargar();
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudieron liberar tus hojas."));
    } finally {
      setOcupado(null);
    }
  }

  async function tomarSiguiente(estatus: Estatus, silencioso = false): Promise<boolean> {
    setOcupado("tomar");
    setMensaje(null);
    try {
      abiertaDesdeEvento.current = false;
      const r = await api<{ hoja: HojaCaptura | null }>(`/api/captura-datos/eventos/${id}/tomar-hoja`, { json: { estatus } });
      if (r.hoja) setActual(r.hoja);
      else if (!silencioso) setMensaje(`No quedan hojas libres de ${estatus}: están confirmadas o las tiene otra persona.`);
      return !!r.hoja;
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudo tomar una hoja."));
      return false;
    } finally {
      setOcupado(null);
    }
  }

  /** Tras confirmar una hoja nueva se pasa directo a la siguiente; al terminar la última (o al corregir una ya guardada) se vuelve al evento. */
  async function siguiente(hojaTerminada: HojaCaptura) {
    // El editor se queda en pantalla hasta tener la siguiente hoja: así no aparece un instante el listado.
    if (hojaTerminada.estado === "confirmada" && abiertaDesdeEvento.current) {
      await cargar();
      setActual(null);
      return;
    }
    const [hayOtra, actualizadas] = await Promise.all([tomarSiguiente(hojaTerminada.estatus, true), cargar()]);
    if (hayOtra) return;
    setActual(null);
    if (actualizadas?.length && actualizadas.every((h) => h.estado === "confirmada" || h.estado === "no_valida")) setExito("¡Listo! Se completaron todas las hojas del evento.");
    else if (actualizadas?.filter((h) => h.estatus === hojaTerminada.estatus).every((h) => h.estado === "confirmada" || h.estado === "no_valida")) setExito(`Ya están confirmadas todas las hojas de ${carpetaDeEstatus(hojaTerminada.estatus)}.`);
    else setMensaje(`No quedan hojas libres de ${carpetaDeEstatus(hojaTerminada.estatus)}: las demás las tiene otra persona.`);
  }

  async function abrirHoja(hojaId: string, desdeEvento = true) {
    abiertaDesdeEvento.current = desdeEvento;
    setOcupado(hojaId);
    setMensaje(null);
    try {
      const r = await api<{ hoja: HojaCaptura }>(`/api/captura-datos/hojas/${hojaId}/tomar`, { method: "POST" });
      setActual(r.hoja);
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudo abrir la hoja."));
      await cargar(); // por si cambió de estado mientras tanto
    } finally {
      setOcupado(null);
    }
  }

  async function subirFotos(archivos: File[], estatus: Estatus) {
    setMensaje(null);
    try {
      await subirHojas(id, archivos, estatus);
      await cargar();
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudieron subir las fotos."));
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
      setDriveSubido(accion === "cerrar" ? "Evento cerrado y subido a Drive correctamente." : evento?.estado === "abierto" ? "Se subió a Drive correctamente. El evento sigue abierto." : "Se subió a Drive correctamente.");
      await cargar();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409 && err.datos.faltaCarpeta) {
        setDialogo({
          titulo: "Falta la subcarpeta de fotos",
          mensaje: "Falta la subcarpeta de fotos en Drive. ¿Crearla y continuar?",
          textoConfirmar: "Crear y continuar",
          alConfirmar: () => void guardarEvento(accion, { ...opciones, crearCarpeta: true }),
        });
      } else {
        setMensaje(mensajeError(err, "No se pudo guardar en Drive."));
      }
    } finally {
      setOcupado(null);
    }
  }

  async function reabrir(motivo: string) {
    try {
      await api(`/api/captura-datos/eventos/${id}`, { method: "PATCH", json: { accion: "reabrir", motivo } });
      await cargar();
    } catch (err) {
      setMensaje(mensajeError(err, "No se pudo reabrir."));
    }
  }

  function alternarSeccion(estatus: Estatus) {
    setAlternadas((previas) => {
      const nuevas = new Set(previas);
      if (!nuevas.delete(estatus)) nuevas.add(estatus);
      return nuevas;
    });
  }

  // Un estado con todas sus hojas confirmadas (o no válidas) arranca colapsado; tocar el encabezado invierte lo que se ve.
  const estaCompleto = (lista: HojaCaptura[]) => lista.every((h) => h.estado === "confirmada" || h.estado === "no_valida") && lista.some((h) => h.estado === "confirmada");
  const estaColapsada = (estatus: Estatus, lista: HojaCaptura[]) => estaCompleto(lista) !== alternadas.has(estatus);

  if (!evento) return <p className="py-12 text-center text-sm text-muted">{mensaje ?? "Cargando…"}</p>;

  const conteo = (e: HojaCaptura["estado"]) => hojas.filter((h) => h.estado === e).length;
  const porRevisar = conteo("pendiente") + conteo("leida");
  async function borrarHoja(h: HojaCaptura) {
    setBorrandoHoja(true);
    try {
      await api(`/api/captura-datos/hojas/${h.id}`, { method: "DELETE" });
      setHojaABorrar(null);
      setExito("Se borró la hoja.");
      await cargar();
    } catch (err) {
      setHojaABorrar(null);
      setMensaje(mensajeError(err, "No se pudo borrar la hoja."));
    } finally {
      setBorrandoHoja(false);
    }
  }

  const deOtra = (h: HojaCaptura) => bloqueoVigente(h) && h.bloqueadaPorId !== usuario?.id;
  const quienEdita = (h: HojaCaptura) => (h.bloqueadaPorId === usuario?.id ? "Tú" : nombres[h.bloqueadaPorId ?? ""] ?? "Otra persona");

  if (actual) {
    return (
      <div className="space-y-4">
        <EditorHoja key={actual.id} hoja={actual} hojas={hojas.filter((h) => h.estatus === actual.estatus)} usuarioId={usuario?.id} nombres={nombres} onTerminar={() => { setActual(null); cargar(); }} onSiguiente={() => siguiente(actual)} onIr={(hojaId) => { void cargar(); return abrirHoja(hojaId, false); }} />
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

      {exito && <AvisoTemporal key={exito} positivo onCerrar={() => setExito(null)}>{exito}</AvisoTemporal>}
      {mensaje && <AvisoTemporal key={mensaje} peligro onCerrar={() => setMensaje(null)}>{mensaje}</AvisoTemporal>}

      <div className="flex flex-wrap items-center gap-2">
        {evento.estado === "abierto" && (
          <>
            <Boton onClick={() => setSubiendoFotos(true)} icono={<Upload className="h-4 w-4" />}>Subir fotos o PDF</Boton>
          </>
        )}
        <Boton
          onClick={() => setDialogo({
            titulo: "Guardar en Drive",
            mensaje: evento.estado === "abierto" && porRevisar ? `Quedan ${porRevisar} hojas por revisar. ¿Guardar en Drive solo lo confirmado?` : "¿Guardar el evento en Drive?",
            textoConfirmar: "Guardar en Drive",
            alConfirmar: () => void guardarEvento("confirmar"),
          })}
          cargando={ocupado === "confirmar"}
          icono={<CloudUpload className="h-4 w-4" />}
        >
          Guardar en Drive
        </Boton>
        {evento.estado !== "abierto" && (
          <Boton
            onClick={() => setDialogo({
              titulo: "Reabrir evento",
              mensaje: "El evento volverá a quedar abierto para seguir capturando. Queda registrado quién lo reabrió y por qué.",
              pedirMotivo: "Motivo de la reapertura",
              textoConfirmar: "Reabrir evento",
              alConfirmar: (motivo) => void reabrir(motivo),
            })}
            icono={<RotateCcw className="h-4 w-4" />}
          >
            Reabrir evento
          </Boton>
        )}
        {evento.estado !== "abierto" && <a href={urlExcelEvento(id)} className="inline-flex items-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm"><Download className="h-4 w-4" /> Excel</a>}
        {evento.estado === "abierto" && (
          <Boton
            onClick={() => setDialogo({
              titulo: "Cerrar evento",
              mensaje: porRevisar ? `Quedan ${porRevisar} hojas por revisar y no se incluirán. ¿Guardar en Drive y cerrar el evento?` : "¿Guardar en Drive y cerrar el evento?",
              textoConfirmar: "Guardar y cerrar",
              alConfirmar: () => void guardarEvento("cerrar"),
            })}
            cargando={ocupado === "confirmar"}
            icono={<Lock className="h-4 w-4" />}
          >
            Cerrar evento
          </Boton>
        )}
        <Boton onClick={() => setVerHistorial(true)} icono={<History className="h-4 w-4" />}>Historial</Boton>
        <Boton onClick={() => setBorrando(true)} icono={<Trash2 className="h-4 w-4" />} peligro className="ml-auto hover:bg-danger hover:text-white">Borrar evento</Boton>
      </div>
      {hojas.length > 0 && usuario && (
        <BarraColaboracion
          progreso={progresoPorPersona(hojas, usuario.id, nombres)}
          misEnEdicion={misHojasEnEdicion(hojas, usuario.id)}
          abierto={evento.estado === "abierto"}
          liberando={ocupado === "liberar"}
          onLiberar={() => void liberarMisHojas()}
        />
      )}
      {viendo && <VerHojaModal hoja={viendo} onCerrar={() => setViendo(null)} onEditar={evento.estado === "abierto" && viendo.estado !== "no_valida" && !deOtra(viendo) ?() => { const hojaId = viendo.id; setViendo(null); void abrirHoja(hojaId); } : undefined} />}
      {hojaABorrar && (
        <ConfirmarModal titulo="Borrar hoja" textoConfirmar="Borrar hoja" peligro cargando={borrandoHoja} onCancelar={() => setHojaABorrar(null)} onConfirmar={() => void borrarHoja(hojaABorrar)}>
          ¿Borrar la hoja {hojaABorrar.folio ? `con folio ${hojaABorrar.folio}` : hojaABorrar.origen.nombreOriginal}? Se quitará del evento y no se puede deshacer.
        </ConfirmarModal>
      )}
      {verHistorial && <HistorialModal eventoId={id} titulo={`Historial de ${evento.nombre}`} onCerrar={() => setVerHistorial(false)} />}
      {dialogo && (
        <ConfirmarModal
          titulo={dialogo.titulo}
          textoConfirmar={dialogo.textoConfirmar}
          pedirMotivo={dialogo.pedirMotivo}
          onCancelar={() => setDialogo(null)}
          onConfirmar={(motivo) => { setDialogo(null); dialogo.alConfirmar(motivo); }}
        >
          {dialogo.mensaje}
        </ConfirmarModal>
      )}

      {(ocupado === "confirmar" || driveSubido) && <SubiendoADrive subido={driveSubido} onCerrar={() => setDriveSubido(null)} />}
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

      {hojas.length > 0 && (
        <div className="space-y-6 rounded-2xl border border-silver bg-white p-3 shadow-sm sm:p-5">
          {ESTATUS.map((e) => ({ e, lista: hojas.filter((h) => h.estatus === e.value) })).filter(({ lista }) => lista.length > 0).map(({ e, lista }) => (
            <section key={e.value} aria-label={e.carpeta} className={`space-y-3 rounded-xl border p-3 ${ESTILO_ESTATUS[e.value].seccion}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                  <button onClick={() => alternarSeccion(e.value)} aria-expanded={!estaColapsada(e.value, lista)} className="flex w-full flex-wrap items-center gap-2 text-left">
                    <ChevronDown className={`h-4 w-4 text-muted transition ${estaColapsada(e.value, lista) ? "-rotate-90" : ""}`} /> <InsigniaEstatus estatus={e.value} texto={e.carpeta} /> <span className="rounded-full bg-silver/40 px-2 py-0.5 text-xs font-medium text-muted">{lista.length}</span>
                    {estaCompleto(lista) && <span className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/15 px-2 py-0.5 text-xs font-semibold text-success"><CheckCircle2 className="h-3.5 w-3.5" /> Todo confirmado</span>}
                  </button>
                </h2>
                {evento.estado === "abierto" && lista.some((h) => h.estado === "pendiente" || h.estado === "leida") && (
                  <button onClick={() => void tomarSiguiente(e.value)} disabled={ocupado !== null} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-deep disabled:opacity-50">
                    {ocupado === "tomar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} {lista.some((h) => h.estado === "confirmada") ? "Seguir" : "Capturar"}
                  </button>
                )}
              </div>
              {!estaColapsada(e.value, lista) && <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {lista.map((h) => (
                  <li key={h.id} className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-l-4 border-silver bg-white px-3.5 py-3 text-xs shadow-sm transition hover:shadow-md ${BORDE_ESTADO[h.estado]}`}>
                    <span className="min-w-0 flex-1 basis-40 space-y-1">
                      <span className="block truncate text-sm font-medium text-foreground">{h.folio ? `Folio ${h.folio}${h.campos?.nombre ? ` · ${h.campos.nombre}` : ""}` : h.origen.nombreOriginal}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${INSIGNIA_ESTADO[h.estado]}`}>{h.estado.replace("_", " ")}</span>
                        {bloqueoVigente(h) && <span className="text-muted">{quienEdita(h)} · en edición</span>}
                      </span>
                    </span>
                    <MenuHoja
                      deshabilitado={ocupado !== null}
                      onVer={() => setViendo(h)}
                      onEditar={evento.estado === "abierto" && h.estado !== "no_valida" && !deOtra(h) ? () => void abrirHoja(h.id) : undefined}
                      onBorrar={evento.estado === "abierto" && usuario?.rol === "admin" && !deOtra(h) ? () => setHojaABorrar(h) : undefined}
                    />
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

function SubiendoADrive({ subido, onCerrar }: { subido: string | null; onCerrar: () => void }) {
  if (subido) {
    return (
      <Modal titulo="Drive subido" onCerrar={onCerrar}>
        <div role="status" aria-live="polite" className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" />
          <p className="text-sm font-medium text-success">Drive subido</p>
          <p className="text-sm text-foreground">{subido}</p>
          <button type="button" onClick={onCerrar} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">Aceptar</button>
        </div>
      </Modal>
    );
  }
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
