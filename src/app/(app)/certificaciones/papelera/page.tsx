"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import type { ClienteCertificacion } from "@/lib/certificaciones-tipos";

export default function PapeleraCertificacionesPage() {
  const [clientes, setClientes] = useState<ClienteCertificacion[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/certificaciones/papelera");
    if (!res.ok) return;
    const data = await res.json();
    setClientes(data.clientes);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function restaurar(id: string) {
    setProcesando(id);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(id)}/restaurar`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "No se pudo restaurar");
        return;
      }
      cargar();
    } finally {
      setProcesando(null);
    }
  }

  async function eliminarPermanente(id: string) {
    if (!confirm("¿Eliminar definitivamente? Esto no se puede deshacer.")) return;
    setProcesando(id);
    try {
      const res = await fetch(`/api/certificaciones/${encodeURIComponent(id)}/eliminar-permanente`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "No se pudo eliminar");
        return;
      }
      cargar();
    } finally {
      setProcesando(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Papelera — Certificaciones</h1>
        <p className="text-sm text-muted">
          <Link href="/certificaciones" className="text-primary hover:underline">
            ← Volver a Certificaciones
          </Link>
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-silver">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Eliminado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {clientes !== null && clientes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  La papelera está vacía.
                </td>
              </tr>
            )}
            {(clientes ?? []).map((c) => (
              <tr key={c.id} className="border-t border-silver/60">
                <td className="px-4 py-3 font-medium text-foreground">{c.nombre}</td>
                <td className="px-4 py-3 text-muted">{c.email ?? "—"}</td>
                <td className="px-4 py-3 text-muted">
                  {c.fechaEliminacion ? new Date(c.fechaEliminacion).toLocaleDateString("es-MX") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => restaurar(c.id)}
                      disabled={procesando === c.id}
                      className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Restaurar
                    </button>
                    <button
                      onClick={() => eliminarPermanente(c.id)}
                      disabled={procesando === c.id}
                      className="ease-spring flex items-center gap-1.5 rounded-lg border border-danger/40 px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Eliminar definitivo
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
