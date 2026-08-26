"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Library, Trash2, ShieldCheck, History, Menu, X, FileCheck2, Gift, UserRound, SlidersHorizontal } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso, type Accion, type Rol } from "@/lib/permisos";
import type { UsuarioSesion } from "@/lib/auth";
import { useFiltrosMovil } from "@/lib/filtros-movil-context";
import { MiPerfilModal } from "./MiPerfilModal";

// Item "Dashboard"/"Biblioteca"/"Eliminados" quedan solo para admin — el
// pedido original solo especificó "ver clientes y sus perfiles" para
// coordinador/abeja. Para abrirlos a otro rol, agrega el rol a su permiso
// en src/lib/permisos.ts (verDashboard/verBiblioteca/verEliminados).
// contador: qué clave de useConteosPendientes() mostrar como burbuja junto
// al label — solo Solicitudes y Usuarios lo tienen.
const NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permiso: Accion;
  contador?: "solicitudes" | "usuarios";
}[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permiso: "verDashboard" },
  { href: "/clientes", label: "Clientes Club Sinergético", icon: Users, permiso: "verClientes" },
  { href: "/otras-ofertas", label: "Otras Ofertas", icon: Gift, permiso: "verOtrasOfertas" },
  { href: "/solicitudes", label: "Solicitudes", icon: FileCheck2, permiso: "solicitarCliente", contador: "solicitudes" },
  { href: "/actividad", label: "Actividad", icon: History, permiso: "verActividad" },
  { href: "/biblioteca", label: "Biblioteca", icon: Library, permiso: "verBiblioteca" },
  { href: "/eliminados", label: "Eliminados", icon: Trash2, permiso: "verEliminados" },
  { href: "/usuarios", label: "Usuarios", icon: ShieldCheck, permiso: "gestionarUsuarios", contador: "usuarios" },
];

type Conteos = { solicitudes: number; usuarios: number };

const INTERVALO_CONTEOS_MS = 60 * 1000;

