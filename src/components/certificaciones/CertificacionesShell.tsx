"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import {
  Bell,
  ChevronsUpDown,
  FileCheck2,
  History,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso, type Accion } from "@/lib/permisos";
import { AvisoPendienteModal, useAvisosPendientes, useConteosPendientes, type Conteos } from "@/components/Sidebar";
import { MiPerfilModal } from "@/components/MiPerfilModal";

// Shell propio de Certificaciones (Legendar-IA): réplica del CRM original —
// sidebar de tarjetas flotantes + barra superior con la pastilla de la
// certificación y la campana. Reemplaza al Sidebar del Club solo bajo
// /certificaciones (ver (app)/layout.tsx); el Club queda intacto.
type ItemNav = {
  href: string;
  label: string;
  icon: typeof LayoutGrid;
  permiso: Accion;
  contador?: keyof Conteos;
  // Rutas cuyo contenido vive en otra página del CRM (Usuarios, Avisos):
  // siempre coinciden por pathname exacto.
  exacto?: boolean;
};

const NAV: ItemNav[] = [
  { href: "/certificaciones", label: "Clientes", icon: LayoutGrid, permiso: "verCertificaciones", exacto: true },
  { href: "/certificaciones/nuevo", label: "Nuevo cliente", icon: UserPlus, permiso: "gestionarCertificaciones" },
  { href: "/certificaciones/importar", label: "Importar CSV", icon: UploadCloud, permiso: "gestionarCertificaciones" },
  { href: "/certificaciones/papelera", label: "Papelera", icon: Trash2, permiso: "gestionarCertificaciones" },
  {
    href: "/certificaciones/solicitudes",
    label: "Solicitudes",
    icon: FileCheck2,
    permiso: "solicitarCertificacion",
    contador: "solicitudesCertificacion",
  },
  { href: "/certificaciones/tags", label: "Tags", icon: Tag, permiso: "gestionarCertificaciones" },
  { href: "/certificaciones/actividad", label: "Actividad", icon: History, permiso: "gestionarCertificaciones" },
  { href: "/usuarios", label: "Usuarios", icon: Users, permiso: "gestionarUsuarios", contador: "usuarios" },
  { href: "/avisos", label: "Dar avisos", icon: Megaphone, permiso: "gestionarAvisos" },
  { href: "/avisos", label: "Avisos", icon: Bell, permiso: "verAvisos", contador: "avisos" },
  { href: "/avisos", label: "Actualizaciones", icon: Sparkles, permiso: "gestionarAvisos" },
];

function esActivo(item: ItemNav, indice: number, items: ItemNav[], pathname: string): boolean {
  if (pathname !== item.href) return false;
  // Varios ítems apuntan a la misma página (/avisos): solo el primero se
  // marca como activo, para no iluminar tres a la vez.
  return items.findIndex((i) => i.href === item.href) === indice;
}

function Burbuja({ cantidad, activo }: { cantidad: number; activo: boolean }) {
  if (cantidad <= 0) return null;
  return (
    <span
      className={`ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        activo ? "bg-white/20 text-white" : "bg-danger text-white"
      }`}
    >
      {cantidad > 99 ? "99+" : cantidad}
    </span>
  );
}

