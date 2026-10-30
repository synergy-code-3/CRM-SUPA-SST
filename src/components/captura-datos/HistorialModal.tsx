"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { Modal } from "./Modal";
import { FiltrosHistorial, hayFiltros, paramsDeFiltros, SIN_FILTROS, type Filtros } from "./FiltrosHistorial";
import { guardarCache, leerCache } from "@/lib/captura-datos/cache";
import { api } from "@/lib/captura-datos/cliente";
import { ETIQUETA_ACCION, lineasDeDetalle, type AccionAuditoria, type RegistroAuditoria } from "@/lib/captura-datos/historial";

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

interface CacheHistorial {
  registros: RegistroAuditoria[];
  hayMas: boolean;
}

const FECHA = new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short" });

/** Lista de movimientos importantes de Captura de Datos (solo admin): lo más reciente primero, con "Ver más". */
export function HistorialLista({ eventoId, conFiltros = false }: { eventoId?: string; conFiltros?: boolean }) {
  const { usuario } = useSesion();
  const nombreCache = `historial:${eventoId ?? "todo"}`;
  const [registros, setRegistros] = useState<RegistroAuditoria[] | null>(() => leerCache<CacheHistorial>(usuario?.id, nombreCache)?.registros ?? null);
  const [hayMas, setHayMas] = useState(() => leerCache<CacheHistorial>(usuario?.id, nombreCache)?.hayMas ?? false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(SIN_FILTROS);
  const [aplicados, setAplicados] = useState<Filtros>(SIN_FILTROS);
  const filtrando = conFiltros && hayFiltros(aplicados);
  const visibles = useRef<RegistroAuditoria[]>([]);
  const peticion = useRef(0);
  visibles.current = registros ?? [];

  // El texto se aplica con una pausa para no pedir al servidor en cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setAplicados(filtros), 350);
    return () => clearTimeout(t);
  }, [filtros]);

  const cargar = useCallback(
    async (antes?: number) => {
      const esta = ++peticion.current;
      setCargando(true);
      setError(null);
      try {
        const params = filtrando ? paramsDeFiltros(aplicados) : new URLSearchParams();
        if (eventoId) params.set("eventoId", eventoId);
        if (antes !== undefined) params.set("antes", String(antes));
        const r = await api<{ registros: RegistroAuditoria[]; hayMas: boolean }>(`/api/captura-datos/historial?${params}`);
        // Con filtros no se usa la caché: solo guarda el historial completo.
        const previa = filtrando ? { registros: visibles.current, hayMas: false } : leerCache<CacheHistorial>(usuario?.id, nombreCache);
        const siguiente: CacheHistorial = antes === undefined ? r : { registros: [...(previa?.registros ?? []), ...r.registros], hayMas: r.hayMas };
        if (esta !== peticion.current) return; // llegó tarde: ya hay otra búsqueda en curso
        if (!filtrando) guardarCache(usuario?.id, nombreCache, siguiente);
        setRegistros(siguiente.registros);
        setHayMas(siguiente.hayMas);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el historial.");
      } finally {
        if (esta === peticion.current) setCargando(false);
      }
    },
    [eventoId, nombreCache, usuario?.id, filtrando, aplicados]
  );

  // Con caché solo se pide lo posterior al último movimiento visto; sin caché, la primera página.
  useEffect(() => {
    const cache = filtrando ? null : leerCache<CacheHistorial>(usuario?.id, nombreCache);
    if (!cache) {
      void cargar();
      return;
    }
    peticion.current++; // descarta respuestas pendientes de una búsqueda con filtros
    setRegistros(cache.registros);
    setHayMas(cache.hayMas);
    const desde = cache.registros[0]?.id ?? 0;
    const params = new URLSearchParams({ desde: String(desde) });
    if (eventoId) params.set("eventoId", eventoId);
    api<{ registros: RegistroAuditoria[] }>(`/api/captura-datos/historial?${params}`)
      .then((r) => {
        if (r.registros.length === 0) return;
        const actualizado = { ...cache, registros: [...r.registros, ...cache.registros] };
        guardarCache(usuario?.id, nombreCache, actualizado);
        setRegistros(actualizado.registros);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo actualizar el historial."));
  }, [cargar, eventoId, nombreCache, usuario?.id, filtrando]);

  const ultimo = registros?.[registros.length - 1];

  return (
    <div className="space-y-3">
      {conFiltros && <FiltrosHistorial filtros={filtros} onCambio={setFiltros} />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!registros && !error && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
      {registros?.length === 0 && <p className="py-6 text-center text-sm text-muted">{filtrando ? "Ningún movimiento coincide con los filtros." : "Todavía no hay movimientos registrados."}</p>}

      {registros && registros.length > 0 && (
        <ul className="divide-y divide-silver/60">
          {registros.map((r) => {
            const detalle = lineasDeDetalle(r);
            const color = COLOR_ACCION[r.accion] ?? COLOR_DESCONOCIDO;
            return (
              <li key={r.id} className={`space-y-0.5 border-l-4 py-2.5 pl-3 text-sm ${color.borde}`}>
                <p className="flex items-center gap-2 font-medium text-foreground"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${color.punto}`} />{ETIQUETA_ACCION[r.accion] ?? r.accion}</p>
                {!eventoId && r.eventoNombre && <p className="text-xs text-foreground">Evento: {r.eventoNombre}</p>}
                {detalle.map((linea, i) => <p key={i} className="break-words text-xs text-foreground">{linea}</p>)}
                <p className="text-xs text-muted">{FECHA.format(new Date(r.en))} · {r.usuarioNombre ?? "Usuario desconocido"}</p>
              </li>
            );
          })}
        </ul>
      )}

      {hayMas && ultimo && (
        <button onClick={() => void cargar(ultimo.id)} disabled={cargando} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-silver px-4 py-2 text-sm disabled:opacity-50">
          {cargando && <Loader2 className="h-4 w-4 animate-spin" />} Ver más
        </button>
      )}
    </div>
  );
}
