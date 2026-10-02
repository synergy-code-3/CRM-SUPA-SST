"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LayoutDashboard, Users, Library, Trash2, ShieldCheck, History, Menu, X, FileCheck2, Gift, UserRound, SlidersHorizontal, Link2, Check, Megaphone, AlertTriangle, ChevronDown, ChevronsUpDown, UserPlus, UploadCloud, Tag, BarChart3, Flag, Facebook, Instagram, Music2, GraduationCap, Clock } from "lucide-react";
import type { Aviso } from "@/lib/types";
import type { ItemReciente, Plataforma } from "@/lib/community-manager";
import { useSesion } from "@/lib/session-context";
import { tienePermiso, type Accion, type Rol } from "@/lib/permisos";
import type { UsuarioSesion } from "@/lib/auth";
import { useFiltrosMovil } from "@/lib/filtros-movil-context";
import { useCertificacionActualOpcional } from "@/lib/certificacion-actual-context";
import { perfilIncompleto } from "@/lib/perfil";
import { MiPerfilModal } from "./MiPerfilModal";

// Item "Dashboard"/"Biblioteca"/"Eliminados" quedan solo para admin — el
// pedido original solo especificó "ver clientes y sus perfiles" para
// coordinador/abeja. Para abrirlos a otro rol, agrega el rol a su permiso
// en src/lib/permisos.ts (verDashboard/verBiblioteca/verEliminados).
// contador: qué clave de useConteosPendientes() mostrar como burbuja junto
// al label — solo Solicitudes y Usuarios lo tienen.
type ItemNav = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  permiso: Accion;
  contador?: "solicitudes" | "solicitudesCertificacion" | "usuarios" | "avisos";
};

const NAV_CLUB: ItemNav[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, permiso: "verDashboard" },
  { href: "/clientes", label: "Clientes Club Sinergético", icon: Users, permiso: "verClientes" },
  { href: "/otras-ofertas", label: "Otras Ofertas", icon: Gift, permiso: "verOtrasOfertas" },
  { href: "/solicitudes", label: "Solicitudes", icon: FileCheck2, permiso: "solicitarCliente", contador: "solicitudes" },
  { href: "/actividad", label: "Actividad", icon: History, permiso: "verActividad" },
  { href: "/biblioteca", label: "Biblioteca", icon: Library, permiso: "verBiblioteca" },
  { href: "/eliminados", label: "Eliminados", icon: Trash2, permiso: "verEliminados" },
  { href: "/usuarios", label: "Usuarios", icon: ShieldCheck, permiso: "gestionarUsuarios", contador: "usuarios" },
  { href: "/avisos", label: "Avisos", icon: Megaphone, permiso: "verAvisos", contador: "avisos" },
];

// Nav de Community Manager: a diferencia de NAV_CLUB/NAV_CERTIFICACIONES
// (lista plana), esta sección tiene 2 grupos principales (Estadísticas y
// Moderación) con las mismas 4 redes anidadas debajo de cada uno — ver
// GrupoNav/NavComunityManager más abajo. El permiso ya lo filtra el
// workspace completo (verCommunityManager en WORKSPACES), así que aquí no
// hace falta repetirlo por ítem.
type SubItemNav = { href: string; label: string; icon: typeof LayoutDashboard };
type GrupoNav = { href: string; label: string; icon: typeof LayoutDashboard; hijos: SubItemNav[] };

const REDES_COMMUNITY_MANAGER: { id: string; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "facebook", label: "Facebook", icon: Facebook },
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "tiktok", label: "TikTok", icon: Music2 },
  { id: "skool", label: "Skool", icon: GraduationCap },
];

const ICONO_POR_PLATAFORMA: Record<Plataforma, typeof LayoutDashboard> = Object.fromEntries(
  REDES_COMMUNITY_MANAGER.map((r) => [r.id, r.icon])
) as Record<Plataforma, typeof LayoutDashboard>;

const GRUPOS_COMMUNITY_MANAGER: GrupoNav[] = [
  {
    href: "/community-manager",
    label: "Estadísticas",
    icon: BarChart3,
    hijos: REDES_COMMUNITY_MANAGER.map((r) => ({ href: `/community-manager/${r.id}`, label: r.label, icon: r.icon })),
  },
  {
    href: "/community-manager/moderacion",
    label: "Moderación",
    icon: Flag,
    hijos: REDES_COMMUNITY_MANAGER.map((r) => ({ href: `/community-manager/moderacion/${r.id}`, label: r.label, icon: r.icon })),
  },
];

