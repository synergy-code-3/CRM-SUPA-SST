"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, LogOut, Camera, UserRound, Plus } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import type { Rol } from "@/lib/permisos";

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  coordinador: "Coordinador",
  abeja: "Abeja",
};

// Perfil autogestionado: cada usuario edita su propio teléfono y foto desde
// aquí (nombre/correo/rol siguen siendo exclusivos de Usuarios, admin). Se
// abre al hacer clic en la tarjeta de cuenta del sidebar, y automáticamente
// una vez al iniciar sesión si falta algo (ver Sidebar.tsx).
export function MiPerfilModal({ onClose }: { onClose: () => void }) {
  const { usuario, refrescar, cerrarSesion } = useSesion();
  const inputRef = useRef<HTMLInputElement>(null);
  // Siempre al menos un input visible, aunque todavía no tenga ningún
  // teléfono guardado.
  const [telefonos, setTelefonos] = useState<string[]>(usuario?.telefonos.length ? usuario.telefonos : [""]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  if (!usuario) return null;

  async function onCambiarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setSubiendoFoto(true);
    setError(null);
    const body = new FormData();
    body.set("archivo", archivo);
    const res = await fetch("/api/perfil/avatar", { method: "POST", body });
    const data = await res.json();
    setSubiendoFoto(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo subir la imagen");
      return;
    }
    await refrescar();
  }

  function cambiarTelefono(i: number, valor: string) {
    setTelefonos((prev) => prev.map((t, idx) => (idx === i ? valor : t)));
  }

  function agregarTelefono() {
    setTelefonos((prev) => [...prev, ""]);
  }

  function quitarTelefono(i: number) {
    setTelefonos((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setGuardado(false);
    const res = await fetch("/api/perfil", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telefonos }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo guardar");
      return;
    }
    await refrescar();
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  }

  const telefonosLimpios = telefonos.map((t) => t.trim()).filter(Boolean);
  const telefonosGuardados = usuario.telefonos.slice().sort();
  const cambioTelefonos = JSON.stringify(telefonosLimpios.slice().sort()) !== JSON.stringify(telefonosGuardados);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/30 p-6 backdrop-blur-[2px]"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Mi perfil</h2>
            <button
              onClick={onClose}
              className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
            >
              <X className="h-4.5 w-4.5" strokeWidth={1.75} />
            </button>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendoFoto}
              className="ease-spring group relative h-20 w-20 overflow-hidden rounded-full border border-silver bg-surface-2 transition disabled:opacity-60"
              title="Cambiar foto"
            >
              {usuario.fotoUrl ? (
                <Image src={usuario.fotoUrl} alt="Foto de perfil" width={80} height={80} unoptimized className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-muted">
                  <UserRound className="h-8 w-8" strokeWidth={1.5} />
                </span>
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 text-white opacity-0 transition group-hover:bg-foreground/40 group-hover:opacity-100">
                <Camera className="h-5 w-5" strokeWidth={1.75} />
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onCambiarFoto}
              className="hidden"
            />
            <p className="text-xs text-muted">{subiendoFoto ? "Subiendo…" : "Toca la foto para cambiarla"}</p>
          </div>

          <div className="mt-5 space-y-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Nombre</span>
              <p className="rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm text-foreground">
                {usuario.nombre}
              </p>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Correo</span>
              <p className="rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm text-foreground">
                {usuario.email}
              </p>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Rol</span>
              <p className="rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm text-foreground">
                {ROL_LABEL[usuario.rol]}
              </p>
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Teléfono(s)</span>
              <div className="space-y-2">
                {telefonos.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      value={t}
                      onChange={(e) => cambiarTelefono(i, e.target.value)}
                      placeholder="Tu teléfono"
                      className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
                    />
                    {telefonos.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitarTelefono(i)}
                        className="ease-spring flex-none rounded-lg p-1.5 text-muted transition hover:bg-danger/10 hover:text-danger"
                        aria-label="Quitar este teléfono"
                      >
                        <X className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={agregarTelefono}
                className="ease-spring mt-2 flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-deep"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.75} />
                Agregar otro número de teléfono
              </button>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-danger">{error}</p>}
          {guardado && <p className="mt-3 text-xs text-success">Guardado.</p>}

          <button
            onClick={guardar}
            disabled={guardando || !cambioTelefonos}
            className="ease-spring mt-4 w-full rounded-xl brand-plate px-4 py-2.5 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {guardando ? "Guardando…" : "Guardar cambios"}
          </button>

          <button
            onClick={cerrarSesion}
            className="ease-spring mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-silver px-4 py-2.5 text-sm font-medium text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
