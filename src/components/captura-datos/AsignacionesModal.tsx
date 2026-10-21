"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { api } from "@/lib/captura-datos/cliente";

interface UsuarioLista {
  id: string;
  nombre: string;
  rol: string;
  activo: boolean;
}

/** Quién trabaja el evento. Solo admin (usa /api/usuarios para listar a las personas). */
export function AsignacionesModal({ eventoId, onCerrar }: { eventoId: string; onCerrar: () => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioLista[] | null>(null);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ usuarios: UsuarioLista[] }>("/api/usuarios"),
      api<{ usuariosAsignados: string[] }>(`/api/captura-datos/eventos/${eventoId}/asignaciones`),
    ])
      .then(([u, a]) => {
        setUsuarios(u.usuarios.filter((x) => x.activo));
        setElegidos(new Set(a.usuariosAsignados));
      })
      .catch((err) => setError(err instanceof Error ? err.message : "No se pudo cargar la lista."));
  }, [eventoId]);

  function alternar(id: string) {
    setElegidos((previo) => {
      const nuevo = new Set(previo);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await api(`/api/captura-datos/eventos/${eventoId}/asignaciones`, { method: "PUT", json: { usuariosAsignados: [...elegidos] } });
      onCerrar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Personas asignadas al evento" onCerrar={onCerrar}>
      <div className="space-y-3">
        {!usuarios && !error && <p className="py-6 text-center text-sm text-muted">Cargando…</p>}
        <ul className="max-h-72 space-y-1 overflow-y-auto">
          {usuarios?.map((u) => (
            <li key={u.id}>
              <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-silver/30">
                <input type="checkbox" checked={elegidos.has(u.id)} onChange={() => alternar(u.id)} />
                <span className="text-foreground">{u.nombre}</span>
                <span className="text-xs text-muted">{u.rol}</span>
              </label>
            </li>
          ))}
        </ul>
        {error && <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="rounded-lg px-4 py-2 text-sm text-muted hover:bg-silver/40">Cancelar</button>
          <button onClick={guardar} disabled={!usuarios || guardando} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {guardando && <Loader2 className="h-4 w-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