// Burbuja de "cosas pendientes por revisar" (solicitudes de cliente nuevo,
// usuarios recién autoregistrados) — solo se consulta si el rol puede
// revisar al menos una de las dos, para no gastar la llamada de más en
// coordinador/abeja (la ruta igual devolvería 0 en ambas).
function useConteosPendientes(usuario: UsuarioSesion | null): Conteos {
  const [conteos, setConteos] = useState<Conteos>({ solicitudes: 0, usuarios: 0 });

  useEffect(() => {
    if (!usuario) return;
    const puedeVerAlgo =
      tienePermiso(usuario.rol, "revisarSolicitudes") || tienePermiso(usuario.rol, "gestionarUsuarios");
    if (!puedeVerAlgo) return;

    let cancelado = false;
    async function cargar() {
      try {
        const res = await fetch("/api/notificaciones/pendientes");
        if (!res.ok || cancelado) return;
        const data = await res.json();
        if (!cancelado) setConteos({ solicitudes: data.solicitudes ?? 0, usuarios: data.usuarios ?? 0 });
      } catch {
        // Sin conteo esta vez — se reintenta solo en el próximo intervalo.
      }
    }
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_CONTEOS_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [usuario]);

  return conteos;
}

function BurbujaConteo({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <span className="ml-auto flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}

const ROL_LABEL: Record<Rol, string> = {
  admin: "Administrador",
  coordinador: "Coordinador",
  abeja: "Abeja",
};

function Marca() {
  return (
    <div className="flex items-center gap-3 px-2">
      <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" priority />
      <div>
        <p className="text-sm font-semibold text-foreground">CRM CS</p>
        <p className="text-xs text-muted">Club Sinergético</p>
      </div>
    </div>
  );
}

// Falta teléfono o foto — mismo criterio que usa Sidebar() para decidir si
// se abre el perfil solo al iniciar sesión.
function perfilIncompleto(usuario: UsuarioSesion): boolean {
  return usuario.telefonos.length === 0 || !usuario.fotoUrl;
}

// Ya no cierra sesión directo — abre "Mi perfil" (editable: teléfono, foto),
// que es donde ahora vive el botón de cerrar sesión.
function CuentaFooter({ onAbrirPerfil }: { onAbrirPerfil: () => void }) {
  const { usuario } = useSesion();
  if (!usuario) return null;
  const incompleto = perfilIncompleto(usuario);
  return (
    <button
      onClick={onAbrirPerfil}
      className="ease-spring mt-auto flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-3 text-left transition hover:bg-silver/60"
    >
      <span className="relative h-10 w-10 flex-none overflow-hidden rounded-full border border-silver bg-surface">
        {usuario.fotoUrl ? (
          <Image src={usuario.fotoUrl} alt="" width={40} height={40} unoptimized className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted">
            <UserRound className="h-5 w-5" strokeWidth={1.5} />
          </span>
        )}
        {incompleto && (
          <span
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-surface-2 bg-warning"
            title="Completa tu perfil"
          />
        )}
      </span>
      <span className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{usuario.nombre}</p>
        <p className="text-xs text-muted">{ROL_LABEL[usuario.rol]}</p>
      </span>
    </button>
  );
}

const PERFIL_MOSTRADO_KEY = "perfilIncompletoMostrado";

export function Sidebar() {
  const pathname = usePathname();
  const { usuario } = useSesion();
  const { config: filtrosPagina } = useFiltrosMovil();
  const [abierto, setAbierto] = useState(false);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const conteos = useConteosPendientes(usuario);

  // Cierra el drawer solo con la navegación (no al abrirlo), para que un
  // clic en un link de menú no deje el drawer abierto detrás de la página
  // nueva.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  // Al iniciar sesión, si falta teléfono o foto, se abre "Mi perfil" una
  // sola vez por sesión de navegador (se puede cerrar sin llenarlo y seguir
  // usando el CRM normal — el punto en el avatar se queda hasta
  // completarlo). Aplica igual a usuarios nuevos que a los que ya existían.
  useEffect(() => {
    if (!usuario || !perfilIncompleto(usuario)) return;
    if (sessionStorage.getItem(PERFIL_MOSTRADO_KEY)) return;
    sessionStorage.setItem(PERFIL_MOSTRADO_KEY, "1");
    setMostrarPerfil(true);
  }, [usuario]);

  if (!usuario) return null;
  const items = NAV.filter((item) => tienePermiso(usuario.rol, item.permiso));

  return (
    <>
      {/* Sidebar fijo — solo md+ (tablet/escritorio). */}
      <aside className="hidden h-screen w-64 flex-none flex-col border-r border-silver/70 bg-surface px-4 py-6 md:flex">
        <div className="mb-8">
          <Marca />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map(({ href, label, icon: Icon, contador }) => {
            const activo = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`ease-spring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  activo ? "bg-primary-dim text-primary-deep" : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <Icon className="h-4.5 w-4.5" strokeWidth={1.75} />
                {label}
                {contador && <BurbujaConteo cantidad={conteos[contador]} />}
              </Link>
            );
          })}
        </nav>
        <CuentaFooter onAbrirPerfil={() => setMostrarPerfil(true)} />
      </aside>

      {/* Barra superior + drawer — solo debajo de md (celular/tablet chica).
          pt extra (además del safe-area del body) para que el logo y el
          botón de menú queden con aire de sobra debajo del notch/Dynamic
          Island, no pegados a él. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-silver/70 bg-surface px-3 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:hidden">
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="ease-spring relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
          {filtrosPagina?.activo && (
            <span
              className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary"
              title="Hay filtros aplicados"
            />
          )}
        </button>
        <Marca />
        <span className="w-9" aria-hidden="true" />
      </header>

      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="animate-slide-in-left relative flex h-full w-72 max-w-[82%] flex-col bg-surface px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <Marca />
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="ease-spring flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {items.map(({ href, label, icon: Icon, contador }) => {
                const activo = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`ease-spring flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                      activo ? "bg-primary-dim text-primary-deep" : "text-muted hover:bg-surface-2 hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                    {label}
                    {contador && <BurbujaConteo cantidad={conteos[contador]} />}
                  </Link>
                );
              })}
            </nav>

            {filtrosPagina && (
              <div className="mb-1 border-t border-silver/70 pt-3">
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Esta página
                </p>
                <button
                  onClick={() => {
                    setAbierto(false);
                    filtrosPagina.onAbrir();
                  }}
                  className="ease-spring flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                >
                  <SlidersHorizontal className="h-5 w-5" strokeWidth={1.75} />
                  Filtros
                  {filtrosPagina.activo && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                      {filtrosPagina.contador}
                    </span>
                  )}
                </button>
              </div>
            )}

            <CuentaFooter onAbrirPerfil={() => setMostrarPerfil(true)} />
          </div>
        </div>
      )}

      {mostrarPerfil && <MiPerfilModal onClose={() => setMostrarPerfil(false)} />}
    </>
  );
}
