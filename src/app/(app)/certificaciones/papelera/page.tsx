"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Recycle, RotateCcw, ShieldAlert, Trash2 } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { ClienteCertificacion } from "@/lib/certificaciones-tipos";

const PAPELERA_DIAS = 30;

function diasTranscurridos(fecha: string | null): number {
  if (!fecha) return 0;
  return Math.floor((Date.now() - new Date(fecha).getTime()) / (1000 * 60 * 60 * 24));
}

export default function PapeleraCertificacionesPage() {
  const { usuario, cargando } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");
  const [clientes, setClientes] = useState<ClienteCertificacion[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const purgados = useRef<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    const res = await fetch("/api/certificaciones/papelera");
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes);
  }, []);

  useEffect(() => {
    if (puedeGestionar) cargar();
  }, [puedeGestionar, cargar]);

  // Purga oportunista (igual que el CRM original): como no hay tareas
  // programadas, al abrir la papelera se eliminan definitivamente los que ya
  // cumplieron PAPELERA_DIAS días — es lo que promete el aviso de cada fila.
  useEffect(() => {
    if (!clientes) return;
    const vencidos = clientes.filter(
      (c) => !purgados.current.has(c.id) && diasTranscurridos(c.fechaEliminacion) >= PAPELERA_DIAS
    );
    if (vencidos.length === 0) return;
    vencidos.forEach((c) => purgados.current.add(c.id));
    Promise.all(
      vencidos.map((c) =>
        fetch(`/api/certificaciones/${encodeURIComponent(c.id)}/eliminar-permanente`, { method: "POST" })
      )
    )
      .then(cargar)
      .catch(() => {});
  }, [clientes, cargar]);

  async function restaurar(c: ClienteCertificacion) {
    setProcesando(c.id);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(c.id)}/restaurar`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "No se pudo restaurar");
        return;
      }
      await cargar();
    } finally {
      setProcesando(null);
    }
  }

  async function eliminarDefinitivo(c: ClienteCertificacion) {
    if (
      !window.confirm(
        `¿Eliminar definitivamente a "${c.nombre}"? Esta acción no se puede deshacer y se perderá toda su información.`
      )
    )
      return;
    setProcesando(c.id);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(c.id)}/eliminar-permanente`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "No se pudo eliminar");
        return;
      }
      await cargar();
    } finally {
      setProcesando(null);
    }
  }

  if (cargando) return <div className="py-16 text-center text-sm text-muted">Cargando…</div>;

  if (!puedeGestionar) {
    return (
      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core flex flex-col items-center gap-3 rounded-[calc(2rem-0.5rem)] p-16 text-center">
          <ShieldAlert className="h-6 w-6 text-muted" strokeWidth={1.5} />
          <p className="text-sm text-muted">Solo un administrador puede ver la papelera.</p>
        </div>
      </div>
    );
  }

  const visibles = (clientes ?? []).filter((c) => !purgados.current.has(c.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span className="inline-block w-fit rounded-full bg-primary-dim px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-primary-deep">
          Papelera
        </span>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Clientes eliminados</h1>
        <p className="text-sm text-muted">
          Se conservan por {PAPELERA_DIAS} días con toda su información. Puedes restaurarlos tal como estaban o
          eliminarlos definitivamente antes de que se borren solos.
        </p>
      </div>

      <div className="shell rounded-[2rem] p-2 diffused-lg">
        <div className="core rounded-[calc(2rem-0.5rem)] p-2 md:p-3">
          {clientes === null ? (
            <p className="px-6 py-16 text-center text-sm text-muted">Cargando…</p>
          ) : visibles.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
              <Recycle className="h-6 w-6 text-muted" strokeWidth={1.5} />
              <p className="text-sm text-muted">La papelera está vacía.</p>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-silver">
              {visibles.map((c) => {
                const restantes = Math.max(PAPELERA_DIAS - diasTranscurridos(c.fechaEliminacion), 0);
                return (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                      <p className="truncate text-xs text-muted">{c.email || "Sin correo"}</p>
                      <p className="text-xs text-warning">
                        Se elimina definitivamente en {restantes} día{restantes === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex max-w-full flex-wrap items-center gap-2">
                      <button
                        onClick={() => restaurar(c)}
                        disabled={procesando === c.id}
                        className="flex items-center gap-1.5 rounded-full bg-success/10 px-4 py-2 text-xs font-medium text-success transition-all duration-500 ease-spring hover:bg-success/20 active:scale-[0.98] disabled:opacity-50"
                      >
                        {procesando === c.id ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
                        )}
                        Restaurar
                      </button>
                      <button
                        onClick={() => eliminarDefinitivo(c)}
                        disabled={procesando === c.id}
                        className="flex items-center gap-1.5 rounded-full bg-danger/10 px-4 py-2 text-xs font-medium text-danger transition-all duration-500 ease-spring hover:bg-danger/20 active:scale-[0.98] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        Eliminar definitivo
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <Link href="/certificaciones" className="text-xs font-medium text-muted hover:text-primary">
        ← Volver a clientes
      </Link>
    </div>
  );
}