// Workspaces disponibles en el switcher del logo — agregar uno nuevo aquí
// (con su propio NAV_* y su entrada en el switch de `items`/`Marca` más
// abajo) es lo único que hace falta para que aparezca en la lista.
type Workspace = { id: string; label: string; href: string; permiso: Accion };

const WORKSPACES: Workspace[] = [
  { id: "club", label: "Club Sinergético", href: "/clientes", permiso: "verClientes" },
  { id: "certificaciones", label: "Certificaciones", href: "/certificaciones", permiso: "verCertificaciones" },
  { id: "community-manager", label: "Community Manager", href: "/community-manager", permiso: "verCommunityManager" },
];

function workspaceDesdeRuta(pathname: string): string {
  if (pathname.startsWith("/certificaciones")) return "certificaciones";
  if (pathname.startsWith("/community-manager")) return "community-manager";
  return "club";
}

// Sección "Certificaciones" (Legendar-IA) — workspace aparte, se cambia con
// el switcher del logo (ver Marca()/Sidebar()). Todavía chica a propósito:
// crece según haga falta, igual que NAV_CLUB.
const NAV_CERTIFICACIONES: ItemNav[] = [
  { href: "/certificaciones", label: "Clientes", icon: Users, permiso: "verCertificaciones" },
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
  { href: "/certificaciones/usuarios", label: "Usuarios", icon: ShieldCheck, permiso: "gestionarUsuarios", contador: "usuarios" },
];

export type Conteos = { solicitudes: number; solicitudesCertificacion: number; usuarios: number; avisos: number };

// Antes 60s — se sentía nada "en tiempo real" (un admin viendo la pantalla
// no veía la burbuja aparecer hasta un minuto después de que alguien se
// autoregistrara). Bajo tráfico interno, la llamada es barata.
const INTERVALO_CONTEOS_MS = 10 * 1000;

// Un solo poll compartido por todos los que usan el hook (el Sidebar y, en
// Certificaciones, la campana de la barra superior): antes cada uno abría su
// propio intervalo contra el mismo endpoint y sus contadores podían
// desincronizarse.
type OyenteConteos = (conteos: Conteos) => void;
const CONTEOS_VACIOS: Conteos = { solicitudes: 0, solicitudesCertificacion: 0, usuarios: 0, avisos: 0 };
let conteosActuales: Conteos = CONTEOS_VACIOS;
const oyentesConteos = new Set<OyenteConteos>();
let temporizadorConteos: ReturnType<typeof setInterval> | null = null;

async function cargarConteos() {
  try {
    const res = await fetch("/api/notificaciones/pendientes");
    if (!res.ok) return;
    const data = await res.json();
    conteosActuales = {
      solicitudes: data.solicitudes ?? 0,
      solicitudesCertificacion: data.solicitudesCertificacion ?? 0,
      usuarios: data.usuarios ?? 0,
      avisos: data.avisos ?? 0,
    };
    oyentesConteos.forEach((oyente) => oyente(conteosActuales));
  } catch {
    // Sin conteo esta vez — se reintenta solo en el próximo intervalo.
  }
}

function suscribirConteos(oyente: OyenteConteos): () => void {
  oyentesConteos.add(oyente);
  if (oyentesConteos.size === 1) {
    cargarConteos();
    temporizadorConteos = setInterval(cargarConteos, INTERVALO_CONTEOS_MS);
  } else {
    oyente(conteosActuales);
  }
  return () => {
    oyentesConteos.delete(oyente);
    if (oyentesConteos.size === 0 && temporizadorConteos) {
      clearInterval(temporizadorConteos);
      temporizadorConteos = null;
    }
  };
}

