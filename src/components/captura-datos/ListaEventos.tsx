"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Check, ClipboardList, Download, Plus, Trash2, X } from "lucide-react";
import { NuevoEventoModal } from "./NuevoEventoModal";
import { api } from "@/lib/captura-datos/cliente";
import { guardarCache, leerCache } from "@/lib/captura-datos/cache";
import { usePolling } from "@/lib/captura-datos/usePolling";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import { useSesion } from "@/lib/session-context";
import type { ProgresoEvento, SolicitudBorrado } from "@/lib/captura-datos/db";
import type { EventoCaptura } from "@/lib/captura-datos/modelo";

type EventoConAvance = EventoCaptura & { progreso: ProgresoEvento };
const POLLING_MS = 15_000;

export function ListaEventos() {
  const { usuario } = useSesion();
  const [eventos, setEventos] = useState<EventoConAvance[] | null>(() => leerCache<EventoConAvance[]>(usuario?.id, "eventos"));
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [solicitudes, setSolicitudes] = useState<SolicitudBorrado[]>([]);
  const [puedeResolver, setPuedeResolver] = useState(false);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const router = useRouter();
  const esAdmin = usuario?.rol === "admin";

  const cargar = useCallback(() => {
    api<{ eventos: EventoConAvance[] }>("/api/captura-datos/eventos")
      .then((r) => { setEventos(r.eventos); guardarCache(usuario?.id, "eventos", r.eventos); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los eventos."));
    if (esAdmin) {
      api<{ solicitudes: SolicitudBorrado[]; puedeResolver: boolean }>("/api/captura-datos/solicitudes-borrado")
        .then((r) => { setSolicitudes(r.solicitudes); setPuedeResolver(r.puedeResolver); })
        .catch(() => {}); // sin la tabla de solicitudes la lista de eventos sigue funcionando
    }
  }, [esAdmin, usuario?.id]);

  async function resolver(id: string, accion: "aprobar" | "rechazar") {
    setResolviendo(id);
    try {
      await api(`/api/captura-datos/solicitudes-borrado/${id}`, { method: "PATCH", json: { accion } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo resolver la solicitud.");
    } finally {
      setResolviendo(null);
      cargar();
    }
  }

  usePolling(cargar, POLLING_MS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <ClipboardList className="h-6 w-6 text-primary" strokeWidth={1.75} /> Captura de Datos
          </h1>
          <p className="text-sm text-muted">Hojas de inscripción por evento: lee, revisa y confirma.</p>
        </div>
        {esAdmin && (
          <button onClick={() => setCreando(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
            <Plus className="h-4 w-4" /> Nuevo evento
          </button>
        )}
      </div>

      {puedeResolver && solicitudes.length > 0 && (
        <section aria-label="Solicitudes de borrado" className="space-y-2 rounded-2xl border border-danger/30 bg-danger/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Trash2 className="h-4 w-4 text-danger" /> Solicitudes de borrado ({solicitudes.length})</h2>
          <ul className="space-y-2">
            {solicitudes.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-xl border border-silver bg-surface p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0 space-y-0.5">
                  <span className="block break-words font-medium text-foreground">{s.eventoNombre}</span>
                  <span className="block break-words text-xs text-muted">{s.solicitadaPorNombre}: {s.motivo}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <button onClick={() => void resolver(s.id, "rechazar")} disabled={resolviendo !== null} className="inline-flex items-center gap-1 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium disabled:opacity-50"><X className="h-3.5 w-3.5" /> No borrar</button>
                  <button onClick={() => window.confirm(`¿Borrar «${s.eventoNombre}» y todas sus hojas? No se puede deshacer.`) && void resolver(s.id, "aprobar")} disabled={resolviendo !== null} className="inline-flex items-center gap-1 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"><Check className="h-3.5 w-3.5" /> Permitir borrado</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
      {!eventos && !error && <p className="py-12 text-center text-sm text-muted">Cargando…</p>}
      {eventos?.length === 0 && <p className="py-12 text-center text-sm text-muted">{esAdmin ? "Todavía no hay eventos. Crea el primero." : "No tienes eventos asignados."}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {eventos?.map((e) => <TarjetaEvento key={e.id} evento={e} esAdmin={esAdmin} borradoPendiente={solicitudes.some((s) => s.eventoId === e.id)} />)}
      </div>

      {creando && (
        <NuevoEventoModal
          onCerrar={() => setCreando(false)}
          onCreado={(evento) => { setCreando(false); router.push(`/captura-datos/${evento.id}`); }}
        />
      )}
    </div>
  );
}

function TarjetaEvento({ evento: e, esAdmin, borradoPendiente }: { evento: EventoConAvance; esAdmin: boolean; borradoPendiente: boolean }) {
  const total = e.progreso.pendiente + e.progreso.leida + e.progreso.confirmada;
  const pct = total ? Math.round((e.progreso.confirmada / total) * 100) : 0;
  return (
    // Toda la tarjeta navega: el enlace del título se estira (after:inset-0) y el Excel queda por encima para seguir siendo un enlace aparte.
    <div className="relative rounded-2xl border border-silver bg-surface p-4 transition hover:border-primary hover:shadow-md focus-within:border-primary">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold text-foreground">
            <Link href={`/captura-datos/${e.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl after:content-['']">{e.nombre}</Link>
          </h2>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.estado === "confirmado" ? "bg-success/15 text-success" : "bg-primary/10 text-primary"}`}>
            {e.estado === "confirmado" ? "Confirmado" : "Abierto"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-silver/50">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted">{e.progreso.confirmada} de {total} hojas confirmadas · {e.progreso.pendiente + e.progreso.leida} por revisar</p>
        {borradoPendiente && <p className="text-xs font-medium text-danger">Borrado pendiente de aprobación</p>}
      </div>
      {esAdmin && (
        <a href={urlExcelEvento(e.id)} className="relative mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <Download className="h-3 w-3" /> Excel
        </a>
      )}
    </div>
  );
}
