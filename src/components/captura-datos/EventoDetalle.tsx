"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { ArrowLeft, CloudUpload, Download, ExternalLink, Eye, Loader2, PlayCircle, RotateCcw, Upload, Users } from "lucide-react";
import { AsignacionesModal } from "./AsignacionesModal";
import { AvisoTemporal } from "./AvisoTemporal";
import { EditorHoja } from "./EditorHoja";
import { api, ErrorApi, imagenAJpeg } from "@/lib/captura-datos/cliente";
import { usePolling } from "@/lib/captura-datos/usePolling";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import { ESTATUS, type Estatus } from "@/lib/captura-datos/fields";
import { useSesion } from "@/lib/session-context";
import type { EventoCaptura, HojaCaptura } from "@/lib/captura-datos/modelo";

const POLLING_MS = 10_000;
const FOTOS_POR_TANDA = 30; // límite de la ruta /hojas/subir
const COLOR_ESTADO = { pendiente: "bg-silver/50", leida: "bg-amber-500/20", confirmada: "bg-success/20", no_valida: "bg-danger/15" } as const;

export function EventoDetalle({ id }: { id: string }) {
  const { usuario } = useSesion();
  const [evento, setEvento] = useState<EventoCaptura | null>(null);
  const [hojas, setHojas] = useState<HojaCaptura[]>([]);
  const [actual, setActual] = useState<HojaCaptura | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [estatusSubida, setEstatusSubida] = useState<Estatus>("Completo");
  const [asignando, setAsignando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    try {
      const [e, h] = await Promise.all([
        api<{ evento: EventoCaptura }>(`/api/captura-datos/eventos/${id}`),
        api<{ hojas: HojaCaptura[] }>(`/api/captura-datos/eventos/${id}/hojas`),
      ]);
      setEvento(e.evento);
      setHojas(h.hojas);
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo cargar el evento.");
    }
  }, [id]);

  usePolling(cargar, POLLING_MS, !actual);

  async function tomarSiguiente() {
    setOcupado("tomar");
    setMensaje(null);
    try {
      const r = await api<{ hoja: HojaCaptura | null }>(`/api/captura-datos/eventos/${id}/tomar-hoja`, { method: "POST" });
      if (r.hoja) setActual(r.hoja);
      else setMensaje("No quedan hojas libres: están confirmadas o las tiene otra persona.");
    } catch (err) {
      setMensaje(err instanceof Error ? err.message : "No se pudo tomar una hoja.");
    } finally {
      setOcupado(null);
    }
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

  async function subirFotos(archivos: FileList | null) {
    if (!archivos?.length) return;
    setOcupado("subir");
    setMensaje(null);
    try {
      const lista = [...archivos].filter((a) => a.type.startsWith("image/") || a.type === "application/pdf");
      for (let i = 0; i < lista.length; i += FOTOS_POR_TANDA) {
        const tanda = lista.slice(i, i + FOTOS_POR_TANDA);
        const form = new FormData();
        form.set("estatus", estatusSubida);
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
    } finally {
      setOcupado(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function confirmarEvento(opciones: { crearCarpeta?: boolean; sinFotos?: boolean } = {}) {
    setOcupado("confirmar");
    setMensaje(null);
    try {
      await api(`/api/captura-datos/eventos/${id}`, { method: "PATCH", json: { accion: "confirmar", ...opciones } });
      await cargar();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409 && err.datos.faltaCarpeta) {
        if (window.confirm("Falta la subcarpeta de fotos en Drive. ¿Crearla y continuar?")) return await confirmarEvento({ ...opciones, crearCarpeta: true });
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

  if (!evento) return <p className="py-12 text-center text-sm text-muted">{mensaje ?? "Cargando…"}</p>;

  const conteo = (e: HojaCaptura["estado"]) => hojas.filter((h) => h.estado === e).length;
  const porRevisar = conteo("pendiente") + conteo("leida");

  if (actual) {
    return (
      <div className="space-y-4">
        <EditorHoja key={actual.id} hoja={actual} onTerminar={() => { setActual(null); cargar(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href="/captura-datos" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Eventos</Link>
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{evento.nombre}</h1>
        <p className="text-sm text-muted">
          {conteo("confirmada")} confirmadas · {porRevisar} por revisar{conteo("no_valida") ? ` · ${conteo("no_valida")} no válidas` : ""}
          {evento.drive && <> · <a href={evento.drive.hojaUrl} target="_blank" rel="noreferrer" className="text-primary underline">Hoja en Drive</a></>}
        </p>
      </div>

      {mensaje && <AvisoTemporal key={mensaje} peligro onCerrar={() => setMensaje(null)}>{mensaje}</AvisoTemporal>}

      <div className="flex flex-wrap items-center gap-2">
        {evento.estado === "abierto" ? (
          <>
            <Boton onClick={tomarSiguiente} cargando={ocupado === "tomar"} icono={<PlayCircle className="h-4 w-4" />} primario>Tomar siguiente hoja</Boton>
            {evento.origen === "local" && (
              <>
                <select value={estatusSubida} onChange={(e) => setEstatusSubida(e.target.value as Estatus)} className="rounded-lg border border-silver bg-surface px-2 py-2 text-sm">
                  {ESTATUS.map((e) => <option key={e.value}>{e.value}</option>)}
                </select>
                <Boton onClick={() => entrada.current?.click()} cargando={ocupado === "subir"} icono={<Upload className="h-4 w-4" />}>Subir fotos o PDF</Boton>
                <input ref={entrada} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => subirFotos(e.target.files)} />
              </>
            )}
            <Boton onClick={() => window.confirm(porRevisar ? `Quedan ${porRevisar} hojas por revisar. ¿Guardar en Drive solo lo confirmado?` : "¿Guardar el evento en Drive?") && confirmarEvento()} cargando={ocupado === "confirmar"} icono={<CloudUpload className="h-4 w-4" />}>Guardar en Drive</Boton>
          </>
        ) : (
          usuario?.rol === "admin" && <Boton onClick={reabrir} icono={<RotateCcw className="h-4 w-4" />}>Reabrir evento</Boton>
        )}
        {usuario?.rol === "admin" && <Boton onClick={() => setAsignando(true)} icono={<Users className="h-4 w-4" />}>Personas</Boton>}
        <a href={urlExcelEvento(id)} className="inline-flex items-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm"><Download className="h-4 w-4" /> Excel</a>
      </div>

      {asignando && <AsignacionesModal eventoId={id} onCerrar={() => setAsignando(false)} />}

      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {hojas.map((h) => (
          <li key={h.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs ${COLOR_ESTADO[h.estado]}`}>
            <span className="min-w-0">
              <span className="font-medium text-foreground">{h.folio ? `Folio ${h.folio}` : h.origen.nombreOriginal}</span>
              <span className="text-muted"> · {h.estatus} · {h.estado.replace("_", " ")}{h.bloqueadaHasta && new Date(h.bloqueadaHasta) > new Date() ? " · en edición" : ""}</span>
            </span>
            {evento.estado === "abierto" && (h.estado === "pendiente" || h.estado === "leida") ? (
              <button onClick={() => abrirHoja(h.id)} disabled={ocupado !== null} className="inline-flex shrink-0 items-center gap-1 rounded-md border border-silver bg-surface px-2 py-1 font-medium text-foreground disabled:opacity-50">
                {ocupado === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} Abrir
              </button>
            ) : (
              <a href={`/api/captura-datos/hojas/${h.id}/foto`} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-silver bg-surface px-2 py-1 font-medium text-foreground">
                <ExternalLink className="h-3.5 w-3.5" /> Ver foto
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Boton({ onClick, cargando, icono, primario, children }: { onClick: () => void; cargando?: boolean; icono: React.ReactNode; primario?: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={cargando} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${primario ? "bg-primary text-white" : "border border-silver"}`}>
      {cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : icono} {children}
    </button>
  );
}
