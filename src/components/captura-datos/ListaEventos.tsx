"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ClipboardList, Download, Plus } from "lucide-react";
import { NuevoEventoModal } from "./NuevoEventoModal";
import { api } from "@/lib/captura-datos/cliente";
import { urlExcelEvento } from "@/lib/captura-datos/enlaces";
import type { ProgresoEvento } from "@/lib/captura-datos/db";
import type { EventoCaptura } from "@/lib/captura-datos/modelo";

type EventoConAvance = EventoCaptura & { progreso: ProgresoEvento };
const POLLING_MS = 15_000;

export function ListaEventos() {
  const [eventos, setEventos] = useState<EventoConAvance[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const cargar = useCallback(() => {
    api<{ eventos: EventoConAvance[] }>("/api/captura-datos/eventos")
      .then((r) => { setEventos(r.eventos); setError(null); })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudieron cargar los eventos."));
  }, []);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, POLLING_MS);
    return () => clearInterval(t);
  }, [cargar]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <ClipboardList className="h-6 w-6 text-primary" strokeWidth={1.75} /> Captura de Datos
          </h1>
          <p className="text-sm text-muted">Hojas de inscripción por evento: lee, revisa y confirma.</p>
        </div>
        <button onClick={() => setCreando(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> Nuevo evento
        </button>
      </div>

      {error && <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>}
      {!eventos && !error && <p className="py-12 text-center text-sm text-muted">Cargando…</p>}
      {eventos?.length === 0 && <p className="py-12 text-center text-sm text-muted">Todavía no hay eventos. Crea el primero.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {eventos?.map((e) => <TarjetaEvento key={e.id} evento={e} />)}
      </div>

      {creando && (
        <NuevoEventoModal
          onCerrar={() => setCreando(false)}
          onCreado={() => { setCreando(false); cargar(); }}
        />
      )}
    </div>
  );
}

function TarjetaEvento({ evento: e }: { evento: EventoConAvance }) {
  const total = e.progreso.pendiente + e.progreso.leida + e.progreso.confirmada;
  const pct = total ? Math.round((e.progreso.confirmada / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-silver bg-surface p-4">
      <Link href={`/captura-datos/${e.id}`} className="block space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-sm font-semibold text-foreground">{e.nombre}</h2>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${e.estado === "confirmado" ? "bg-success/15 text-success" : "bg-primary/10 text-primary"}`}>
            {e.estado === "confirmado" ? "Confirmado" : "Abierto"}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-silver/50">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-muted">{e.progreso.confirmada} de {total} hojas confirmadas · {e.progreso.pendiente + e.progreso.leida} por revisar</p>
      </Link>
      <a href={urlExcelEvento(e.id)} className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Download className="h-3 w-3" /> Excel
      </a>
    </div>
  );
}
