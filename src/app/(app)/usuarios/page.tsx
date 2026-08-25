"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plus, Trash2, UserRound } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import type { Rol } from "@/lib/permisos";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  creado_en: string;
  ultimo_login: string | null;
};

// Se autoregistró desde /login y nadie lo ha activado todavía — nunca
// inició sesión (ultimo_login sigue null) y sigue desactivado. Se
// distingue así de alguien a quien un admin desactivó a propósito después
// de haber usado el CRM, sin necesidad de una columna aparte.
function esPendienteDeAprobar(u: Usuario): boolean {
  return !u.activo && !u.ultimo_login;
}

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  coordinador: "Coordinador",
  abeja: "Abeja",
};
const ROLES: Rol[] = ["admin", "coordinador", "abeja"];

export default function UsuariosPage() {
  const router = useRouter();
  const { usuario: yo, cargando: cargandoSesion } = useSesion();
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  useEffect(() => {
    if (!cargandoSesion && yo && yo.rol !== "admin") router.replace("/clientes");
  }, [cargandoSesion, yo, router]);

  async function cargar() {
    const res = await fetch("/api/usuarios");
    if (!res.ok) return;
    const data = await res.json();
    setUsuarios(data.usuarios);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function actualizar(id: string, cambios: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/usuarios/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cambios),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar");
      return;
    }
    cargar();
  }

  async function eliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return;
    setError(null);
    const res = await fetch(`/api/usuarios/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar");
      return;
    }
    cargar();
  }

  function resetearPassword(id: string) {
    const nueva = prompt("Nueva contraseña (mínimo 8 caracteres):");
    if (!nueva) return;
    actualizar(id, { nuevaPassword: nueva });
  }

  if (cargandoSesion || !yo || yo.rol !== "admin") return null;

  const pendientes = (usuarios ?? []).filter(esPendienteDeAprobar);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Usuarios</h1>
          <p className="text-sm text-muted">Administra quién entra al CRM y con qué rol.</p>
        </div>
        <button
          onClick={() => setMostrarNuevo(true)}
          className="ease-spring flex items-center gap-1.5 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} />
          Agregar usuario
        </button>
      </div>

      {pendientes.length > 0 && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
          {pendientes.length === 1
            ? "1 cuenta creada desde el formulario de registro está esperando tu aprobación."
            : `${pendientes.length} cuentas creadas desde el formulario de registro están esperando tu aprobación.`}
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">{error}</p>
      )}

      <div className="overflow-hidden rounded-2xl border border-silver">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Correo</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Activo</th>
              <th className="px-4 py-3">Último acceso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {(usuarios ?? []).map((u) => (
              <tr key={u.id} className="border-t border-silver/60">
                <td className="px-4 py-3 font-medium text-foreground">
                  <span className="flex items-center gap-2">
                    <UserRound className="h-4 w-4 text-muted" strokeWidth={1.75} />
                    {u.nombre}
                    {u.id === yo.id && <span className="text-xs text-muted">(tú)</span>}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.rol}
                    onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                    className="rounded-lg border border-silver bg-surface px-2 py-1 text-xs text-foreground outline-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROL_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => actualizar(u.id, { activo: !u.activo })}
                    title={esPendienteDeAprobar(u) ? "Autoregistrado desde /login — actívalo para que pueda entrar" : undefined}
                    className={`ease-spring rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      u.activo
                        ? "bg-success/15 text-success"
                        : esPendienteDeAprobar(u)
                          ? "bg-warning/15 text-warning"
                          : "bg-surface-2 text-muted"
                    }`}
                  >
                    {u.activo ? "Activo" : esPendienteDeAprobar(u) ? "Pendiente de aprobar" : "Desactivado"}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted">
                  {u.ultimo_login ? new Date(u.ultimo_login).toLocaleString("es-MX") : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => resetearPassword(u.id)}
                      title="Restablecer contraseña"
                      className="ease-spring rounded-lg p-1.5 text-muted transition hover:bg-surface-2 hover:text-foreground"
                    >
                      <KeyRound className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                    <button
                      onClick={() => eliminar(u.id, u.nombre)}
                      title="Eliminar usuario"
                      className="ease-spring rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mostrarNuevo && (
        <NuevoUsuarioModal
          onClose={() => setMostrarNuevo(false)}
          onCreado={() => {
            setMostrarNuevo(false);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function NuevoUsuarioModal({ onClose, onCreado }: { onClose: () => void; onCreado: () => void }) {
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<Rol>("abeja");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, email, password, rol }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo crear el usuario");
        return;
      }
      onCreado();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core space-y-3 rounded-[calc(2rem-0.5rem)] p-6">
          <h2 className="text-base font-semibold text-foreground">Agregar usuario</h2>

          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo"
            className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Correo"
            className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña temporal (mín. 8 caracteres)"
            className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
          />
          <select
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            className="w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROL_LABEL[r]}
              </option>
            ))}
          </select>

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="ease-spring flex-1 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              onClick={crear}
              disabled={!nombre.trim() || !email.trim() || password.length < 8 || enviando}
              className="ease-spring flex-1 rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:opacity-40"
            >
              {enviando ? "Creando…" : "Crear"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