function ListaNav({
  items,
  pathname,
  conteos,
  onNavegar,
}: {
  items: ItemNav[];
  pathname: string;
  conteos: Conteos;
  onNavegar?: () => void;
}) {
  return (
    <>
      {items.map((item, i) => {
        const activo = esActivo(item, i, items, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            onClick={onNavegar}
            className={`group flex flex-none items-center gap-3 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition-all duration-500 ease-spring ${
              activo
                ? "bg-primary text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)]"
                : "text-muted hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Icon
              className={`h-4 w-4 flex-none transition-transform duration-500 ease-spring group-hover:translate-x-0.5 ${
                activo ? "text-white" : "text-muted"
              }`}
              strokeWidth={1.5}
            />
            {item.label}
            {item.contador && <Burbuja cantidad={conteos[item.contador]} activo={activo} />}
          </Link>
        );
      })}
    </>
  );
}

// Mismo switcher que el logo del Club (chevrons arriba a la derecha): cambia de
// workspace. Solo para quien puede ver Clientes del Club.
function CambiarAlClub() {
  return (
    <Link
      href="/clientes"
      aria-label="Cambiar a Club Sinergético"
      title="Cambiar a Club Sinergético"
      className="ease-spring absolute right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
    >
      <ChevronsUpDown className="h-4 w-4" strokeWidth={1.75} />
    </Link>
  );
}

function BotonCampana({ cantidad }: { cantidad: number }) {
  return (
    <Link
      href="/avisos"
      aria-label="Avisos"
      title="Avisos"
      className="relative flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl border border-silver-deep/60 bg-surface-2 text-muted transition-all duration-500 ease-spring hover:text-primary md:h-11 md:w-11"
    >
      <Bell className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
      {cantidad > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
          {cantidad > 9 ? "9+" : cantidad}
        </span>
      )}
    </Link>
  );
}

function BarraCertificacion({ cantidadAvisos }: { cantidadAvisos: number }) {
  return (
    <div className="shell rounded-[1.75rem] p-2 diffused">
      <div className="core flex flex-nowrap items-center gap-2 overflow-x-auto rounded-[calc(1.75rem-0.5rem)] p-2 md:flex-wrap md:overflow-visible">
        <Link
          href="/certificaciones"
          className="flex h-11 flex-none items-center overflow-visible rounded-2xl bg-primary px-4 shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring"
        >
          <span className="relative h-24 w-32 flex-none">
            <Image src="/certificaciones/legendar-ia-logo.png" alt="Legendar-IA" fill sizes="128px" className="object-contain" />
          </span>
        </Link>
        <span
          title="Agregar certificación (próximamente)"
          className="flex h-11 flex-none cursor-not-allowed items-center gap-1.5 rounded-2xl border border-dashed border-silver-deep/60 px-3 py-2.5 text-xs font-medium text-muted/60"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          Agregar
        </span>
        <div className="ml-auto hidden md:flex">
          <BotonCampana cantidad={cantidadAvisos} />
        </div>
      </div>
    </div>
  );
}

export function CertificacionesShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { usuario, cerrarSesion } = useSesion();
  const conteos = useConteosPendientes(usuario);
  const { avisoActual, quitarDeLaCola } = useAvisosPendientes(usuario);
  const [drawerAbierto, setDrawerAbierto] = useState(false);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);

  useEffect(() => {
    setDrawerAbierto(false);
  }, [pathname]);

  if (!usuario) return null;

  const items = NAV.filter((i) => tienePermiso(usuario.rol, i.permiso));
  const puedeIrAlClub = tienePermiso(usuario.rol, "verClientes");
  const inicial = usuario.nombre.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-screen bg-background bg-mesh">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-4 pb-8 md:flex-row md:gap-6 md:px-8 md:pb-10">
        {/* Cabecera móvil: menú + logo + campana */}
        <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-3 bg-background px-4 pb-3 pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] md:hidden">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setDrawerAbierto(true)}
              aria-label="Abrir menú"
              className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-2xl border border-silver-deep/60 bg-surface-2 text-muted"
            >
              <Menu className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <div className="relative h-[52px] flex-1">
              <Link
                href="/certificaciones"
                className="relative block h-full w-full overflow-hidden rounded-2xl bg-white p-1.5 shadow-[0_10px_24px_-10px_rgba(11,18,32,0.35)]"
              >
                <Image
                  src="/certificaciones/certificaciones-logo-full.png"
                  alt="Certificaciones oficiales"
                  fill
                  sizes="300px"
                  className="object-contain"
                />
              </Link>
              {puedeIrAlClub && <CambiarAlClub />}
            </div>
            <BotonCampana cantidad={conteos.avisos} />
          </div>
          <BarraCertificacion cantidadAvisos={conteos.avisos} />
        </div>

        {/* Sidebar de escritorio: 3 tarjetas flotantes */}
        <aside className="hidden w-full flex-col gap-4 md:sticky md:top-[calc(env(safe-area-inset-top,0px)+2.5rem)] md:flex md:max-h-[calc(100vh-2.5rem-env(safe-area-inset-top,0px)-1.5rem)] md:w-64 md:flex-none">
          <div className="relative flex-none">
            <Link
              href="/certificaciones"
              className="flex h-[84px] w-full items-center justify-center overflow-hidden rounded-[1.5rem] bg-white shadow-[0_10px_24px_-10px_rgba(11,18,32,0.35)] transition-transform duration-500 ease-spring active:scale-[0.98]"
            >
              <Image
                src="/certificaciones/certificaciones-logo-full.png"
                alt="Certificaciones oficiales"
                width={184}
                height={58}
                priority
              />
            </Link>
            {puedeIrAlClub && <CambiarAlClub />}
          </div>

          <div className="shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] p-2 diffused">
            <nav className="core flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto rounded-[calc(1.75rem-0.5rem)] p-2">
              <ListaNav items={items} pathname={pathname} conteos={conteos} />
            </nav>
          </div>

          <TarjetaUsuario
            nombre={usuario.nombre}
            rol={usuario.rol}
            inicial={inicial}
            onPerfil={() => setMostrarPerfil(true)}
            onCerrarSesion={cerrarSesion}
          />
        </aside>

        <main className="min-w-0 flex-1 pt-6 md:pt-0">
          <div className="hidden md:sticky md:top-0 md:z-30 md:mb-6 md:block md:bg-background md:pb-2 md:pt-[calc(env(safe-area-inset-top,0px)+2.5rem)]">
            <BarraCertificacion cantidadAvisos={conteos.avisos} />
          </div>
          <div key={pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Drawer móvil */}
      {drawerAbierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in-fast bg-black/40" onClick={() => setDrawerAbierto(false)} />
          <div className="animate-fade-in absolute left-0 top-0 flex h-full w-72 max-w-[80vw] flex-col gap-4 bg-surface p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setDrawerAbierto(false);
                  setMostrarPerfil(true);
                }}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-sm font-semibold text-white"
              >
                {inicial}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{usuario.nombre}</p>
                <p className="text-[10px] uppercase tracking-wider text-muted">{usuario.rol}</p>
              </div>
              <button
                onClick={() => setDrawerAbierto(false)}
                aria-label="Cerrar menú"
                className="flex h-9 w-9 flex-none items-center justify-center rounded-xl border border-silver-deep/60 bg-surface-2 text-muted"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
              <ListaNav items={items} pathname={pathname} conteos={conteos} onNavegar={() => setDrawerAbierto(false)} />
            </nav>
            <button
              onClick={cerrarSesion}
              className="flex items-center justify-center gap-2 rounded-xl border border-silver-deep/60 bg-surface-2 py-2.5 text-xs font-medium text-muted hover:text-danger"
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {mostrarPerfil && <MiPerfilModal onClose={() => setMostrarPerfil(false)} />}
      {avisoActual && <AvisoPendienteModal aviso={avisoActual} onCerrar={() => quitarDeLaCola(avisoActual.id)} />}
    </div>
  );
}

function TarjetaUsuario({
  nombre,
  rol,
  inicial,
  onPerfil,
  onCerrarSesion,
}: {
  nombre: string;
  rol: string;
  inicial: string;
  onPerfil: () => void;
  onCerrarSesion: () => void;
}) {
  return (
    <div className="shell flex-none rounded-[1.75rem] p-2 diffused">
      <div className="core flex flex-col gap-3 rounded-[calc(1.75rem-0.5rem)] p-4">
        <button onClick={onPerfil} title="Mi perfil" className="flex items-center gap-3 text-left">
          <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-deep text-sm font-semibold text-white shadow-[0_6px_16px_-6px_rgba(10,92,255,0.5)]">
            {inicial}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{nombre}</span>
            <span className="block text-[11px] uppercase tracking-wider text-muted">{rol}</span>
          </span>
        </button>
        <button
          onClick={onCerrarSesion}
          className="group flex items-center justify-center gap-2 rounded-xl border border-silver-deep/60 bg-surface-2 py-2 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:border-danger/30 hover:text-danger active:scale-[0.98]"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={1.75} />
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
