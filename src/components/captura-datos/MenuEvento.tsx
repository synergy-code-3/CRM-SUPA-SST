"use client";

import { useEffect, useRef, useState } from "react";
import { CloudUpload, Download, History, MoreVertical, Trash2 } from "lucide-react";
import { AvisoTemporal } from "./AvisoTemporal";
import { BorrarEventoModal } from "./BorrarEventoModal";
import { ConfirmarModal } from "./ConfirmarModal";
import { HistorialModal } from "./HistorialModal";
import { api, ErrorApi } from "@/lib/captura-datos/cliente";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import type { EventoCaptura } from "@/lib/captura-datos/modelo";

type Modo = "drive" | "carpeta" | "historial" | "borrar" | null;

const ITEM = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-silver/40";

/** Menú de tres puntos de la tarjeta de un evento: Guardar en Drive, Excel, Historial y Borrar. */
export function MenuEvento({ evento, porRevisar, onCambio }: { evento: EventoCaptura; porRevisar: number; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<Modo>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; peligro: boolean } | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);

  function abrir(m: Modo) { setAbierto(false); setModo(m); }

  async function guardar(crearCarpeta = false) {
    setModo(null);
    setGuardando(true);
    setAviso(null);
    try {
      await api(`/api/captura-datos/eventos/${evento.id}`, { method: "PATCH", json: { accion: "confirmar", crearCarpeta } });
      setAviso({ texto: "Se subió a Drive correctamente.", peligro: false });
      onCambio();
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409 && err.datos.faltaCarpeta) setModo("carpeta");
      else setAviso({ texto: err instanceof Error ? err.message : "No se pudo guardar en Drive.", peligro: true });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div ref={raiz} className="relative z-10 shrink-0">
      <button onClick={() => setAbierto((a) => !a)} disabled={guardando} aria-label="Más acciones" aria-haspopup="menu" aria-expanded={abierto} className="rounded-lg p-1 text-muted hover:bg-silver/40 disabled:opacity-50">
        <MoreVertical className="h-4 w-4" />
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 top-full mt-1 w-44 overflow-hidden rounded-lg border border-silver bg-surface py-1 shadow-lg">
          <button role="menuitem" onClick={() => abrir("drive")} className={ITEM}><CloudUpload className="h-4 w-4" /> Guardar en Drive</button>
          <a role="menuitem" href={urlExcelEvento(evento.id)} onClick={() => setAbierto(false)} className={ITEM}><Download className="h-4 w-4" /> Excel</a>
          <button role="menuitem" onClick={() => abrir("historial")} className={ITEM}><History className="h-4 w-4" /> Historial</button>
          <button role="menuitem" onClick={() => abrir("borrar")} className={`${ITEM} text-danger`}><Trash2 className="h-4 w-4" /> Borrar evento</button>
        </div>
      )}

      {modo === "drive" && (
        <ConfirmarModal titulo="Guardar en Drive" textoConfirmar="Guardar en Drive" onCancelar={() => setModo(null)} onConfirmar={() => void guardar()}>
          {evento.estado === "abierto" && porRevisar ? `Quedan ${porRevisar} hojas por revisar. ¿Guardar en Drive solo lo confirmado?` : "¿Guardar el evento en Drive?"}
        </ConfirmarModal>
      )}
      {modo === "carpeta" && (
        <ConfirmarModal titulo="Falta la subcarpeta de fotos" textoConfirmar="Crear y continuar" onCancelar={() => setModo(null)} onConfirmar={() => void guardar(true)}>
          Falta la subcarpeta de fotos en Drive. ¿Crearla y continuar?
        </ConfirmarModal>
      )}
      {modo === "historial" && <HistorialModal eventoId={evento.id} titulo={`Historial de ${evento.nombre}`} onCerrar={() => setModo(null)} />}
      {modo === "borrar" && <BorrarEventoModal eventoId={evento.id} nombre={evento.nombre} onCerrar={() => setModo(null)} onBorrado={() => { setModo(null); onCambio(); }} />}
      {aviso && <AvisoTemporal key={aviso.texto} positivo={!aviso.peligro} peligro={aviso.peligro} onCerrar={() => setAviso(null)}>{aviso.texto}</AvisoTemporal>}
    </div>
  );
}
