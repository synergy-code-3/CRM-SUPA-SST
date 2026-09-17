"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { X, LogOut, Camera, UserRound, Plus, Sun, Moon, MonitorSmartphone, Expand } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { useTema, type Tema } from "@/lib/theme-context";
import type { Rol } from "@/lib/permisos";
import { FotoAmpliada } from "./FotoAmpliada";

const OPCIONES_TEMA: { valor: Tema; label: string; icon: typeof Sun }[] = [
  { valor: "light", label: "Claro", icon: Sun },
  { valor: "dark", label: "Oscuro", icon: Moon },
  { valor: "system", label: "Automático", icon: MonitorSmartphone },
];

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  coordinador: "Coordinador",
  abeja: "Abeja",
};

// Mismo límite que valida /api/perfil/avatar (storage.ts) — se revisa aquí
// TAMBIÉN antes de subir para no mandar el archivo completo cuando ya se
// sabe que el server lo va a rechazar. Fotos de celular sin comprimir
// suelen pasar de esto fácil, y una foto así de pesada puede además chocar
// con el límite de tamaño de petición de la plataforma (Vercel) ANTES de
// llegar a nuestro código — ahí la respuesta ni siquiera es JSON, por eso
// el try/catch de abajo es necesario (sin él, "Subiendo…" se quedaba
// pegado para siempre sin avisar nada).
const TAMANO_MAXIMO_AVATAR_BYTES = 4 * 1024 * 1024;

// Perfil autogestionado: cada usuario edita su propio teléfono y foto desde
// aquí (nombre/correo/rol siguen siendo exclusivos de Usuarios, admin). Se
// abre al hacer clic en la tarjeta de cuenta del sidebar.
//
// bloqueante=true: modo del gate obligatorio (ver PerfilObligatorio.tsx) —
// sin botón de cerrar ni clic afuera para descartar, porque en ese caso no
// hay nada detrás a lo que volver (AppLayout no monta el Sidebar hasta que
// el perfil quede completo). El usuario solo puede completar su perfil o
// cerrar sesión.
export function MiPerfilModal({ onClose, bloqueante = false }: { onClose: () => void; bloqueante?: boolean }) {
  const { usuario, refrescar, cerrarSesion } = useSesion();
  const { tema, setTema } = useTema();
  const inputRef = useRef<HTMLInputElement>(null);
  // Siempre al menos un input visible, aunque todavía no tenga ningún
  // teléfono guardado.
  const [telefonos, setTelefonos] = useState<string[]>(usuario?.telefonos.length ? usuario.telefonos : [""]);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  if (!usuario) return null;

  async function onCambiarFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    // Se limpia de inmediato para poder volver a elegir el mismo archivo si
    // hay que reintentar (si no, un segundo intento con la misma foto no
    // dispara onChange porque el input no "cambió").
    e.target.value = "";
    if (!archivo) return;

    if (archivo.size > TAMANO_MAXIMO_AVATAR_BYTES) {
      setError("La imagen pesa más de 4 MB — comprime la foto o toma una nueva con menos resolución");
      return;
    }

    setSubiendoFoto(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("archivo", archivo);
      const res = await fetch("/api/perfil/avatar", { method: "POST", body });
      // Una petición rechazada antes de llegar a nuestro código (ej. límite
      // de tamaño de la plataforma) no siempre responde JSON — sin este
      // catch, res.json() tronaba sin avisar y "Subiendo…" se quedaba
      // pegado para siempre.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "No se pudo subir la imagen — puede que pese demasiado, intenta con una más ligera");
        return;
      }
      await refrescar();
    } catch {
      setError("No se pudo subir la imagen — revisa tu conexión e intenta de nuevo");
    } finally {
      setSubiendoFoto(false);
    }
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
      onClick={(e) => !bloqueante && e.target === e.currentTarget && onClose()}
    >
      <div className="shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in">
        <div className="core max-h-[90vh] overflow-y-auto rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Mi perfil</h2>
            {!bloqueante && (
              <button
                onClick={onClose}
                className="ease-spring rounded-full p-1.5 text-muted transition hover:bg-surface-2"
              >
                <X className="h-4.5 w-4.5" strokeWidth={1.75} />
              </button>
            )}
          </div>

          {bloqueante && (
            <p className="-mt-2 mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs text-danger">
              Ya agotaste tus sesiones sin completar tu perfil — necesito que subas tu foto y confirmes tu teléfono
              para seguir usando el CRM.
            </p>
          )}

          <div className="flex flex-col items-center gap-2">
            <div className="relative">
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
              {usuario.fotoUrl && (
                <button
                  type="button"
                  onClick={() => setFotoAmpliada(true)}
                  title="Ver foto en grande"
                  className="ease-spring absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-silver bg-surface text-muted shadow-sm transition hover:text-foreground"
                >
                  <Expand className="h-3 w-3" strokeWidth={2} />
                </button>
              )}
            </div>
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
              <span className="block text-xs font-medium text-muted">Teléfono(s)</span>
              <span className="mb-1 block text-[11px] text-muted/80">Todos los números que usas para trabajar</span>
              {/* Alto máximo + scroll interno — antes esta lista crecía sin
                  límite y, con varios números, empujaba el botón de
                  "Guardar" fuera de la pantalla (le pasaba a las abejas que
                  usan muchos teléfonos). El botón de "Agregar" se queda
                  fuera de esta cajita, siempre visible. */}
              <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
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

            <div>
              <span className="mb-1 block text-xs font-medium text-muted">Tema</span>
              <div className="flex gap-1.5 rounded-lg border border-silver bg-surface-2 p-1">
                {OPCIONES_TEMA.map(({ valor, label, icon: Icon }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => setTema(valor)}
                    className={`ease-spring flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition ${
                      tema === valor ? "bg-surface text-primary-deep shadow-sm" : "text-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>
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

      {fotoAmpliada && usuario.fotoUrl && (
        <FotoAmpliada url={usuario.fotoUrl} alt={usuario.nombre} onClose={() => setFotoAmpliada(false)} />
      )}
    </div>
  );
}
