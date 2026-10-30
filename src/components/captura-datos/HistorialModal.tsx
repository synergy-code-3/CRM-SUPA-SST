"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { FiltrosHistorial, hayFiltros, paramsDeFiltros, SIN_FILTROS, type Filtros } from "./FiltrosHistorial";
import { api } from "@/lib/captura-datos/cliente";
import { ETIQUETA_ACCION, ETIQUETA_FILTRO_ACCION, lineasDeDetalle, type AccionAuditoria, type RegistroAuditoria } from "@/lib/captura-datos/historial";

interface HistorialModalProps {
  /** Si se indica, solo los movimientos de ese evento; si no, todos (incluidos los de eventos ya borrados). */
  eventoId?: string;
  titulo?: string;
  onCerrar: () => void;
}

/** Cuando el historial vive en un modal, el título y el cierre los pone el modal. */
export function HistorialModal({ eventoId, titulo = "Historial", onCerrar }: HistorialModalProps) {
  return (
    <Modal titulo={titulo} onCerrar={onCerrar}>
      <HistorialLista eventoId={eventoId} />
    </Modal>
  );
}

/** Color por tipo de movimiento: verde = confirmar/cerrar, ámbar = corregir/reabrir, rojo = borrar, azul = crear/Drive. */
const COLOR_ACCION: Record<AccionAuditoria, { borde: string; punto: string }> = {
  evento_creado: { borde: "border-primary", punto: "bg-primary" },
  evento_guardado_drive: { borde: "border-primary", punto: "bg-primary" },
  evento_cerrado: { borde: "border-success", punto: "bg-success" },
  evento_cerrado_auto: { borde: "border-success", punto: "bg-success" },
  evento_reabierto: { borde: "border-warning", punto: "bg-warning" },
  evento_borrado: { borde: "border-danger", punto: "bg-danger" },
  hoja_confirmada: { borde: "border-success", punto: "bg-success" },
  hoja_corregida: { borde: "border-warning", punto: "bg-warning" },
};
const COLOR_DESCONOCIDO = { borde: "border-silver", punto: "bg-muted" };

interface Pagina {
  registros: RegistroAuditoria[];
  hayMas: boolean;
}

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });
const PAUSA_BUSQUEDA_MS = 250;

/** Lista de movimientos importantes de Captura de Datos (solo admin), por páginas: cada una se pide solo al navegar a ella. */
export function HistorialLista({ eventoId, conFiltros = false }: { eventoId?: string; conFiltros?: boolean }) {
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [indice, setIndice] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS);
  const filtrando = conFiltros && hayFiltros(aplicados);
  const peticion = useRef(0);

  // El texto se aplica con una pausa para no pedir al servidor en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setAplicados(filtros), PAUSA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [filtros]);

  const pedir = useCallback(
    async (antes: number | undefined, previas: Pagina[]) => {
      const esta = ++peticion.current;
      setCargando(true);
      setError(null);
      try {
        const params = filtrando ? paramsDeFiltros(aplicados) : new URLSearchParams();
        if (eventoId) params.set("eventoId", eventoId);
        if (antes !== undefined) params.set("antes", String(antes));
        const pagina = await api<Pagina>(`/api/captura-datos/historial?${params}`);
        if (esta !== peticion.current) return; // llegó tarde: ya hay otra búsqueda en curso
        const todas = [...previas, pagina];
        setPaginas(todas);
        setIndice(todas.length - 1);
      } catch (err) {
        if (esta === peticion.current) setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
      } finally {
        if (esta === peticion.current) setCargando(false);
      }
    },
    [eventoId, filtrando, aplicados]
  );

  // Al cambiar el evento o los filtros se vuelve a la primera página.
  useEffect(() => {
    setPaginas([]);
    void pedir(undefined, []);
  }, [pedir]);

  const actual = paginas[indice];
  const siguiente = () => {
    if (indice < paginas.length - 1) setIndice(indice + 1);
    else if (actual?.hayMas) void pedir(actual.registros[actual.registros.length - 1]?.id, paginas);
  };
  const hayPaginaSiguiente = indice < paginas.length - 1 || !!actual?.hayMas;

  return (
    <div className="space-y-3">
      {conFiltros && <FiltrosHistorial filtros={filtros} onCambio={setFiltros} />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!actual && cargando && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
      {actual?.registros.length === 0 && <p className="py-6 text-center text-sm text-muted">{filtrando ? "Ningún movimiento coincide con los filtros." : "Todavía no hay movimientos registrados."}</p>}

      {actual && actual.registros.length > 0 && (
        <ul className={`divide-y divide-silver/60 ${cargando ? "opacity-50" : ""}`}>
          {actual.registros.map((r) => {
            const detalle = lineasDeDetalle(r);
            const color = COLOR_ACCION[r.accion] ?? COLOR_DESCONOCIDO;
            const titulo = !eventoId && r.eventoNombre ? `${ETIQUETA_FILTRO_ACCION[r.accion] ?? r.accion} ${r.eventoNombre}` : (ETIQUETA_ACCION[r.accion] ?? r.accion);
            return (
              <li key={r.id} className={`space-y-0.5 border-l-4 py-2.5 pl-3 text-sm ${color.borde}`}>
                <p className="flex items-center gap-2 font-medium text-foreground"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color.punto}`} />{titulo}</p>
                {detalle.map((linea, i) => <p key={i} className="break-words text-xs text-foreground">{linea}</p>)}
                <p className="text-xs text-muted">{FECHA.format(new Date(r.en))} · {r.usuarioNombre ?? "Usuario desconocido"}</p>
              </li>
            );
          })}
        </ul>
      )}

      {actual && (indice > 0 || hayPaginaSiguiente) && (
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => setIndice(indice - 1)} disabled={cargando || indice === 0} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm disabled:opacity-50">
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="inline-flex items-center gap-2 text-xs text-muted">{cargando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Página {indice + 1}</span>
          <button onClick={siguiente} disabled={cargando || !hayPaginaSiguiente} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-sm disabled:opacity-50">
            Siguiente <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
