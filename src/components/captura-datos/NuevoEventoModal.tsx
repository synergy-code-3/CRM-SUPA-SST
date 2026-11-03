"use client";

import { useRef, useState } from "react";
import { Folder, Loader2, Upload } from "lucide-react";
import { ConfirmarModal } from "./ConfirmarModal";
import { Modal } from "./Modal";
import { ZonaArchivos } from "./ZonaArchivos";
import { api, subirHojas } from "@/lib/captura-datos/cliente";
import { ESTATUS, estatusDeCarpeta, type Estatus } from "@/lib/captura-datos/fields";
import type { InfoCarpeta } from "@/lib/captura-datos/google";
import { FECHA_MINIMA_EVENTO, fechaDeHoy, type EventoCaptura, type OrigenEvento } from "@/lib/captura-datos/modelo";

const CLASE_INPUT = "w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2";
const CLASE_BOTON = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function NuevoEventoModal({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (e: EventoCaptura) => void }) {
  const [enlace, setEnlace] = useState("");
  const [info, setInfo] = useState<InfoCarpeta | null>(null);
  const [origen, setOrigen] = useState<OrigenEvento>("local");
  const [estatus, setEstatus] = useState<Estatus>("Completo"); // categoría abierta en el menú de subida local
  const [archivos, setArchivos] = useState<Record<Estatus, File[]>>({ Completo: [], Apartado: [], Interesado: [] });
  const subidos = useRef(new Set<File>()); // si falla a medias, el reintento no vuelve a subir lo que ya quedó
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const hoy = fechaDeHoy();
  const fechaFueraDeRango = fecha !== "" && (fecha < FECHA_MINIMA_EVENTO || fecha > hoy);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaceBuscado, setEnlaceBuscado] = useState(""); // el enlace que produjo `info` (no el que se esté editando)
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const totalArchivos = ESTATUS.reduce((n, e) => n + archivos[e.value].length, 0);
  const [eventoCreado, setEventoCreado] = useState<EventoCaptura | null>(null); // si falla la importación, se reintenta sin duplicar el evento

  async function buscarCarpeta() {
    setCargando(true);
    setError(null);
    try {
      const r = await api<{ info: InfoCarpeta }>("/api/captura-datos/drive/carpeta", { json: { enlace } });
      setInfo(r.info);
      setEnlaceBuscado(enlace);
    } catch (err) {
      setInfo(null);
      setError(err instanceof Error ? err.message : "No se pudo leer la carpeta.");
    } finally {
      setCargando(false);
    }
  }

  async function crear() {
    if (!info) return;
    setCargando(true);
    setError(null);
    try {
      const evento = eventoCreado ?? (await api<{ evento: EventoCaptura }>("/api/captura-datos/eventos", {
        json: { nombre, fecha, estatus: ESTATUS.find((e) => archivos[e.value].length)?.value ?? estatus, origen, destino: { id: info.id, url: info.url, nombre: info.nombre } },
      })).evento;
      setEventoCreado(evento);
      if (origen === "drive") await importarDeDrive(evento.id, info, enlaceBuscado);
      else {
        for (const e of ESTATUS) {
          const pendientes = archivos[e.value].filter((f) => !subidos.current.has(f));
          if (pendientes.length) await subirHojas(evento.id, pendientes, e.value, (tanda) => tanda.forEach((f) => subidos.current.add(f)));
        }
      }
      onCreado(evento);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el evento.");
      setCargando(false);
    }
  }

  return (
    <Modal titulo="Nuevo evento" onCerrar={() => setConfirmandoCierre(true)} bloqueado={cargando}>
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Nombre del evento</span>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Evento Guadalajara" maxLength={200} className={CLASE_INPUT} />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted">Fecha del evento</span>
          <input type="date" value={fecha} min={FECHA_MINIMA_EVENTO} max={hoy} onChange={(e) => setFecha(e.target.value)} className={CLASE_INPUT} />
          {fechaFueraDeRango && <span role="alert" className="block text-xs text-danger">La fecha debe estar entre 2023 y hoy.</span>}
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted">Carpeta de Drive del evento</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input value={enlace} onChange={(e) => { setEnlace(e.target.value); setInfo(null); }} placeholder="https://drive.google.com/drive/folders/…" className={CLASE_INPUT} />
            <button onClick={buscarCarpeta} disabled={!enlace.trim() || cargando} className={CLASE_BOTON}>
              {cargando && !info ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </button>
          </div>
        </label>

        {info && (
          <>
            <p className="flex items-center gap-2 rounded-lg bg-silver/30 px-3 py-2 text-sm text-foreground">
              <Folder className="h-4 w-4 text-primary" /> {info.nombre}
              <span className="min-w-0 break-words text-muted">· {info.subcarpetas.map((s) => `${s.nombre} (${s.archivos})`).join(", ") || "sin subcarpetas"}</span>
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {(["local", "drive"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrigen(o)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${origen === o ? "border-primary bg-primary/10" : "border-silver"}`}
                >
                  <span className="flex items-center gap-1 font-medium">{o === "local" ? <Upload className="h-4 w-4" /> : <Folder className="h-4 w-4" />}{o === "local" ? "Subir desde la computadora" : "Importar fotos de Drive"}</span>
                  <span className="text-xs text-muted">{o === "local" ? "Eliges Completos, Apartados o Interesados y subes las fotos." : "Lee las subcarpetas Completos / Apartados / Interesados."}</span>
                </button>
              ))}
            </div>

            {origen === "local" && (
              <div className="space-y-3">
                <div role="tablist" aria-label="Categoría de las hojas" className="grid gap-2 sm:grid-cols-3">
                  {ESTATUS.map((e) => (
                    <button
                      key={e.value}
                      role="tab"
                      aria-selected={estatus === e.value}
                      onClick={() => setEstatus(e.value)}
                      disabled={cargando}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${estatus === e.value ? "border-primary bg-primary/10" : "border-silver"}`}
                    >
                      <span className="font-medium">{e.carpeta}{archivos[e.value].length > 0 && ` (${archivos[e.value].length})`}</span>
                      <span className="block text-xs text-muted">{e.desc}</span>
                    </button>
                  ))}
                </div>
                <ZonaArchivos archivos={archivos[estatus]} onCambio={(lista) => setArchivos((previos) => ({ ...previos, [estatus]: lista }))} disabled={cargando} />
              </div>
            )}
          </>
        )}

        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button onClick={() => setConfirmandoCierre(true)} disabled={cargando} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40">Cancelar</button>
          <button onClick={crear} disabled={!info || !fecha || fechaFueraDeRango || cargando || (origen === "local" && totalArchivos === 0)} className={CLASE_BOTON}>
            {cargando && info ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear evento"}
          </button>
        </div>
      </div>
      {confirmandoCierre && (
        <ConfirmarModal titulo="Cancelar nuevo evento" textoConfirmar="Sí, cancelar" textoCancelar="Seguir editando" peligro onConfirmar={onCerrar} onCancelar={() => setConfirmandoCierre(false)}>
          ¿Seguro que quieres cancelar? Se perderá lo que capturaste del nuevo evento.
        </ConfirmarModal>
      )}
    </Modal>
  );
}

async function importarDeDrive(eventoId: string, info: InfoCarpeta, enlace: string) {
  for (const sub of info.subcarpetas) {
    const estatus = estatusDeCarpeta(sub.nombre);
    if (!estatus || sub.archivos === 0) continue;
    const r = await api<{ archivos: { id: string; nombre: string; mime: string }[] }>("/api/captura-datos/drive/carpeta", {
      json: { enlace, subcarpetaId: sub.id },
    });
    const archivos = r.archivos
      .filter((a) => a.mime.startsWith("image/") || a.mime === "application/pdf")
      .map((a) => ({ driveId: a.id, nombreOriginal: a.nombre }));
    if (archivos.length) await api(`/api/captura-datos/eventos/${eventoId}/hojas`, { json: { estatus, archivos } });
  }
}