// Burbuja de "cosas pendientes por revisar" (solicitudes de cliente nuevo,
// usuarios recién autoregistrados, avisos sin confirmar). Siempre se consulta,
// porque cualquier rol puede tener avisos sin confirmar (la ruta ya calcula 0
// en solicitudes/usuarios para quien no tiene permiso).
export function useConteosPendientes(usuario: UsuarioSesion | null): Conteos {
  const [conteos, setConteos] = useState<Conteos>(conteosActuales);

  useEffect(() => {
    if (!usuario) return;
    return suscribirConteos(setConteos);
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

// workspaceActual: derivado de la URL en Sidebar() (nunca estado propio,
// así el switcher y la página mostrada no se pueden desincronizar).
// opciones: los workspaces a los que el usuario tiene permiso — el botón
// del switcher ni se muestra si solo hay uno (ver WORKSPACES más arriba).
function Marca({ workspaceActual, opciones }: { workspaceActual: string; opciones: Workspace[] }) {
  // En Certificaciones, tocar el logo muestra todas las certificaciones.
  const certificacion = useCertificacionActualOpcional();
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const enCertificaciones = workspaceActual === "certificaciones";
  const actual = opciones.find((o) => o.id === workspaceActual);

  useEffect(() => {
    if (!abierto) return;
    function alClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", alClicFuera);
    return () => document.removeEventListener("mousedown", alClicFuera);
  }, [abierto]);

  return (
    <div ref={contenedorRef} className="relative flex items-center gap-3 px-2">
      {enCertificaciones ? (
        <Link
          href="/certificaciones"
          onClick={() => certificacion?.setCertificacionActual(null)}
          title="Ver todas las certificaciones"
          className="flex min-w-0 flex-1 items-center"
        >
          <Image
            src="/certificaciones/certificaciones-logo-full.png"
            alt="Certificaciones oficiales"
            width={184}
            height={58}
            className="h-11 w-auto max-w-full object-contain"
            priority
          />
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Image src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 rounded-xl" priority />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">CRM CS</p>
            <p className="truncate text-xs text-muted">{actual?.label ?? "Club Sinergético"}</p>
          </div>
        </div>
      )}
      {opciones.length > 1 && (
        <div className="relative flex-none">
          <button
            onClick={() => setAbierto((a) => !a)}
            aria-label="Cambiar de sección"
            aria-expanded={abierto}
            title="Cambiar de sección"
            className="ease-spring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            <ChevronsUpDown className="h-4 w-4" strokeWidth={1.75} />
          </button>
          {abierto && (
            <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-silver bg-surface py-1 diffused-lg">
              {opciones.map((o) => (
                <Link
                  key={o.id}
                  href={o.href}
                  onClick={() => {
                    setAbierto(false);
                    if (o.id !== "certificaciones") certificacion?.setCertificacionActual(null);
                  }}
                  className={`ease-spring flex items-center justify-between gap-2 px-3 py-2 text-sm transition ${
                    o.id === workspaceActual
                      ? "bg-primary-dim font-medium text-primary-deep"
                      : "text-foreground hover:bg-surface-2"
                  }`}
                >
                  {o.label}
                  {o.id === workspaceActual && <Check className="h-3.5 w-3.5 flex-none" strokeWidth={2} />}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
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

// Enlaces fijos de checkout de renovación — un botón por región copia su
// enlace al portapapeles, no navega a ningún lado.
const ENLACES_RENOVACION: { label: string; url: string }[] = [
  { label: "Renovación MX", url: "https://checkout.synergyforeducation.com/pay/pl_d5a368bddbdd56eac7c049c65fe3d6c9" },
  { label: "Renovación USA", url: "https://www.synergyforeducation.com/offers/hAH7JZbL" },
  { label: "Renovación LATAM", url: "https://pay.hotmart.com/D106300176V?off=ill2992e" },
];

// Igual criterio de persistencia que "Ocultar filtros" en Clientes
// (src/app/(app)/clientes/page.tsx): sessionStorage, visible por default.
const CLAVE_ENLACES_RENOVACION_VISIBLES = "crm-enlaces-renovacion-visibles";

function leerEnlacesVisiblesGuardado(): boolean {
  try {
    const guardado = sessionStorage.getItem(CLAVE_ENLACES_RENOVACION_VISIBLES);
    return guardado === null ? true : guardado === "1";
  } catch {
    return true;
  }
}

function EnlacesRenovacion() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [visibles, setVisibles] = useState(leerEnlacesVisiblesGuardado);

  function alternarVisibles() {
    setVisibles((v) => {
      const nuevo = !v;
      try {
        sessionStorage.setItem(CLAVE_ENLACES_RENOVACION_VISIBLES, nuevo ? "1" : "0");
      } catch {
        // sessionStorage puede fallar en modo privado — no bloquea el toggle.
      }
      return nuevo;
    });
  }

  function copiar(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiado(url);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  return (
    <div className="mb-1 border-t border-silver/70 pt-3">
      <button
        onClick={alternarVisibles}
        className="ease-spring flex w-full items-center gap-1.5 rounded-xl px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:text-foreground"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${visibles ? "" : "-rotate-90"}`} strokeWidth={2} />
        Enlaces de Renovación
      </button>
      {visibles &&
        ENLACES_RENOVACION.map((e) => (
          <button
            key={e.url}
            onClick={() => copiar(e.url)}
            className="ease-spring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            {copiado === e.url ? (
              <Check className="h-4.5 w-4.5 flex-none text-success" strokeWidth={1.75} />
            ) : (
              <Link2 className="h-4.5 w-4.5 flex-none" strokeWidth={1.75} />
            )}
            {copiado === e.url ? "Copiado" : e.label}
          </button>
        ))}
    </div>
  );
}

// Sin websockets todavía en el proyecto — este poll cada 30s (más una
// revisión al montar) es lo que acerca la entrega de avisos a "tiempo
// real" sin depender de infraestructura nueva.
const INTERVALO_AVISOS_MS = 30 * 1000;

// Cola local de avisos sin confirmar (más viejo primero, ya la manda así
// GET /api/avisos/pendientes) — el modal siempre muestra cola[0]. Cada
// poll reemplaza la cola completa con lo que diga el server, así que una
// vez confirmado un aviso ya no vuelve a aparecer en el siguiente poll.
function useAvisosPendientes(usuario: UsuarioSesion | null) {
  const [cola, setCola] = useState<Aviso[]>([]);

  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    async function cargar() {
      try {
        const res = await fetch("/api/avisos/pendientes");
        if (!res.ok || cancelado) return;
        const data = await res.json();
        if (!cancelado) setCola(data.avisos ?? []);
      } catch {
        // Sin novedades esta vez — se reintenta en el próximo intervalo.
      }
    }
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_AVISOS_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [usuario]);

  return {
    avisoActual: cola[0] ?? null,
    quitarDeLaCola: (id: string) => setCola((c) => c.filter((a) => a.id !== id)),
  };
}

// Ventana emergente bloqueante: no tiene botón de cerrar ni se cierra al
// tocar el fondo mientras no se marque "Enterado" — a propósito, es la
// forma de garantizar que el aviso de verdad se leyó antes de poder
// seguir usando el CRM.
function AvisoPendienteModal({ aviso, onCerrar }: { aviso: Aviso; onCerrar: () => void }) {
  const [enterado, setEnterado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  async function marcarEnterado() {
    setConfirmando(true);
    try {
      await fetch(`/api/avisos/${aviso.id}/confirmar`, { method: "POST" });
      setEnterado(true);
    } finally {
      setConfirmando(false);
    }
  }

  // urgente = ventana emergente en tonos rojo (ej. "correo inválido" en una
  // solicitud, ver marcarSolicitudCorreoInvalido en solicitudes.ts) — el
  // resto del comportamiento (cola, confirmar "Enterado") no cambia.
  const urgente = aviso.urgente;

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center p-6 backdrop-blur-[2px] ${
        urgente ? "bg-danger/20" : "bg-foreground/40"
      }`}
    >
      <div
        className={`shell w-full max-w-sm rounded-[2rem] p-2 diffused-lg animate-fade-in ${
          urgente ? "ring-2 ring-danger/60" : ""
        }`}
      >
        <div className="core rounded-[calc(2rem-0.5rem)] p-6">
          <div className={`mb-3 flex items-center gap-2 ${urgente ? "text-danger" : "text-primary"}`}>
            {urgente ? (
              <AlertTriangle className="h-5 w-5 flex-none" strokeWidth={1.75} />
            ) : (
              <Megaphone className="h-5 w-5 flex-none" strokeWidth={1.75} />
            )}
            <h2 className="text-base font-semibold text-foreground">{aviso.titulo}</h2>
          </div>
          <p className="mb-2 text-xs text-muted">
            {aviso.autorNombre} · {new Date(aviso.creadoEn).toLocaleString("es-MX")}
          </p>
          <p className="mb-3 whitespace-pre-wrap text-sm text-foreground">{aviso.mensaje}</p>
          {aviso.imagenUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- bucket público, URL externa a Supabase Storage.
            <img src={aviso.imagenUrl} alt="" className="mb-5 max-h-60 w-full rounded-xl object-contain" />
          )}

          <label
            className={`ease-spring mb-4 flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium text-foreground ${
              urgente ? "border-danger/40 bg-danger/10" : "border-silver bg-surface-2"
            }`}
          >
            <input
              type="checkbox"
              checked={enterado}
              disabled={confirmando || enterado}
              onChange={marcarEnterado}
              className="h-4 w-4 flex-none rounded border-silver"
            />
            Enterado
          </label>

          {enterado && (
            <button
              onClick={onCerrar}
              className={`ease-spring w-full rounded-xl px-4 py-2.5 text-sm font-medium text-white transition ${
                urgente ? "bg-danger hover:bg-danger/90" : "brand-plate"
              }`}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const INTERVALO_APARTADOS_MS = 60 * 1000;

type ApartadoVencido = { id: string; nombre: string; email: string; apartado50En: string };

// Clientes con "Apartado 50%" cuyo temporizador de 30 días ya venció — ver
// listarApartadosVencidos (db.ts). A diferencia de los avisos, esto solo lo
// ve quien puede revocar acceso (admin), y no bloquea el uso del CRM: se
// puede cerrar y sigue apareciendo en el siguiente poll mientras no se
// resuelva (revocar o apagar el temporizador desde el perfil).
function useApartadosVencidos(usuario: UsuarioSesion | null) {
  const [vencidos, setVencidos] = useState<ApartadoVencido[]>([]);

  useEffect(() => {
    if (!usuario || !tienePermiso(usuario.rol, "revocarAccesoCliente")) return;
    let cancelado = false;
    async function cargar() {
      try {
        const res = await fetch("/api/clientes/apartados-vencidos");
        if (!res.ok || cancelado) return;
        const data = await res.json();
        if (!cancelado) setVencidos(data.vencidos ?? []);
      } catch {
        // Sin novedades esta vez — se reintenta en el próximo intervalo.
      }
    }
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_APARTADOS_MS);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
    };
  }, [usuario]);

  return { vencidos, quitarDeLaLista: (id: string) => setVencidos((v) => v.filter((c) => c.id !== id)) };
}

function ApartadosVencidosModal({
  vencidos,
  onRevocado,
  onCerrar,
}: {
  vencidos: ApartadoVencido[];
  onRevocado: (id: string) => void;
  onCerrar: () => void;
}) {
  const [revocando, setRevocando] = useState<string | null>(null);

  async function revocar(id: string) {
    setRevocando(id);
    try {
      const res = await fetch(`/api/clientes/${encodeURIComponent(id)}/revocar-acceso`, { method: "POST" });
      if (res.ok) onRevocado(id);
    } finally {
      setRevocando(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-danger/20 p-6 backdrop-blur-[2px]">
      <div className="shell w-full max-w-md rounded-[2rem] p-2 diffused-lg animate-fade-in ring-2 ring-danger/60">
        <div className="core rounded-[calc(2rem-0.5rem)] p-6">
          <div className="mb-3 flex items-center gap-2 text-danger">
            <AlertTriangle className="h-5 w-5 flex-none" strokeWidth={1.75} />
            <h2 className="text-base font-semibold text-foreground">
              Apartado 50% vencido{vencidos.length > 1 ? ` (${vencidos.length})` : ""}
            </h2>
          </div>
          <p className="mb-4 text-sm text-foreground">
            Pasaron 30 días desde que se les dio acceso completo y nadie apagó el temporizador — hay que darlos de
            baja o, si ya liquidaron, apagar el temporizador desde su perfil.
          </p>
          <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto">
            {vencidos.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.nombre}</p>
                  <p className="truncate text-xs text-muted">{c.email}</p>
                </div>
                <button
                  onClick={() => revocar(c.id)}
                  disabled={revocando === c.id}
                  className="ease-spring flex-none rounded-lg bg-danger px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-danger/90 disabled:opacity-40"
                >
                  {revocando === c.id ? "Revocando…" : "Revocar acceso"}
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={onCerrar}
            className="ease-spring w-full rounded-xl border border-silver bg-surface-2 px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface"
          >
            Cerrar por ahora
          </button>
        </div>
      </div>
    </div>
  );
}

// Nav de Community Manager: 2 grupos principales (Estadísticas, Moderación)
// más grandes/en negrita que un ítem normal — cada uno lleva a su propia
// vista general y, debajo, las mismas 4 redes anidadas con sangría. `grande`
// replica el mismo ajuste de tamaño que items.map ya hacía entre escritorio
// (más compacto) y el drawer móvil (más espacioso).
function NavGruposCommunityManager({ pathname, grande = false }: { pathname: string; grande?: boolean }) {
  return (
    <>
      {GRUPOS_COMMUNITY_MANAGER.map((grupo) => {
        const activoGrupo = pathname === grupo.href;
        return (
          <div key={grupo.href} className={grande ? "mb-1" : "mb-0.5"}>
            <Link
              href={grupo.href}
              className={`ease-spring flex items-center gap-3 rounded-xl px-3 font-semibold transition ${
                grande ? "py-3 text-base" : "py-2.5 text-sm"
              } ${activoGrupo ? "bg-primary-dim text-primary-deep" : "text-foreground hover:bg-surface-2"}`}
            >
              <grupo.icon className={grande ? "h-5.5 w-5.5" : "h-5 w-5"} strokeWidth={1.9} />
              {grupo.label}
            </Link>
            <div className="mt-0.5 flex flex-col gap-0.5 border-l border-silver/70 pl-3">
              {grupo.hijos.map((hijo) => {
                const activoHijo = pathname === hijo.href;
                return (
                  <Link
                    key={hijo.href}
                    href={hijo.href}
                    className={`ease-spring flex items-center gap-2.5 rounded-lg px-3 font-medium transition ${
                      grande ? "py-2 text-sm" : "py-1.5 text-xs"
                    } ${activoHijo ? "bg-primary-dim text-primary-deep" : "text-muted hover:bg-surface-2 hover:text-foreground"}`}
                  >
                    <hijo.icon className={grande ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.75} />
                    {hijo.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

// "Recientes": las últimas 3 adiciones de TODO Community Manager
// (publicaciones de redes + atenciones de Skool, mezcladas por fecha),
// debajo del grupo Moderación — ver obtenerRecientesCommunityManager en
// src/lib/community-manager.ts. Se recarga con cada navegación dentro del
// workspace (no hace falta polling: es solo para encontrar rápido lo
// último que se agregó, no una bandeja de pendientes).
function RecientesCommunityManager({ pathname, grande = false }: { pathname: string; grande?: boolean }) {
  const [items, setItems] = useState<ItemReciente[] | null>(null);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/community-manager/recientes")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelado) setItems(data.recientes ?? []);
      })
      .catch(() => {
        if (!cancelado) setItems([]);
      });
    return () => {
      cancelado = true;
    };
  }, [pathname]);

  if (!items || items.length === 0) return null;

  return (
    <div className={grande ? "mt-4" : "mt-3"}>
      <p className={`flex items-center gap-1.5 px-3 font-semibold text-muted ${grande ? "mb-1.5 text-sm" : "mb-1 text-xs"}`}>
        <Clock className={grande ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.9} />
        Recientes
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icono = ICONO_POR_PLATAFORMA[item.plataforma];
          return (
            <Link
              key={item.id}
              href={item.href}
              title={item.descripcion}
              className={`ease-spring flex items-center gap-2.5 rounded-lg px-3 text-muted transition hover:bg-surface-2 hover:text-foreground ${
                grande ? "py-2 text-sm" : "py-1.5 text-xs"
              }`}
            >
              <Icono className={grande ? "h-4 w-4 flex-none" : "h-3.5 w-3.5 flex-none"} strokeWidth={1.75} />
              <span className="truncate">{item.descripcion}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { usuario } = useSesion();
  const { config: filtrosPagina } = useFiltrosMovil();
  const [abierto, setAbierto] = useState(false);
  const [mostrarPerfil, setMostrarPerfil] = useState(false);
  const conteos = useConteosPendientes(usuario);
  const { avisoActual, quitarDeLaCola } = useAvisosPendientes(usuario);
  const { vencidos: apartadosVencidos, quitarDeLaLista: quitarApartadoVencido } = useApartadosVencidos(usuario);
  // "Cerrar por ahora" solo oculta hasta el siguiente poll (60s) — no se
  // puede descartar para siempre mientras el temporizador siga vencido.
  const [apartadosCerrado, setApartadosCerrado] = useState(false);
  useEffect(() => setApartadosCerrado(false), [apartadosVencidos]);

  // Cierra el drawer solo con la navegación (no al abrirlo), para que un
  // clic en un link de menú no deje el drawer abierto detrás de la página
  // nueva.
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  if (!usuario) return null;
  // Deriva el workspace de la URL en vez de guardar estado aparte — así no
  // hay forma de que el switcher y la página realmente mostrada se
  // desincronicen, y es deep-linkable (entrar directo a /certificaciones/x
  // o /community-manager ya muestra el workspace correcto sin un clic de más).
  const workspaceActual = workspaceDesdeRuta(pathname);
  const esCommunityManager = workspaceActual === "community-manager";
  const items = (workspaceActual === "certificaciones" ? NAV_CERTIFICACIONES : NAV_CLUB).filter((item) =>
    tienePermiso(usuario.rol, item.permiso)
  );
  const opcionesWorkspace = WORKSPACES.filter((w) => tienePermiso(usuario.rol, w.permiso));

  return (
    <>
      {/* Sidebar fijo — solo md+ (tablet/escritorio). */}
      <aside className="hidden h-screen w-64 flex-none flex-col border-r border-silver/70 bg-surface px-4 py-6 md:flex">
        <div className="mb-8">
          <Marca workspaceActual={workspaceActual} opciones={opcionesWorkspace} />
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {esCommunityManager ? (
            <>
              <NavGruposCommunityManager pathname={pathname} />
              <RecientesCommunityManager pathname={pathname} />
            </>
          ) : (
            items.map(({ href, label, icon: Icon, contador }, i) => {
              const activo = pathname === href && items.findIndex((it) => it.href === href) === i;
              return (
                <Link
                  key={`${href}-${label}`}
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
            })
          )}
        </nav>
        {workspaceActual === "club" && <EnlacesRenovacion />}
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
        <Marca workspaceActual={workspaceActual} opciones={opcionesWorkspace} />
        <span className="w-9" aria-hidden="true" />
      </header>

      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} aria-hidden="true" />
          <div className="animate-slide-in-left relative flex h-full w-72 max-w-[82%] flex-col bg-surface px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <Marca workspaceActual={workspaceActual} opciones={opcionesWorkspace} />
              <button
                onClick={() => setAbierto(false)}
                aria-label="Cerrar menú"
                className="ease-spring flex h-9 w-9 flex-none items-center justify-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-foreground"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {esCommunityManager ? (
                <>
                  <NavGruposCommunityManager pathname={pathname} grande />
                  <RecientesCommunityManager pathname={pathname} grande />
                </>
              ) : (
                items.map(({ href, label, icon: Icon, contador }, i) => {
                  const activo = pathname === href && items.findIndex((it) => it.href === href) === i;
                  return (
                    <Link
                      key={`${href}-${label}`}
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
                })
              )}
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

            {workspaceActual === "club" && <EnlacesRenovacion />}
            <CuentaFooter onAbrirPerfil={() => setMostrarPerfil(true)} />
          </div>
        </div>
      )}

      {mostrarPerfil && <MiPerfilModal onClose={() => setMostrarPerfil(false)} />}
      {avisoActual && <AvisoPendienteModal aviso={avisoActual} onCerrar={() => quitarDeLaCola(avisoActual.id)} />}
      {apartadosVencidos.length > 0 && !apartadosCerrado && (
        <ApartadosVencidosModal
          vencidos={apartadosVencidos}
          onRevocado={quitarApartadoVencido}
          onCerrar={() => setApartadosCerrado(true)}
        />
      )}
    </>
  );
}
