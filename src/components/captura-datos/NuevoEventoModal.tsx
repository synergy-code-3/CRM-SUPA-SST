"use client";

import { useState } from "react";
import { Folder, Loader2, Upload } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "@/lib/captura-datos/cliente";
import { ESTATUS, estatusDeCarpeta, type Estatus } from "@/lib/captura-datos/fields";
import type { InfoCarpeta } from "@/lib/captura-datos/google";
import type { EventoCaptura, OrigenEvento } from "@/lib/captura-datos/modelo";

const CLASE_INPUT = "w-full rounded-lg border border-silver bg-surface px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2";
const CLASE_BOTON = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50";

export function NuevoEventoModal({ onCerrar, onCreado }: { onCerrar: () => void; onCreado: (e: EventoCaptura) => void }) {
  const [enlace, setEnlace] = useState("");
  const [info, setInfo] = useState<InfoCarpeta | null>(null);
  const [origen, setOrigen] = useState<OrigenEvento>("local");
  const [estatus, setEstatus] = useState<Estatus>("Completo");
  const [nombre, setNombre] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enlaceBuscado, setEnlaceBuscado] = useState(""); // el enlace que produjo `info` (no el que se esté editando)
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
        json: { nombre, estatus, origen, destino: { id: info.id, url: info.url, nombre: info.nombre } },
      })).evento;
      setEventoCreado(evento);
      if (origen === "drive") await importarDeDrive(evento.id, info, enlaceBuscado);
      onCreado(evento);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear el evento.");
      setCargando(false);
    }
  }

  return (
    <Modal titulo="Nuevo evento" onCerrar={onCerrar} bloqueado={cargando}>
      <div className="space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">Carpeta de Drive del evento</span>
          <div className="flex gap-2">
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
              <span className="text-muted">· {info.subcarpetas.map((s) => `${s.nombre} (${s.archivos})`).join(", ") || "sin subcarpetas"}</span>
            </p>

            <div className="grid grid-cols-2 gap-2">
              {(["local", "drive"] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => setOrigen(o)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${origen === o ? "border-primary bg-primary/10" : "border-silver"}`}
                >
                  <span className="flex items-center gap-1 font-medium">{o === "local" ? <Upload className="h-4 w-4" /> : <Folder className="h-4 w-4" />}{o === "local" ? "Subir desde la computadora" : "Importar fotos de Drive"}</span>
                  <span className="text-xs text-muted">{o === "local" ? "Eliges el estatus y subes las fotos después." : "Lee las subcarpetas Completos / Apartados / Interesados."}</span>
                </button>
              ))}
            </div>

            {origen === "local" && (
              <select aria-label="Estatus de las hojas" value={estatus} onChange={(e) => setEstatus(e.target.value as Estatus)} className={CLASE_INPUT}>
                {ESTATUS.map((e) => <option key={e.value} value={e.value}>{e.value} — {e.desc}</option>)}
              </select>
            )}

            <input aria-label="Nombre del evento" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del evento (opcional)" maxLength={200} className={CLASE_INPUT} />
          </>
        )}

        {error && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40">Cancelar</button>
          <button onClick={crear} disabled={!info || cargando} className={CLASE_BOTON}>
            {cargando && info ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear evento"}
          </button>
        </div>
      </div>
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
