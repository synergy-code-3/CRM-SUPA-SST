"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Pencil,
  Save,
  XCircle,
  Send,
  Headset,
  CalendarClock,
  PartyPopper,
  Ticket,
  MessagesSquare,
  PhoneCall,
  Copy,
  Check,
  MessageCircle,
  Phone,
  CalendarDays,
  ShieldCheck,
  Crown,
  Gem,
  User,
  LayoutGrid,
  ClipboardList,
  StickyNote,
  Activity,
  Plus,
  RefreshCw,
  AlertTriangle,
  Trash2,
  IdCard,
  MapPin,
  LogIn,
  Clock,
  Mail,
  PauseCircle,
  PlayCircle,
  Gift,
  Ban,
  ShoppingBag,
  ExternalLink,
} from "lucide-react";
import type { Accesos, Cliente, EventoTimeline, OfertaOtorgada } from "@/lib/types";
import { ESTADOS_MENSAJE_BIENVENIDA_WA } from "@/lib/types";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import { AccesosSynergy } from "./AccesosSynergy";
import { Timeline } from "./Timeline";
import { ComboboxBuscador, type OpcionCombobox } from "./ComboboxBuscador";
import type { PerfilKajabi } from "@/lib/kajabi";
import { LOGO_NECESITA_FONDO_SOLIDO, RUTA_LOGO_EVENTO, logoParaCliente } from "@/lib/logo-eventos";
import { finAccesoCalculado } from "@/lib/fechas";
import type { ConvertidoVsl } from "@/lib/vsl-soporte";
import type { HistorialAxis } from "@/lib/axis";

type Tab = "resumen" | "accesos" | "seguimiento" | "notas" | "actividad" | "kajabi" | "vsl";

const TABS: { key: Tab; label: string; icon: typeof User }[] = [
  { key: "resumen", label: "Resumen", icon: LayoutGrid },
  { key: "accesos", label: "Accesos", icon: ShieldCheck },
  { key: "vsl", label: "Historial", icon: ShoppingBag },
  { key: "kajabi", label: "Perfil de Kajabi", icon: IdCard },
  { key: "seguimiento", label: "Seguimiento", icon: ClipboardList },
  { key: "notas", label: "Notas", icon: StickyNote },
  { key: "actividad", label: "Actividad", icon: Activity },
];

type Form = {
  nombre: string;
  telefono: string;
  pais: string;
  ciudad: string;
  notas: string;
  evento: string;
  fechaEvento: string;
  accesoPlataforma: string;
  tipoMembresia: string;
  vencimientoSkool: string;
  invitacionSkool: string;
  llamada: string;
  notasSoporte: string;
  fechaRenovacion: string;
};

function isoAFechaInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

function formDeCliente(c: Cliente | null): Form {
  return {
    nombre: c?.nombre ?? "",
    telefono: c?.telefono ?? "",
    pais: c?.pais ?? "",
    ciudad: c?.ciudad ?? "",
    notas: c?.notas ?? "",
    evento: c?.evento ?? "",
    fechaEvento: c?.fechaEvento ?? "",
    accesoPlataforma: c?.accesoPlataforma ?? "",
    tipoMembresia: c?.tipoMembresia ?? "",
    vencimientoSkool: c?.vencimientoSkool ?? "",
    invitacionSkool: c?.invitacionSkool ?? "",
    llamada: c?.llamada ?? "",
    notasSoporte: c?.notasSoporte ?? "",
    fechaRenovacion: isoAFechaInput(c?.fechaRenovacion ?? null),
  };
}

const ACCESO_LABEL: Record<keyof Accesos, string> = {
  general: "General",
  vip: "VIP",
  black: "Black Access",
};

function formatearDireccion(d: PerfilKajabi["direccion"]): string[] {
  if (!d) return [];
  const linea1 = [d.calle1, d.calle2].filter(Boolean).join(", ");
  const linea2 = [d.ciudad, d.estado, d.codigoPostal].filter(Boolean).join(", ");
  return [linea1, linea2, d.pais].filter((l): l is string => !!l);
}

// Axis manda los montos en centavos (igual que Stripe) — 599700 = $5,997.00.
function formatearCentavos(cents: number | null, currency: string | null): string | null {
  if (cents == null) return null;
  const monto = (cents / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${monto} ${currency.toUpperCase()}` : monto;
}

function textoAcceso(lista: Accesos[keyof Accesos]): string {
  if (lista.length === 0) return "Sin acceso";
  return lista.map((d) => `${d.cantidad}${d.variante ? ` · ${d.variante}` : ""}`).join(" + ");
}

function diferenciasAccesos(anterior: Accesos, nuevo: Accesos): { nivel: keyof Accesos; de: string; a: string }[] {
  return (Object.keys(nuevo) as (keyof Accesos)[])
    .filter((nivel) => JSON.stringify(anterior[nivel]) !== JSON.stringify(nuevo[nivel]))
    .map((nivel) => ({ nivel, de: textoAcceso(anterior[nivel]), a: textoAcceso(nuevo[nivel]) }));
}

type EstadoKajabi = "cargando" | "activa" | "revocada" | "sin_contacto" | "error";

export function ClientePanel({
  clienteId,
  onClose,
  onClienteActualizado,
  onClienteEliminado,
}: {
  clienteId: string;
  onClose: () => void;
  onClienteActualizado: (cliente: Cliente) => void;
  onClienteEliminado?: (id: string) => void;
}) {
  const { usuario } = useSesion();
  const puedeEditar = !!usuario && tienePermiso(usuario.rol, "editarCliente");
  const puedeEditarAccesos = !!usuario && tienePermiso(usuario.rol, "editarAccesos");
  const puedeAgregarNota = !!usuario && tienePermiso(usuario.rol, "agregarNota");
  const puedeEliminar = !!usuario && tienePermiso(usuario.rol, "eliminarCliente");
  const puedeRenovar = !!usuario && tienePermiso(usuario.rol, "renovarMembresia");
  const puedePausar = !!usuario && tienePermiso(usuario.rol, "pausarMembresia");
  const puedeRevocarAcceso = !!usuario && tienePermiso(usuario.rol, "revocarAccesoCliente");
  const puedeVerActividad = !!usuario && tienePermiso(usuario.rol, "verActividad");
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [eventos, setEventos] = useState<EventoTimeline[]>([]);
  const [cargando, setCargando] = useState(true);
  const [tab, setTab] = useState<Tab>("resumen");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Form>(formDeCliente(null));
  const [guardando, setGuardando] = useState(false);
  const [editandoAccesos, setEditandoAccesos] = useState(false);
  const [borradorAccesos, setBorradorAccesos] = useState<Accesos | null>(null);
  const [confirmandoAccesos, setConfirmandoAccesos] = useState(false);
  const [guardandoAccesos, setGuardandoAccesos] = useState(false);
  const [liberandoAccesosManual, setLiberandoAccesosManual] = useState(false);
  const [nota, setNota] = useState("");
  const [enviandoNota, setEnviandoNota] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<"email" | "telefono" | null>(null);
  const [tagsCatalogo, setTagsCatalogo] = useState<string[]>([]);
  const [catalogoEventos, setCatalogoEventos] = useState<OpcionCombobox[]>([]);
  const [guardandoTag, setGuardandoTag] = useState<string | null>(null);
  const [estadoKajabi, setEstadoKajabi] = useState<EstadoKajabi>("cargando");
  const [pasoRenovar, setPasoRenovar] = useState<0 | 1 | 2>(0);
  const [renovando, setRenovando] = useState(false);
  const [pasoEliminar, setPasoEliminar] = useState<0 | 1 | 2>(0);
  const [eliminando, setEliminando] = useState(false);
  const [pasoEnviarWa, setPasoEnviarWa] = useState<0 | 1>(0);
  const [enviandoWa, setEnviandoWa] = useState(false);
  const [esperandoConfirmacionWa, setEsperandoConfirmacionWa] = useState(false);
  const [puntosEnviando, setPuntosEnviando] = useState(0);
  const [pasoPausar, setPasoPausar] = useState<0 | 1>(0);
  const [pausando, setPausando] = useState(false);
  const [pasoReanudar, setPasoReanudar] = useState<0 | 1>(0);
  const [reanudando, setReanudando] = useState(false);
  const [pasoRevocarAcceso, setPasoRevocarAcceso] = useState<0 | 1>(0);
  const [revocandoAcceso, setRevocandoAcceso] = useState(false);
  const [perfilKajabi, setPerfilKajabi] = useState<PerfilKajabi | null>(null);
  const [cargandoPerfilKajabi, setCargandoPerfilKajabi] = useState(false);
  const [errorPerfilKajabi, setErrorPerfilKajabi] = useState<string | null>(null);
  const [intentadoPerfilKajabi, setIntentadoPerfilKajabi] = useState(false);
  const [historicoVsl, setHistoricoVsl] = useState<ConvertidoVsl[] | null>(null);
  const [cargandoHistoricoVsl, setCargandoHistoricoVsl] = useState(false);
  const [errorHistoricoVsl, setErrorHistoricoVsl] = useState<string | null>(null);
  const [intentadoHistoricoVsl, setIntentadoHistoricoVsl] = useState(false);
  // "sin dato" (contacto no encontrado en Axis, 404) vs null (todavía no se
  // intentó consultar) son casos distintos — por eso el estado usa
  // undefined como "no consultado" en vez de reusar null para ambos.
  const [historialAxis, setHistorialAxis] = useState<HistorialAxis | null | undefined>(undefined);
  const [cargandoHistorialAxis, setCargandoHistorialAxis] = useState(false);
  const [errorHistorialAxis, setErrorHistorialAxis] = useState<string | null>(null);
  const [intentadoHistorialAxis, setIntentadoHistorialAxis] = useState(false);
  const puedeOtorgarOferta = !!usuario && tienePermiso(usuario.rol, "otorgarOferta");
  const [ofertasClub, setOfertasClub] = useState<OfertaOtorgada[]>([]);
  const [catalogoOfertasKajabi, setCatalogoOfertasKajabi] = useState<OpcionCombobox[]>([]);
  const [cargandoCatalogoOfertas, setCargandoCatalogoOfertas] = useState(false);
  const [mostrarAgregarOferta, setMostrarAgregarOferta] = useState(false);
  const [ofertaElegida, setOfertaElegida] = useState("");
  const [otorgandoOferta, setOtorgandoOferta] = useState(false);
  const [confirmandoRevocarId, setConfirmandoRevocarId] = useState<string | null>(null);
  const [revocandoOfertaId, setRevocandoOfertaId] = useState<string | null>(null);

  const mostrandoEnviandoWa = enviandoWa || esperandoConfirmacionWa;
  useEffect(() => {
    if (!mostrandoEnviandoWa) {
      setPuntosEnviando(0);
      return;
    }
    const intervalo = setInterval(() => setPuntosEnviando((p) => (p + 1) % 4), 400);
    return () => clearInterval(intervalo);
  }, [mostrandoEnviandoWa]);

  useEffect(() => {
    fetch("/api/biblioteca?tipo=tag")
      .then((r) => r.json())
      .then((data) => setTagsCatalogo(data.opciones ?? []))
      .catch(() => setTagsCatalogo([]));
  }, []);

  useEffect(() => {
    fetch("/api/biblioteca?tipo=evento")
      .then((r) => r.json())
      .then((data) => setCatalogoEventos((data.opciones ?? []).map((v: string) => ({ valor: v, etiqueta: v }))))
      .catch(() => setCatalogoEventos([]));
  }, []);

  // Ref (no dep de efecto) para poder llamar la versión más reciente de
  // onClienteActualizado desde el efecto de carga sin que ese efecto se
  // vuelva a disparar cada vez que ClientesPage se re-renderiza (su versión
  // de la función no está memoizada con useCallback).
  const onClienteActualizadoRef = useRef(onClienteActualizado);
  useEffect(() => {
    onClienteActualizadoRef.current = onClienteActualizado;
  }, [onClienteActualizado]);

  const clienteIdRef = useRef(clienteId);
  useEffect(() => {
    clienteIdRef.current = clienteId;
  }, [clienteId]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setTab("resumen");
    setEstadoKajabi("cargando");
    setPasoRenovar(0);
    setPasoEliminar(0);
    setPasoPausar(0);
    setPasoReanudar(0);
    setPasoRevocarAcceso(0);
    setPasoEnviarWa(0);
    setEsperandoConfirmacionWa(false);
    setPerfilKajabi(null);
    setErrorPerfilKajabi(null);
    setIntentadoPerfilKajabi(false);
    setHistoricoVsl(null);
    setErrorHistoricoVsl(null);
    setIntentadoHistoricoVsl(false);
    setHistorialAxis(undefined);
    setErrorHistorialAxis(null);
    setIntentadoHistorialAxis(false);
    setOfertasClub([]);
    setMostrarAgregarOferta(false);
    setOfertaElegida("");
    setConfirmandoRevocarId(null);
    setError(null);
    Promise.all([
      fetch(`/api/clientes/${encodeURIComponent(clienteId)}`),
      fetch(`/api/clientes/${encodeURIComponent(clienteId)}/eventos`),
      fetch(`/api/clientes/${encodeURIComponent(clienteId)}/ofertas`),
    ])
      .then(async ([clienteResRaw, eventosResRaw, ofertasResRaw]) => {
        if (cancelado) return;
        if (!clienteResRaw.ok) {
          const data = await clienteResRaw.json().catch(() => ({}));
          throw new Error(data.error ?? "No se pudo cargar el cliente");
        }
        // eventos/ofertas son secundarios: si fallan, el panel igual se abre
        // con el cliente (listas vacías) en vez de tumbarse por completo.
        const [clienteRes, eventosRes, ofertasRes] = await Promise.all([
          clienteResRaw.json(),
          eventosResRaw.ok ? eventosResRaw.json() : Promise.resolve({ eventos: [] }),
          ofertasResRaw.ok ? ofertasResRaw.json() : Promise.resolve({ ofertas: [] }),
        ]);
        if (cancelado) return;
        setCliente(clienteRes.cliente);
        setEventos(eventosRes.eventos ?? []);
        setOfertasClub(ofertasRes.ofertas ?? []);
        setForm(formDeCliente(clienteRes.cliente));
        setCargando(false);
        // La fila de la lista se queda con la foto de cuando se cargó (o de
        // cuando se creó el cliente) — si algo cambió desde entonces en
        // segundo plano (ej. el webhook real de confirmación de WhatsApp),
        // esta es la única forma de que la lista se entere sin recargar toda
        // la página.
        onClienteActualizadoRef.current(clienteRes.cliente);
      })
      .catch((err) => {
        if (cancelado) return;
        setCargando(false);
        setError(err instanceof Error ? err.message : "No se pudo cargar el cliente");
      });
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/kajabi-estado`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelado) setEstadoKajabi(data.estado ?? "error");
      })
      .catch(() => {
        if (!cancelado) setEstadoKajabi("error");
      });
    return () => {
      cancelado = true;
    };
  }, [clienteId]);

  useEffect(() => {
    // `intentadoPerfilKajabi` (no `perfilKajabi`) es lo que evita reintentar:
    // si la consulta falla, perfilKajabi se queda en null para siempre, y
    // usar esa variable en la guarda reintentaría en bucle infinito sin
    // llegar nunca a mostrar el error.
    //
    // Importante: `cargandoPerfilKajabi` NO va en las dependencias. Este
    // mismo efecto lo pone en `true` al arrancar, y si estuviera en la
    // lista, ese cambio dispararía la limpieza del efecto (cancelado=true)
    // casi de inmediato — la respuesta real llega después, pero se ignora
    // porque `cancelado` ya quedó en true. Por eso se quedaba en
    // "Consultando…" para siempre aunque la petición sí terminaba con 200.
    if (tab !== "kajabi" || intentadoPerfilKajabi) return;
    let cancelado = false;
    setCargandoPerfilKajabi(true);
    setErrorPerfilKajabi(null);
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/kajabi-perfil`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelado) return;
        if (data.perfil) setPerfilKajabi(data.perfil);
        else setErrorPerfilKajabi(data.error ?? "No se pudo consultar Kajabi");
      })
      .catch(() => {
        if (!cancelado) setErrorPerfilKajabi("No se pudo consultar Kajabi");
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoPerfilKajabi(false);
          setIntentadoPerfilKajabi(true);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [tab, clienteId, intentadoPerfilKajabi]);

  useEffect(() => {
    if (tab !== "vsl" || intentadoHistoricoVsl) return;
    let cancelado = false;
    setCargandoHistoricoVsl(true);
    setErrorHistoricoVsl(null);
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/vsl-historico`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo consultar el CRM de VSL");
        return data;
      })
      .then((data) => {
        if (!cancelado) setHistoricoVsl(data.historico ?? []);
      })
      .catch((err) => {
        if (!cancelado) setErrorHistoricoVsl(err instanceof Error ? err.message : "No se pudo consultar el CRM de VSL");
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoHistoricoVsl(false);
          setIntentadoHistoricoVsl(true);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [tab, clienteId, intentadoHistoricoVsl]);

  useEffect(() => {
    if (tab !== "vsl" || intentadoHistorialAxis) return;
    let cancelado = false;
    setCargandoHistorialAxis(true);
    setErrorHistorialAxis(null);
    fetch(`/api/clientes/${encodeURIComponent(clienteId)}/axis-historial`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "No se pudo consultar el CRM de Axis");
        return data;
      })
      .then((data) => {
        if (!cancelado) setHistorialAxis(data.historial ?? null);
      })
      .catch((err) => {
        if (!cancelado) setErrorHistorialAxis(err instanceof Error ? err.message : "No se pudo consultar el CRM de Axis");
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoHistorialAxis(false);
          setIntentadoHistorialAxis(true);
        }
      });
    return () => {
      cancelado = true;
    };
  }, [tab, clienteId, intentadoHistorialAxis]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function guardar() {
    if (!cliente || !puedeEditar) return;
    setGuardando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "datos", ...form }),
    });
    const data = await res.json();
    setGuardando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudieron guardar los cambios");
      return;
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    setEditando(false);
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  function cancelarEdicion() {
    setEditando(false);
    setForm(formDeCliente(cliente));
  }

  function iniciarEdicionAccesos() {
    if (!cliente || !puedeEditarAccesos) return;
    setBorradorAccesos(cliente.accesos);
    setEditandoAccesos(true);
    setConfirmandoAccesos(false);
  }

  function cancelarEdicionAccesos() {
    setEditandoAccesos(false);
    setConfirmandoAccesos(false);
    setBorradorAccesos(null);
  }

  async function confirmarGuardarAccesos() {
    if (!cliente || !borradorAccesos || !puedeEditarAccesos) return;
    setGuardandoAccesos(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "accesos", accesos: borradorAccesos }),
    });
    const data = await res.json();
    setGuardandoAccesos(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar los accesos");
      return;
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    cancelarEdicionAccesos();
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarLiberarAccesosManual() {
    if (!cliente || !puedeEditarAccesos) return;
    if (!window.confirm("Esto va a recalcular los accesos automáticamente, reemplazando la corrección manual. ¿Confirmas?")) {
      return;
    }
    setLiberandoAccesosManual(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/liberar-accesos-manual`, {
      method: "POST",
    });
    const data = await res.json();
    setLiberandoAccesosManual(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo liberar los accesos");
      return;
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarRenovar() {
    if (!cliente || !puedeRenovar) return;
    if (pasoRenovar < 2) {
      setPasoRenovar((p) => (p + 1) as 0 | 1 | 2);
      return;
    }
    setRenovando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/renovar`, {
      method: "POST",
    });
    const data = await res.json();
    setRenovando(false);
    setPasoRenovar(0);
    if (!res.ok) {
      setError(data.error ?? "No se pudo renovar la membresía");
      return;
    }
    const avisos: string[] = [];
    if (data.avisoKajabi) avisos.push(`Kajabi: ${data.avisoKajabi}`);
    if (data.avisoSkool) avisos.push(`Skool: ${data.avisoSkool}`);
    if (avisos.length) {
      window.alert(`La membresía se renovó en el CRM, pero hubo problemas:\n\n${avisos.join("\n")}`);
    }
    setCliente(data.cliente);
    setForm(formDeCliente(data.cliente));
    onClienteActualizado(data.cliente);
    setEstadoKajabi(data.avisoKajabi ? "revocada" : "activa");
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarPausar() {
    if (!cliente || !puedePausar) return;
    if (pasoPausar < 1) {
      setPasoPausar(1);
      return;
    }
    setPausando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/pausar`, {
      method: "POST",
    });
    const data = await res.json();
    setPausando(false);
    setPasoPausar(0);
    if (!res.ok) {
      setError(data.error ?? "No se pudo pausar la membresía");
      return;
    }
    if (data.avisoKajabi) {
      window.alert(`La membresía se pausó en el CRM, pero no se pudo revocar en Kajabi: ${data.avisoKajabi}`);
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    setEstadoKajabi("revocada");
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarReanudar() {
    if (!cliente || !puedePausar) return;
    if (pasoReanudar < 1) {
      setPasoReanudar(1);
      return;
    }
    setReanudando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/reanudar`, {
      method: "POST",
    });
    const data = await res.json();
    setReanudando(false);
    setPasoReanudar(0);
    if (!res.ok) {
      setError(data.error ?? "No se pudo reanudar la membresía");
      return;
    }
    setCliente(data.cliente);
    setForm(formDeCliente(data.cliente));
    onClienteActualizado(data.cliente);
    if (data.avisoKajabi) {
      window.alert(`No se pudo otorgar el acceso en Kajabi al reanudar: ${data.avisoKajabi}`);
    } else {
      setEstadoKajabi("activa");
      window.alert(
        `Recuerda cambiar la fecha de vencimiento en Kajabi a: ${new Date(data.fechaCalculada).toLocaleDateString("es-MX")} (le quedaban ${data.diasRestantes} días cuando se pausó).`
      );
    }
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarRevocarAcceso() {
    if (!cliente || !puedeRevocarAcceso) return;
    if (pasoRevocarAcceso < 1) {
      setPasoRevocarAcceso(1);
      return;
    }
    setRevocandoAcceso(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/revocar-acceso`, {
      method: "POST",
    });
    const data = await res.json();
    setRevocandoAcceso(false);
    setPasoRevocarAcceso(0);
    if (!res.ok) {
      setError(data.error ?? "No se pudo revocar el acceso");
      return;
    }
    if (data.avisoKajabi) {
      window.alert(`El acceso se revocó en el CRM, pero hubo un problema en Kajabi: ${data.avisoKajabi}`);
    }
    setCliente(data.cliente);
    setForm(formDeCliente(data.cliente));
    onClienteActualizado(data.cliente);
    setEstadoKajabi("revocada");
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  function abrirAgregarOferta() {
    if (!puedeOtorgarOferta) return;
    setMostrarAgregarOferta(true);
    setOfertaElegida("");
    if (catalogoOfertasKajabi.length > 0) return;
    setCargandoCatalogoOfertas(true);
    fetch("/api/kajabi/ofertas")
      .then((r) => r.json())
      .then((data) => {
        const ofertas: { id: string; titulo: string }[] = data.ofertas ?? [];
        setCatalogoOfertasKajabi(ofertas.map((o) => ({ valor: o.id, etiqueta: o.titulo })));
      })
      .catch(() => setError("No se pudo consultar el catálogo de ofertas de Kajabi"))
      .finally(() => setCargandoCatalogoOfertas(false));
  }

  async function confirmarAgregarOferta() {
    if (!cliente || !puedeOtorgarOferta || !ofertaElegida) return;
    const ofertaTitulo = catalogoOfertasKajabi.find((o) => o.valor === ofertaElegida)?.etiqueta ?? ofertaElegida;
    setOtorgandoOferta(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/otorgar-oferta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ofertaId: ofertaElegida, ofertaTitulo }),
    });
    const data = await res.json();
    setOtorgandoOferta(false);
    if (!res.ok) {
      window.alert(`No se pudo otorgar la oferta: ${data.error ?? "error desconocido"}`);
      return;
    }
    setOfertasClub(data.ofertas ?? []);
    setMostrarAgregarOferta(false);
    setOfertaElegida("");
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) => r.json());
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarRevocarOferta(grantId: string) {
    if (!cliente || !puedeOtorgarOferta) return;
    if (confirmandoRevocarId !== grantId) {
      setConfirmandoRevocarId(grantId);
      return;
    }
    setRevocandoOfertaId(grantId);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/revocar-oferta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ofertaGrantId: grantId }),
    });
    const data = await res.json();
    setRevocandoOfertaId(null);
    setConfirmandoRevocarId(null);
    if (!res.ok) {
      window.alert(`No se pudo revocar la oferta: ${data.error ?? "error desconocido"}`);
      return;
    }
    setOfertasClub(data.ofertas ?? []);
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) => r.json());
    setEventos(eventosRes.eventos ?? []);
  }

  async function confirmarEliminar() {
    if (!cliente || !puedeEliminar) return;
    if (pasoEliminar < 2) {
      setPasoEliminar((p) => (p + 1) as 0 | 1 | 2);
      return;
    }
    setEliminando(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eliminar`, {
      method: "POST",
    });
    const data = await res.json();
    setEliminando(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo eliminar el cliente");
      setPasoEliminar(0);
      return;
    }
    if (data.avisoKajabi) {
      window.alert(
        `El cliente se archivó en el CRM, pero no se pudo eliminar en Kajabi: ${data.avisoKajabi}`
      );
    }
    onClienteEliminado?.(cliente.id);
    onClose();
  }

  async function toggleTag(tag: string, activo: boolean) {
    if (!cliente || !puedeEditar) return;
    const nuevos = activo ? [...cliente.tags, tag] : cliente.tags.filter((t) => t !== tag);
    setGuardandoTag(tag);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "tags", tags: nuevos }),
    });
    const data = await res.json();
    setGuardandoTag(null);
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar los tags");
      return;
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  async function enviarNota() {
    if (!cliente || !puedeAgregarNota || !nota.trim()) return;
    setEnviandoNota(true);
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nota }),
    });
    const data = await res.json();
    setEnviandoNota(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo agregar la nota");
      return;
    }
    setEventos(data.eventos);
    setNota("");
  }

  async function confirmarEnviarWa() {
    if (!cliente || !puedeEditar) return;
    if (pasoEnviarWa < 1) {
      setPasoEnviarWa(1);
      return;
    }
    const clienteId = cliente.id;
    // IDs de los eventos que ya existían antes de mandar — así, al hacer
    // polling después, se detecta el evento nuevo de confirmación de GHL sin
    // depender de comparar fechas (evita problemas de reloj desincronizado
    // entre el navegador y el servidor).
    const idsEventosAntes = new Set(eventos.map((e) => e.id));

    setEnviandoWa(true);
    setError(null);
    setPasoEnviarWa(0);
    const res = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/reenviar-bienvenida-wa`, {
      method: "POST",
    });
    const data = await res.json();
    setEnviandoWa(false);
    if (!res.ok) {
      setError(data.error ?? "No se pudo reenviar el mensaje de bienvenida");
      window.alert(`No se pudo enviar el mensaje de bienvenida por WhatsApp: ${data.error ?? "error desconocido"}`);
      return;
    }
    if (data.aviso) {
      // El alta en GHL falló de entrada (ni siquiera llegó a intentar
      // mandarlo) — no hay Workflow corriendo del cual esperar confirmación.
      setError(`No se pudo reenviar por WhatsApp — quedó en Pendiente: ${data.aviso}`);
      window.alert(
        `No se envió el mensaje de bienvenida por WhatsApp: ${data.aviso}\n\nRevisa el número del cliente, o puedes intentar enviarlo manual.`
      );
      setCliente(data.cliente);
      onClienteActualizado(data.cliente);
      return;
    }
    // A propósito NO se actualiza cliente.contactoWhats todavía con el valor
    // optimista del servidor — mientras se espera la confirmación real de
    // GHL, la UI muestra "Enviando…" en vez de un "Enviado" que podría
    // desdecirse unos segundos después.
    esperarConfirmacionWa(clienteId, idsEventosAntes);
  }

  // Hace polling de la timeline hasta encontrar el evento que registra el
  // webhook de confirmación real de GHL (ver /api/webhooks/ghl-bienvenida-wa),
  // en vez de asumir "Enviado" apenas se logra agregar el tag en GHL. Cada
  // corrida corre en su propio cierre (clienteId capturado al llamar) para
  // no pisar el perfil de otro cliente si el usuario cambia de panel a media
  // espera — por eso siempre compara contra clienteIdRef antes de aplicar
  // el resultado.
  async function esperarConfirmacionWa(clienteId: string, idsEventosAntes: Set<string>): Promise<void> {
    setEsperandoConfirmacionWa(true);
    const INTERVALO_MS = 3000;
    const MAX_INTENTOS = 30; // ~90s — el Workflow real ha tardado entre 13 y 46s en probarse, con margen

    for (let intento = 0; intento < MAX_INTENTOS; intento++) {
      await new Promise((resolve) => setTimeout(resolve, INTERVALO_MS));
      if (clienteIdRef.current !== clienteId) return; // cambiaron de cliente, se aborta

      const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}/eventos`)
        .then((r) => r.json())
        .catch(() => null);
      const eventosNuevos: EventoTimeline[] = eventosRes?.eventos ?? [];
      const confirmacion = eventosNuevos.find((e) => e.autor === "GHL" && !idsEventosAntes.has(e.id));
      if (!confirmacion) continue;

      if (clienteIdRef.current !== clienteId) return;
      const clienteRes = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (clienteIdRef.current !== clienteId) return;

      setEsperandoConfirmacionWa(false);
      setEventos(eventosNuevos);
      if (clienteRes?.cliente) {
        setCliente(clienteRes.cliente);
        onClienteActualizado(clienteRes.cliente);
      }
      if (confirmacion.detalle.includes("no se pudo entregar")) {
        window.alert(
          "No se envió el mensaje de bienvenida por WhatsApp.\n\nRevisa el número del cliente, o puedes intentar enviarlo manual."
        );
      }
      return;
    }

    // Se acabó el tiempo de espera sin noticias de GHL — no se asume nada,
    // solo se refresca con lo último que haya en la base y se avisa.
    if (clienteIdRef.current !== clienteId) return;
    setEsperandoConfirmacionWa(false);
    const clienteRes = await fetch(`/api/clientes/${encodeURIComponent(clienteId)}`)
      .then((r) => r.json())
      .catch(() => null);
    if (clienteIdRef.current !== clienteId) return;
    if (clienteRes?.cliente) {
      setCliente(clienteRes.cliente);
      onClienteActualizado(clienteRes.cliente);
    }
    setError("No se pudo confirmar a tiempo si el WhatsApp se envió — revisa el estado en unos minutos.");
  }

  async function cambiarEstadoWa(nuevoEstado: string) {
    if (!cliente || !puedeEditar || nuevoEstado === cliente.contactoWhats) return;
    setError(null);
    const res = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo: "mensaje-bienvenida-wa", estado: nuevoEstado }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "No se pudo actualizar el estado del mensaje de bienvenida");
      return;
    }
    setCliente(data.cliente);
    onClienteActualizado(data.cliente);
    const eventosRes = await fetch(`/api/clientes/${encodeURIComponent(cliente.id)}/eventos`).then((r) =>
      r.json()
    );
    setEventos(eventosRes.eventos ?? []);
  }

  function copiar(valor: string, campo: "email" | "telefono") {
    navigator.clipboard.writeText(valor).then(() => {
      setCopiado(campo);
      setTimeout(() => setCopiado(null), 1500);
    });
  }

  const tieneAcceso = cliente
    ? cliente.accesos.general.length > 0 || cliente.accesos.vip.length > 0 || cliente.accesos.black.length > 0
    : false;

  const notasRegistradas = eventos
    .filter((e) => e.tipo === "NOTA")
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Cerrar panel"
        onClick={onClose}
        className="animate-fade-in-fast absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="animate-slide-in-right relative flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[520px]">
        {cargando ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">Cargando…</div>
        ) : !cliente ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-danger">{error ?? "No se pudo cargar el cliente"}</p>
            <button
              onClick={onClose}
              className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="relative flex-none overflow-hidden text-white">
              {/* Fondo: logo del evento/etiqueta del cliente (Club Sinergético
                  por default). Ese logo es un PNG blanco transparente, así
                  que necesita su propio fondo sólido oscuro detrás — los
                  demás ya son imágenes autocontenidas. */}
              <div
                className={`absolute inset-0 bg-cover bg-center ${
                  logoParaCliente(cliente.evento, cliente.etiqueta) === LOGO_NECESITA_FONDO_SOLIDO
                    ? "bg-[#050b1f]"
                    : ""
                }`}
                style={{ backgroundImage: `url(${RUTA_LOGO_EVENTO[logoParaCliente(cliente.evento, cliente.etiqueta)]})` }}
                aria-hidden="true"
              />
              {/* Degradado oscuro encima de la imagen para que el texto
                  blanco se lea bien sin importar qué tan clara sea. */}
              <div
                className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75"
                aria-hidden="true"
              />
              <div className="relative px-6 pb-5 pt-[calc(1.5rem+env(safe-area-inset-top))]">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-white/20 bg-black/30 text-lg font-semibold text-white shadow-sm backdrop-blur-sm">
                    {cliente.nombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {cliente.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                      >
                        {tag}
                      </span>
                    ))}
                    {puedeEditar && (
                      <TagsPopover
                        tagsCatalogo={tagsCatalogo}
                        tagsCliente={cliente.tags}
                        guardandoTag={guardandoTag}
                        onToggle={toggleTag}
                      />
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="ease-spring rounded-full p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </div>

              <div className="mt-4 w-fit max-w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2.5 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-white">{cliente.nombre}</h2>
                  <span
                    className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      tieneAcceso
                        ? "border-success/30 bg-success/25 text-white"
                        : "border-white/15 bg-white/10 text-white"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${tieneAcceso ? "bg-success" : "bg-white/50"}`}
                    />
                    {tieneAcceso ? "Activo" : "Sin acceso"}
                  </span>
                </div>

                <div className="mt-1 flex flex-col gap-0.5 text-sm text-white">
                  <button
                    onClick={() => copiar(cliente.email, "email")}
                    className="ease-spring -ml-1 flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition hover:bg-white/10"
                  >
                    {cliente.email}
                    {copiado === "email" ? (
                      <Check className="h-3 w-3" strokeWidth={2} />
                    ) : (
                      <Copy className="h-3 w-3 opacity-70" strokeWidth={1.75} />
                    )}
                  </button>
                  {cliente.telefono && (
                    <button
                      onClick={() => copiar(cliente.telefono ?? "", "telefono")}
                      className="ease-spring -ml-1 flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition hover:bg-white/10"
                    >
                      {cliente.telefono}
                      {copiado === "telefono" ? (
                        <Check className="h-3 w-3" strokeWidth={2} />
                      ) : (
                        <Copy className="h-3 w-3 opacity-70" strokeWidth={1.75} />
                      )}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                  <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.75} />
                  Cliente desde{" "}
                  {new Date(cliente.fechaInscripcion ?? cliente.creadoEn).toLocaleDateString("es-MX")}
                </span>
                {cliente.telefono && (
                  <>
                    <a
                      href={`https://wa.me/${cliente.telefono.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ease-spring flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/50"
                    >
                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                      WhatsApp
                    </a>
                    <a
                      href={`tel:${cliente.telefono}`}
                      className="ease-spring flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/50"
                    >
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Llamar
                    </a>
                  </>
                )}
                {!puedeEditar ? null : !editando ? (
                  <button
                    onClick={() => setEditando(true)}
                    className="ease-spring ml-auto flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/55"
                  >
                    <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                    Editar
                  </button>
                ) : (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={cancelarEdicion}
                      className="ease-spring flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/50"
                    >
                      <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Cancelar
                    </button>
                    <button
                      onClick={guardar}
                      disabled={guardando || !form.nombre.trim()}
                      className="ease-spring flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0037c7] transition disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                )}
              </div>
              </div>
            </div>

            <nav className="flex flex-none gap-1 overflow-x-auto border-b border-silver/70 bg-surface-2 px-3 py-1.5">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`ease-spring flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === key
                      ? "bg-surface text-primary-deep shadow-sm"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {error && (
                <div className="animate-fade-in-fast mb-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}

              {tab === "resumen" && (
                <div className="space-y-5">
                  <Tarjeta titulo="Accesos y membresías">
                    <div className="grid grid-cols-3 gap-1.5">
                      <AccesoBadge
                        icon={ShieldCheck}
                        label="General"
                        detalle={cliente.accesos.general}
                        tono="primary"
                      />
                      <AccesoBadge icon={Crown} label="VIP" detalle={cliente.accesos.vip} tono="warning" />
                      <AccesoBadge icon={Gem} label="Black" detalle={cliente.accesos.black} tono="black" />
                    </div>
                    <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-silver/60 pt-3.5 text-sm">
                      <CampoValor label="Membresía Skool" valor={cliente.tipoMembresia} />
                      <CampoValor label="Vence Skool" valor={cliente.vencimientoSkool} />
                    </dl>
                    <button
                      onClick={() => setTab("accesos")}
                      className="ease-spring mt-2.5 text-xs font-medium text-primary transition hover:text-primary-deep"
                    >
                      {puedeEditarAccesos ? "Editar accesos →" : "Ver accesos →"}
                    </button>
                  </Tarjeta>

                  <Tarjeta titulo="Estado y próximos pasos">
                    <ul className="space-y-2.5 text-sm">
                      <li className="border-b border-silver/60 pb-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-muted">Mensaje de Bienvenida WA</p>
                          {puedeEditar && (
                            <button
                              onClick={confirmarEnviarWa}
                              disabled={!cliente.telefono || mostrandoEnviandoWa}
                              title={!cliente.telefono ? "El cliente no tiene teléfono registrado" : "Reenviar mensaje de bienvenida"}
                              className="ease-spring flex-none rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Enviar
                            </button>
                          )}
                        </div>
                        <SelectorEstadoWa
                          valor={cliente.contactoWhats}
                          onChange={cambiarEstadoWa}
                          soloLectura={!puedeEditar}
                          enviando={mostrandoEnviandoWa}
                          puntos={puntosEnviando}
                        />
                        {pasoEnviarWa === 1 && (
                          <div className="mt-2 rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                            <p className="mb-2.5 text-xs text-foreground">
                              ¿Reenviar el mensaje de bienvenida por WhatsApp a <strong>{cliente.telefono}</strong>?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPasoEnviarWa(0)}
                                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={confirmarEnviarWa}
                                disabled={enviandoWa}
                                className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                              >
                                {enviandoWa ? "Enviando…" : "Confirmar y enviar"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                      <EstadoFila
                        ok={cliente.accesoPlataforma === "Si"}
                        label="Acceso a la plataforma"
                        valor={cliente.accesoPlataforma}
                      />
                      <EstadoFila
                        ok={
                          cliente.invitacionSkool?.trim().toLowerCase() === "invitación enviada" ||
                          cliente.invitacionSkool?.trim().toLowerCase() === "invitacion enviada"
                        }
                        label="Invitación Skool"
                        valor={cliente.invitacionSkool}
                      />
                      <EstadoFila ok={!!cliente.llamada} label="Llamada de seguimiento" valor={cliente.llamada} />
                    </ul>
                  </Tarjeta>

                  <Tarjeta titulo="Datos del cliente">
                    {!editando ? (
                      <dl className="space-y-2.5 text-sm">
                        <CampoValor label="País" valor={cliente.pais} />
                        <CampoValor label="Evento" valor={cliente.evento} />
                      </dl>
                    ) : (
                      <div className="space-y-3">
                        <Campo label="Nombre">
                          <Input value={form.nombre} onChange={(v) => setForm((f) => ({ ...f, nombre: v }))} />
                        </Campo>
                        <Campo label="Teléfono">
                          <Input
                            value={form.telefono}
                            onChange={(v) => setForm((f) => ({ ...f, telefono: v }))}
                          />
                        </Campo>
                        <Campo label="País">
                          <Input value={form.pais} onChange={(v) => setForm((f) => ({ ...f, pais: v }))} />
                        </Campo>
                      </div>
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Notas recientes">
                    {notasRegistradas.length === 0 ? (
                      <p className="text-sm text-muted">Todavía no hay notas agregadas.</p>
                    ) : (
                      <ul className="space-y-3">
                        {notasRegistradas.slice(0, 3).map((n) => (
                          <NotaItem key={n.id} evento={n} />
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => setTab("notas")}
                      className="ease-spring mt-2.5 text-xs font-medium text-primary transition hover:text-primary-deep"
                    >
                      Ver todas / agregar nota →
                    </button>
                  </Tarjeta>

                  {puedeEliminar && (
                  <Tarjeta titulo="Zona de peligro">
                    {cliente.eliminadoEn ? (
                      <p className="text-sm text-muted">
                        Este cliente fue eliminado el{" "}
                        {new Date(cliente.eliminadoEn).toLocaleString("es-MX", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        .
                      </p>
                    ) : pasoEliminar === 0 ? (
                      <button
                        onClick={confirmarEliminar}
                        className="ease-spring flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Eliminar cliente
                      </button>
                    ) : pasoEliminar === 1 ? (
                      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                        <p className="mb-2.5 text-xs text-foreground">
                          Esto va a borrar de forma <strong>permanente</strong> el contacto en Kajabi, y va a
                          archivar a {cliente.nombre} en el CRM (sale de la lista principal, pero su historial
                          queda guardado en Eliminados). ¿Confirmas?
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPasoEliminar(0)}
                            className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={confirmarEliminar}
                            className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition"
                          >
                            Sí, continuar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                        <p className="mb-2.5 text-xs font-medium text-danger">
                          Última confirmación — el borrado en Kajabi no se puede deshacer.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPasoEliminar(0)}
                            className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={confirmarEliminar}
                            disabled={eliminando}
                            className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                          >
                            {eliminando ? "Eliminando…" : "Confirmar eliminación"}
                          </button>
                        </div>
                      </div>
                    )}
                  </Tarjeta>
                  )}
                </div>
              )}

              {tab === "accesos" && (
                <div className="space-y-5">
                  <Tarjeta titulo="Estado en Kajabi">
                    {cliente.pausadoEn ? (
                      <div className="space-y-3">
                        <p className="flex items-center gap-1.5 text-sm text-warning">
                          <PauseCircle className="h-4 w-4" strokeWidth={1.75} />
                          Membresía pausada desde el{" "}
                          {new Date(cliente.pausadoEn).toLocaleDateString("es-MX")} — acceso revocado en Kajabi.
                        </p>
                        {!puedePausar ? null : pasoReanudar === 0 && (
                          <button
                            onClick={confirmarReanudar}
                            className="ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition"
                          >
                            <PlayCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Reanudar membresía
                          </button>
                        )}
                        {pasoReanudar === 1 && (
                          <div className="rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                            <p className="mb-2.5 text-xs text-foreground">
                              Esto va a otorgar de nuevo la oferta en Kajabi y a recalcular Fin de acceso en el
                              CRM según los días que le quedaban cuando se pausó. ¿Confirmas?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPasoReanudar(0)}
                                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={confirmarReanudar}
                                disabled={reanudando}
                                className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                              >
                                {reanudando ? "Reanudando…" : "Sí, reanudar"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {estadoKajabi === "cargando" && (
                          <p className="text-sm text-muted">Consultando en Kajabi…</p>
                        )}
                        {estadoKajabi === "activa" && (
                          <div className="space-y-3">
                            <p className="flex items-center gap-1.5 text-sm text-success">
                              <Check className="h-4 w-4" strokeWidth={2} />
                              Oferta activa en Kajabi
                            </p>
                            {!puedePausar ? null : pasoPausar === 0 && (
                              <button
                                onClick={confirmarPausar}
                                className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                              >
                                <PauseCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                                Pausar membresía
                              </button>
                            )}
                            {pasoPausar === 1 && (
                              <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                                <p className="mb-2.5 text-xs text-foreground">
                                  Esto va a revocar el acceso en Kajabi ahora mismo. Los días que le quedan se
                                  guardan para cuando se reanude. ¿Confirmas?
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => setPasoPausar(0)}
                                    className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    onClick={confirmarPausar}
                                    disabled={pausando}
                                    className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                                  >
                                    {pausando ? "Pausando…" : "Sí, pausar"}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {estadoKajabi === "sin_contacto" && (
                          <p className="text-sm text-muted">Todavía no tiene contacto en Kajabi.</p>
                        )}
                        {estadoKajabi === "error" && (
                          <p className="text-sm text-muted">No se pudo verificar el estado en Kajabi.</p>
                        )}
                        {estadoKajabi === "revocada" && (
                      <div className="space-y-3">
                        <p className="flex items-center gap-1.5 text-sm text-danger">
                          <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                          La oferta ya no está activa en Kajabi.
                        </p>
                        {!puedeRenovar ? null : pasoRenovar === 0 && (
                          <button
                            onClick={confirmarRenovar}
                            className="ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition"
                          >
                            <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Renovar membresía
                          </button>
                        )}
                        {pasoRenovar === 1 && (
                          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                            <p className="mb-2.5 text-xs text-foreground">
                              Esto va a otorgar la oferta en Kajabi, reenviar la invitación de Skool, poner la
                              etiqueta &quot;Renovación&quot; y actualizar Fin de acceso a un año desde hoy.
                              ¿Confirmas?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPasoRenovar(0)}
                                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={confirmarRenovar}
                                className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition"
                              >
                                Sí, continuar
                              </button>
                            </div>
                          </div>
                        )}
                        {pasoRenovar === 2 && (
                          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                            <p className="mb-2.5 text-xs font-medium text-danger">
                              Última confirmación — esta acción no se puede deshacer fácilmente.
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPasoRenovar(0)}
                                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={confirmarRenovar}
                                disabled={renovando}
                                className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                              >
                                {renovando ? "Renovando…" : "Confirmar renovación"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                      </>
                    )}

                    {puedeRevocarAcceso && cliente.accesoPlataforma?.trim().toLowerCase() !== "no" && (
                      <div className="mt-3 border-t border-silver/60 pt-3">
                        {pasoRevocarAcceso === 0 && (
                          <button
                            onClick={confirmarRevocarAcceso}
                            className="ease-spring flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                          >
                            <Ban className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Revocar acceso
                          </button>
                        )}
                        {pasoRevocarAcceso === 1 && (
                          <div className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                            <p className="mb-2.5 text-xs text-foreground">
                              Esto va a revocar la oferta del Club Sinergético en Kajabi ahora mismo y a poner
                              &quot;Acceso a la plataforma&quot; en &quot;No&quot; — a diferencia de Pausar, no
                              guarda días pendientes para reanudar después. Úsalo para reembolsos u otros casos
                              donde el acceso debe quitarse ya. ¿Confirmas?
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPasoRevocarAcceso(0)}
                                className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={confirmarRevocarAcceso}
                                disabled={revocandoAcceso}
                                className="ease-spring rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                              >
                                {revocandoAcceso ? "Revocando…" : "Sí, revocar acceso"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Otras ofertas">
                    {ofertasClub.length === 0 && !mostrarAgregarOferta && (
                      <p className="text-sm text-muted">
                        Este cliente no tiene ninguna oferta adicional a la del Club.
                      </p>
                    )}
                    {ofertasClub.length > 0 && (
                      <ul className="mb-3 space-y-2">
                        {ofertasClub.map((o) => (
                          <li
                            key={o.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-silver px-3 py-2"
                          >
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-sm text-foreground">
                                <Gift
                                  className={`h-3.5 w-3.5 flex-none ${o.revocadoEn ? "text-muted" : "text-success"}`}
                                  strokeWidth={1.75}
                                />
                                {o.ofertaTitulo}
                              </p>
                              <p className="text-xs text-muted">
                                Otorgada el {new Date(o.fechaOtorgada).toLocaleDateString("es-MX")} por {o.otorgadoPor}
                                {o.revocadoEn &&
                                  ` — revocada el ${new Date(o.revocadoEn).toLocaleDateString("es-MX")} por ${o.revocadoPor}`}
                              </p>
                            </div>
                            {puedeOtorgarOferta && !o.revocadoEn && (
                              <>
                                {confirmandoRevocarId === o.id ? (
                                  <div className="flex flex-none items-center gap-1.5">
                                    <button
                                      onClick={() => setConfirmandoRevocarId(null)}
                                      className="ease-spring rounded-lg border border-silver px-2 py-1 text-xs font-medium text-muted transition hover:text-foreground"
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      onClick={() => confirmarRevocarOferta(o.id)}
                                      disabled={revocandoOfertaId === o.id}
                                      className="ease-spring rounded-lg bg-danger px-2 py-1 text-xs font-medium text-white transition disabled:opacity-50"
                                    >
                                      {revocandoOfertaId === o.id ? "Revocando…" : "Sí, revocar"}
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => confirmarRevocarOferta(o.id)}
                                    className="ease-spring flex-none rounded-lg border border-silver px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-foreground"
                                  >
                                    Revocar
                                  </button>
                                )}
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {puedeOtorgarOferta && !mostrarAgregarOferta && (
                      <button
                        onClick={abrirAgregarOferta}
                        className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                      >
                        <Gift className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Agregar oferta
                      </button>
                    )}

                    {mostrarAgregarOferta && (
                      <div className="rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                        <p className="mb-2 text-xs font-medium text-muted">Elegir oferta de Kajabi</p>
                        <ComboboxBuscador
                          opciones={catalogoOfertasKajabi}
                          valor={ofertaElegida}
                          onChange={setOfertaElegida}
                          placeholder={cargandoCatalogoOfertas ? "Cargando ofertas…" : "Seleccionar oferta…"}
                          disabled={cargandoCatalogoOfertas}
                        />
                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={() => setMostrarAgregarOferta(false)}
                            className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={confirmarAgregarOferta}
                            disabled={!ofertaElegida || otorgandoOferta}
                            className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                          >
                            {otorgandoOferta ? "Otorgando…" : "Otorgar oferta"}
                          </button>
                        </div>
                      </div>
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Accesos a Synergy Unlimited">
                    {!editandoAccesos && cliente.accesosEditadoManual && (
                      <div className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-primary-dim/50 px-3 py-2 text-xs text-primary-deep">
                        <span>Editados a mano — no se recalculan solos.</span>
                        {puedeEditarAccesos && (
                          <button
                            onClick={confirmarLiberarAccesosManual}
                            disabled={liberandoAccesosManual}
                            className="ease-spring flex-none font-medium underline decoration-dotted underline-offset-2 transition hover:text-primary disabled:opacity-50"
                          >
                            {liberandoAccesosManual ? "Recalculando…" : "Volver a calcular automático"}
                          </button>
                        )}
                      </div>
                    )}
                    <AccesosSynergy
                      valor={editandoAccesos && borradorAccesos ? borradorAccesos : cliente.accesos}
                      onChange={setBorradorAccesos}
                      soloLectura={!editandoAccesos}
                      sinInformacion={!editandoAccesos && cliente.boletosSinInformacion}
                    />

                    {puedeEditarAccesos && !editandoAccesos && (
                      <button
                        onClick={iniciarEdicionAccesos}
                        className="ease-spring mt-3 text-xs font-medium text-primary transition hover:text-primary-deep"
                      >
                        Editar accesos →
                      </button>
                    )}

                    {editandoAccesos && !confirmandoAccesos && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={cancelarEdicionAccesos}
                          className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => setConfirmandoAccesos(true)}
                          disabled={
                            !borradorAccesos || diferenciasAccesos(cliente.accesos, borradorAccesos).length === 0
                          }
                          className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Guardar cambios
                        </button>
                      </div>
                    )}

                    {editandoAccesos && confirmandoAccesos && borradorAccesos && (
                      <div className="mt-3 rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                        <p className="mb-2 text-xs font-medium text-foreground">Confirma el cambio de accesos:</p>
                        <ul className="mb-2.5 space-y-1 text-xs text-foreground">
                          {diferenciasAccesos(cliente.accesos, borradorAccesos).map((d) => (
                            <li key={d.nivel}>
                              <span className="font-medium">{ACCESO_LABEL[d.nivel]}:</span> {d.de} → {d.a}
                            </li>
                          ))}
                        </ul>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setConfirmandoAccesos(false)}
                            className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                          >
                            Volver a editar
                          </button>
                          <button
                            onClick={confirmarGuardarAccesos}
                            disabled={guardandoAccesos}
                            className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                          >
                            {guardandoAccesos ? "Guardando…" : "Confirmar y guardar"}
                          </button>
                        </div>
                      </div>
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Acceso a plataforma (histórico)">
                    {!editando ? (
                      <dl className="space-y-2.5 text-sm">
                        <CampoValor label="Registrado en el CSV de origen" valor={cliente.accesoPlataforma} />
                        <CampoValor
                          label="Fecha de renovación"
                          valor={
                            cliente.fechaRenovacion
                              ? new Date(cliente.fechaRenovacion).toLocaleDateString("es-MX")
                              : null
                          }
                        />
                        <CampoValor
                          label="Fin de acceso (calculado)"
                          valor={(() => {
                            const fin = finAccesoCalculado(cliente.fechaInscripcion, cliente.fechaRenovacion);
                            return fin ? fin.toLocaleDateString("es-MX") : null;
                          })()}
                        />
                      </dl>
                    ) : (
                      <div className="space-y-3">
                        <Campo label="Acceso a plataforma">
                          <Input
                            value={form.accesoPlataforma}
                            onChange={(v) => setForm((f) => ({ ...f, accesoPlataforma: v }))}
                          />
                        </Campo>
                        <Campo label="Fecha de renovación">
                          <input
                            type="date"
                            value={form.fechaRenovacion}
                            onChange={(e) => setForm((f) => ({ ...f, fechaRenovacion: e.target.value }))}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <p className="text-xs text-muted">
                          &quot;Fin de acceso&quot; ya no se edita a mano — se calcula solo (fecha de renovación, o
                          si no hay, fecha de inscripción, + 1 año).
                        </p>
                      </div>
                    )}
                  </Tarjeta>
                </div>
              )}

              {tab === "seguimiento" && (
                <Tarjeta titulo="Seguimiento y soporte">
                  {!editando ? (
                    <dl className="space-y-2.5 text-sm">
                      <DatoFila icon={PartyPopper} label="Evento" valor={cliente.evento} />
                      <DatoFila icon={CalendarClock} label="Fecha del evento" valor={cliente.fechaEvento} />
                      <DatoFila icon={Ticket} label="Tipo de membresía" valor={cliente.tipoMembresia} />
                      <DatoFila
                        icon={CalendarClock}
                        label="Vencimiento Skool"
                        valor={cliente.vencimientoSkool}
                      />
                      <DatoFila
                        icon={MessagesSquare}
                        label="Invitación de Skool"
                        valor={cliente.invitacionSkool}
                      />
                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-muted">
                            <MessageCircle className="h-3.5 w-3.5 flex-none" strokeWidth={1.75} />
                            Mensaje de Bienvenida WA
                          </span>
                          {puedeEditar && (
                            <button
                              onClick={confirmarEnviarWa}
                              disabled={!cliente.telefono || mostrandoEnviandoWa}
                              title={!cliente.telefono ? "El cliente no tiene teléfono registrado" : "Reenviar mensaje de bienvenida"}
                              className="ease-spring flex-none rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Enviar
                            </button>
                          )}
                        </div>
                        <SelectorEstadoWa
                          valor={cliente.contactoWhats}
                          onChange={cambiarEstadoWa}
                          soloLectura={!puedeEditar}
                          enviando={mostrandoEnviandoWa}
                          puntos={puntosEnviando}
                        />
                      </div>
                      {pasoEnviarWa === 1 && (
                        <div className="rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                          <p className="mb-2.5 text-xs text-foreground">
                            ¿Reenviar el mensaje de bienvenida por WhatsApp a <strong>{cliente.telefono}</strong>?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPasoEnviarWa(0)}
                              className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={confirmarEnviarWa}
                              disabled={enviandoWa}
                              className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                            >
                              {enviandoWa ? "Enviando…" : "Confirmar y enviar"}
                            </button>
                          </div>
                        </div>
                      )}
                      <DatoFila icon={PhoneCall} label="Llamada" valor={cliente.llamada} />
                    </dl>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Campo label="Evento">
                          <ComboboxBuscador
                            opciones={catalogoEventos}
                            valor={form.evento}
                            onChange={(evento) => setForm((f) => ({ ...f, evento }))}
                            placeholder="Seleccionar evento…"
                          />
                        </Campo>
                        <Campo label="Fecha del evento">
                          <Input
                            value={form.fechaEvento}
                            onChange={(v) => setForm((f) => ({ ...f, fechaEvento: v }))}
                          />
                        </Campo>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Campo label="Tipo de membresía">
                          <Input
                            value={form.tipoMembresia}
                            onChange={(v) => setForm((f) => ({ ...f, tipoMembresia: v }))}
                          />
                        </Campo>
                        <Campo label="Vencimiento Skool">
                          <Input
                            value={form.vencimientoSkool}
                            onChange={(v) => setForm((f) => ({ ...f, vencimientoSkool: v }))}
                          />
                        </Campo>
                      </div>
                      <Campo label="Invitación de Skool">
                        <Input
                          value={form.invitacionSkool}
                          onChange={(v) => setForm((f) => ({ ...f, invitacionSkool: v }))}
                        />
                      </Campo>
                      <Campo label="Llamada">
                        <Input value={form.llamada} onChange={(v) => setForm((f) => ({ ...f, llamada: v }))} />
                      </Campo>
                    </div>
                  )}
                </Tarjeta>
              )}

              {tab === "kajabi" && (
                <div className="space-y-5">
                  <Tarjeta titulo="Perfil de Kajabi">
                    {cargandoPerfilKajabi ? (
                      <p className="text-sm text-muted">Consultando en Kajabi…</p>
                    ) : errorPerfilKajabi ? (
                      <div className="space-y-2">
                        <p className="text-sm text-danger">{errorPerfilKajabi}</p>
                        <button
                          onClick={() => setIntentadoPerfilKajabi(false)}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2"
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Reintentar
                        </button>
                      </div>
                    ) : perfilKajabi && !perfilKajabi.encontrado ? (
                      <p className="text-sm text-muted">Este cliente todavía no tiene contacto en Kajabi.</p>
                    ) : perfilKajabi ? (
                      <dl className="space-y-2.5 text-sm">
                        <CampoValor label="Nombre en Kajabi" valor={perfilKajabi.nombre} />
                        <DatoFila icon={Mail} label="Correo" valor={perfilKajabi.email} />
                        <DatoFila icon={Phone} label="Teléfono" valor={perfilKajabi.telefono} />
                        <DatoFila
                          icon={MapPin}
                          label="Dirección"
                          valor={formatearDireccion(perfilKajabi.direccion).join(" · ") || null}
                        />
                        <CampoValor
                          label="Suscrito a marketing"
                          valor={
                            perfilKajabi.suscritoMarketing === null
                              ? null
                              : perfilKajabi.suscritoMarketing
                                ? "Sí"
                                : "No"
                          }
                        />
                      </dl>
                    ) : null}
                  </Tarjeta>

                  {!cargandoPerfilKajabi && perfilKajabi?.encontrado && (
                    <>
                      <Tarjeta titulo="Ofertas otorgadas actualmente">
                        {perfilKajabi.ofertas.length === 0 ? (
                          <p className="text-sm text-muted">No tiene ninguna oferta otorgada ahora mismo.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {perfilKajabi.ofertas.map((o) => (
                              <li key={o.id} className="flex items-center gap-2 text-sm text-foreground">
                                <ShieldCheck className="h-3.5 w-3.5 flex-none text-success" strokeWidth={1.75} />
                                {o.titulo}
                              </li>
                            ))}
                          </ul>
                        )}
                      </Tarjeta>

                      <Tarjeta titulo="Actividad en la plataforma">
                        <dl className="space-y-2.5 text-sm">
                          <DatoFila
                            icon={LogIn}
                            label="Inicios de sesión"
                            valor={perfilKajabi.signInCount === null ? null : String(perfilKajabi.signInCount)}
                          />
                          <DatoFila
                            icon={Clock}
                            label="Última actividad"
                            valor={
                              perfilKajabi.ultimaActividad
                                ? new Date(perfilKajabi.ultimaActividad).toLocaleString("es-MX", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : null
                            }
                          />
                        </dl>
                      </Tarjeta>
                    </>
                  )}
                </div>
              )}

              {tab === "vsl" && (
                <div className="space-y-5">
                  {/* Timeline general (CRM "Synergy Axis") — primer contacto,
                      eventos/boletos, compras, y estado de Synergy Unlimited. */}
                  <Tarjeta titulo="Historial">
                    {cargandoHistorialAxis ? (
                      <p className="text-sm text-muted">Consultando en el CRM de Axis…</p>
                    ) : errorHistorialAxis ? (
                      <div className="space-y-2">
                        <p className="text-sm text-danger">{errorHistorialAxis}</p>
                        <button
                          onClick={() => setIntentadoHistorialAxis(false)}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2"
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Reintentar
                        </button>
                      </div>
                    ) : historialAxis === null ? (
                      <p className="text-sm text-muted">Sin historial en el CRM de Axis para este correo.</p>
                    ) : historialAxis ? (
                      <div className="space-y-5">
                        <dl className="space-y-2.5 text-sm">
                          {historialAxis.contacto.primerContacto && (
                            <DatoFila
                              icon={CalendarClock}
                              label="Primer contacto"
                              valor={`${new Date(historialAxis.contacto.primerContacto.fecha).toLocaleDateString("es-MX")} · ${historialAxis.contacto.primerContacto.fuenteSistema}${historialAxis.contacto.primerContacto.utmSource ? ` · ${historialAxis.contacto.primerContacto.utmSource}` : ""}`}
                            />
                          )}
                          <DatoFila
                            icon={Clock}
                            label="Última actividad"
                            valor={
                              historialAxis.contacto.ultimaActividad
                                ? new Date(historialAxis.contacto.ultimaActividad).toLocaleString("es-MX", {
                                    dateStyle: "medium",
                                    timeStyle: "short",
                                  })
                                : null
                            }
                          />
                          {historialAxis.contacto.ubicacion && (
                            <DatoFila icon={MapPin} label="Ubicación" valor={historialAxis.contacto.ubicacion} />
                          )}
                          {historialAxis.contacto.ltvCents != null && (
                            <CampoValor
                              label="Valor total de compras (LTV)"
                              valor={formatearCentavos(historialAxis.contacto.ltvCents, null)}
                            />
                          )}
                        </dl>

                        {historialAxis.eventos.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Eventos</p>
                            <ul className="space-y-2">
                              {historialAxis.eventos.map((e, i) => (
                                <li key={i} className="rounded-lg border border-silver px-3 py-2 text-sm">
                                  <p className="font-medium text-foreground">{e.titulo}</p>
                                  <p className="mt-0.5 text-xs text-muted">
                                    {new Date(e.fecha).toLocaleDateString("es-MX")}
                                    {e.tipoAcceso ? ` · ${e.tipoAcceso}` : ""}
                                    {formatearCentavos(e.montoCents, e.currency) ? ` · ${formatearCentavos(e.montoCents, e.currency)}` : ""}
                                  </p>
                                  {e.escaneado !== null && (
                                    <p
                                      className={`mt-1 flex items-center gap-1 text-xs ${e.escaneado ? "text-success" : "text-muted"}`}
                                    >
                                      {e.escaneado ? (
                                        <Check className="h-3 w-3" strokeWidth={2} />
                                      ) : (
                                        <AlertTriangle className="h-3 w-3" strokeWidth={1.75} />
                                      )}
                                      {e.escaneado
                                        ? `Boleto escaneado el ${e.escaneadoEn ? new Date(e.escaneadoEn).toLocaleDateString("es-MX") : ""}`
                                        : "Boleto sin escanear"}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {historialAxis.compras.length > 0 && (
                          <div>
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Compras</p>
                            <ul className="space-y-2">
                              {historialAxis.compras.map((c, i) => (
                                <li key={i} className="rounded-lg border border-silver px-3 py-2 text-sm">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-medium text-foreground">{c.producto}</p>
                                    <span className="flex-none rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                                      {c.estado}
                                    </span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-muted">
                                    {new Date(c.fecha).toLocaleDateString("es-MX")} · {c.plataforma}
                                    {formatearCentavos(c.montoCents, c.currency) ? ` · ${formatearCentavos(c.montoCents, c.currency)}` : ""}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                            Synergy Unlimited
                          </p>
                          <span
                            className={`flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                              historialAxis.synergyUnlimited.elegible
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            {historialAxis.synergyUnlimited.elegible ? (
                              <Check className="h-3.5 w-3.5" strokeWidth={2} />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} />
                            )}
                            {historialAxis.synergyUnlimited.elegible ? "Elegible" : "No elegible"}
                            {historialAxis.synergyUnlimited.motivo ? ` — ${historialAxis.synergyUnlimited.motivo}` : ""}
                          </span>

                          {historialAxis.synergyUnlimited.boletosEntregados.length > 0 && (
                            <ul className="mt-2.5 space-y-2">
                              {historialAxis.synergyUnlimited.boletosEntregados.map((b, i) => (
                                <li
                                  key={i}
                                  className="flex items-center justify-between gap-2 rounded-lg border border-silver px-3 py-2 text-sm"
                                >
                                  <div className="flex items-center gap-1.5 text-foreground">
                                    <Ticket className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
                                    {b.categoria} · {b.pais.toUpperCase()}
                                    {b.esTitular ? "" : ` (${b.asignadoNombre ?? "invitado"})`}
                                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                                      {b.estado}
                                    </span>
                                  </div>
                                  {b.ticketUrl && (
                                    <a
                                      href={b.ticketUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ease-spring flex flex-none items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-deep"
                                    >
                                      Ver boleto
                                      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                                    </a>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}

                          {historialAxis.synergyUnlimited.derechosCalculados.length > 0 &&
                            historialAxis.synergyUnlimited.boletosEntregados.length === 0 && (
                              <p className="mt-2 text-xs text-muted">
                                Tiene derecho a{" "}
                                {historialAxis.synergyUnlimited.derechosCalculados
                                  .map((d) => `${d.cantidad} ${d.categoria} (${d.pais.toUpperCase()})`)
                                  .join(", ")}
                                , pero todavía no se le ha entregado ningún boleto.
                              </p>
                            )}
                        </div>
                      </div>
                    ) : null}
                  </Tarjeta>

                  <Tarjeta titulo="Historial de compras (VSL)">
                    {cargandoHistoricoVsl ? (
                      <p className="text-sm text-muted">Consultando en el CRM de VSL…</p>
                    ) : errorHistoricoVsl ? (
                      <div className="space-y-2">
                        <p className="text-sm text-danger">{errorHistoricoVsl}</p>
                        <button
                          onClick={() => setIntentadoHistoricoVsl(false)}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-surface-2"
                        >
                          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Reintentar
                        </button>
                      </div>
                    ) : historicoVsl && historicoVsl.length === 0 ? (
                      <p className="text-sm text-muted">
                        Sin compras registradas para este correo en el CRM de VSL.
                      </p>
                    ) : historicoVsl ? (
                      <ul className="space-y-2.5">
                        {historicoVsl.map((c) => (
                          <li key={c.leadId} className="rounded-lg border border-silver px-3 py-2.5 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-foreground">{c.producto}</p>
                              <span
                                className={`flex-none rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                  c.accesoDado ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                                }`}
                              >
                                {c.accesoDado ? "Acceso dado" : "Acceso pendiente"}
                              </span>
                            </div>
                            <dl className="mt-1.5 space-y-1 text-xs text-muted">
                              {c.fechaVenta && (
                                <p>
                                  Vendido el {new Date(c.fechaVenta).toLocaleDateString("es-MX")}
                                  {c.vendedor ? ` · ${c.vendedor}` : ""}
                                </p>
                              )}
                              {c.monto != null && (
                                <p>
                                  {c.monto.toLocaleString("es-MX")}
                                  {c.moneda ? ` ${c.moneda}` : ""} · {c.fuenteVenta}
                                </p>
                              )}
                              {c.notas && <p className="whitespace-pre-wrap text-foreground/80">{c.notas}</p>}
                            </dl>
                            {c.comprobanteUrl && (
                              <a
                                href={c.comprobanteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ease-spring mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary transition hover:text-primary-deep"
                              >
                                Ver comprobante →
                              </a>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </Tarjeta>
                </div>
              )}

              {tab === "notas" && (
                <div className="space-y-5">
                  {puedeAgregarNota && (
                  <Tarjeta titulo="Agregar nota">
                    <div className="flex gap-2">
                      <input
                        value={nota}
                        onChange={(e) => setNota(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && enviarNota()}
                        placeholder="Escribe una nota…"
                        className="flex-1 rounded-lg border border-silver bg-surface-2 px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                      />
                      <button
                        onClick={enviarNota}
                        disabled={enviandoNota || !nota.trim()}
                        className="ease-spring flex items-center justify-center rounded-lg brand-plate px-3 text-white transition disabled:opacity-40"
                      >
                        <Send className="h-4 w-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </Tarjeta>
                  )}

                  <Tarjeta titulo="Notas generales">
                    {!editando ? (
                      <p className="whitespace-pre-wrap text-sm text-foreground">
                        {cliente.notas || <span className="text-muted">Sin notas</span>}
                      </p>
                    ) : (
                      <textarea
                        value={form.notas}
                        onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                      />
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Notas de soporte técnico">
                    {!editando ? (
                      <p className="flex items-start gap-1.5 whitespace-pre-wrap text-sm text-foreground">
                        <Headset className="mt-0.5 h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
                        {cliente.notasSoporte || <span className="text-muted">Sin notas de soporte</span>}
                      </p>
                    ) : (
                      <textarea
                        value={form.notasSoporte}
                        onChange={(e) => setForm((f) => ({ ...f, notasSoporte: e.target.value }))}
                        rows={4}
                        className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
                      />
                    )}
                  </Tarjeta>

                  <Tarjeta titulo="Notas registradas">
                    {notasRegistradas.length === 0 ? (
                      <p className="text-sm text-muted">Todavía no hay notas agregadas.</p>
                    ) : (
                      <ul className="space-y-3">
                        {notasRegistradas.map((n) => (
                          <NotaItem key={n.id} evento={n} />
                        ))}
                      </ul>
                    )}
                  </Tarjeta>
                </div>
              )}

              {tab === "actividad" && (
                <div>
                  {puedeAgregarNota && (
                  <div className="mb-4 flex gap-2">
                    <input
                      value={nota}
                      onChange={(e) => setNota(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && enviarNota()}
                      placeholder="Agregar una nota…"
                      className="flex-1 rounded-lg border border-silver bg-surface-2 px-3 py-2 text-sm outline-none ring-primary/30 focus:ring-2"
                    />
                    <button
                      onClick={enviarNota}
                      disabled={enviandoNota || !nota.trim()}
                      className="ease-spring flex items-center justify-center rounded-lg brand-plate px-3 text-white transition disabled:opacity-40"
                    >
                      <Send className="h-4 w-4" strokeWidth={1.75} />
                    </button>
                  </div>
                  )}
                  {puedeVerActividad && (
                    <div className="mb-3 flex justify-end">
                      <Link
                        href={`/actividad?cliente=${encodeURIComponent(clienteId)}`}
                        className="ease-spring text-xs font-medium text-primary transition hover:text-primary-deep"
                      >
                        Ver reporte completo →
                      </Link>
                    </div>
                  )}
                  <Timeline eventos={eventos} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="shell rounded-2xl p-2 diffused">
      <div className="core rounded-[calc(1rem-0.25rem)] p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted">{titulo}</h3>
        {children}
      </div>
    </section>
  );
}

function AccesoBadge({
  icon: Icon,
  label,
  detalle,
  tono,
}: {
  icon: typeof ShieldCheck;
  label: string;
  detalle: Accesos["general"];
  tono: "primary" | "warning" | "black";
}) {
  const activeClass =
    tono === "primary"
      ? "general-plate text-white"
      : tono === "warning"
        ? "vip-plate text-white"
        : "black-plate text-white";
  const activo = detalle.length > 0;
  return (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3.5 text-center ${
        activo ? `${activeClass} border-transparent` : "border-silver bg-surface-2 text-muted"
      }`}
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
      <span className="text-sm font-semibold">{label}</span>
      {activo && (
        <span className="text-xs opacity-80">
          {detalle.map((d) => `${d.cantidad}${d.variante ? ` · ${d.variante}` : ""}`).join(" + ")}
        </span>
      )}
    </div>
  );
}

function EstadoFila({ ok, label, valor }: { ok: boolean; label: string; valor: string | null }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-silver/60 pb-2.5 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-foreground">
        <span
          className={`flex h-4 w-4 flex-none items-center justify-center rounded-full ${
            ok ? "bg-success/20 text-success" : "bg-silver text-muted"
          }`}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
        {label}
      </span>
      <span className="text-xs text-muted">{valor || "Sin registro"}</span>
    </li>
  );
}

function NotaItem({ evento }: { evento: EventoTimeline }) {
  return (
    <li className="border-b border-silver/60 pb-3 last:border-0 last:pb-0">
      <p className="whitespace-pre-wrap text-sm text-foreground">{evento.detalle}</p>
      <p className="mt-1 text-xs text-muted">
        {new Date(evento.fecha).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })} ·{" "}
        {evento.autor}
      </p>
    </li>
  );
}

function DatoFila({
  icon: Icon,
  label,
  valor,
}: {
  icon: typeof Phone;
  label: string;
  valor: string | null;
}) {
  return (
    <div className="flex items-start gap-2 text-foreground">
      <Icon className="mt-0.5 h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.75} />
      <span>
        <span className="text-muted">{label}: </span>
        {valor || <span className="text-muted">—</span>}
      </span>
    </div>
  );
}

function CampoValor({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-foreground">{valor || <span className="text-muted">—</span>}</p>
    </div>
  );
}

function Input({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-silver bg-surface-2 px-3 py-1.5 text-sm outline-none ring-primary/30 focus:ring-2"
    />
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

// Desplegable de "Mensaje de Bienvenida WA" — siempre editable al instante
// (guarda en cuanto cambia), no depende del modo "Editar" general del
// panel, igual que el botón "Enviar" que vive al lado.
function SelectorEstadoWa({
  valor,
  onChange,
  soloLectura,
  enviando,
  puntos,
}: {
  valor: string | null;
  onChange: (v: string) => void;
  soloLectura?: boolean;
  // Mientras se espera la confirmación real de GHL, se muestra "Enviando…"
  // animado en vez del valor guardado — que podría desdecirse en segundos.
  enviando?: boolean;
  puntos?: number;
}) {
  if (enviando) {
    return (
      <p className="text-foreground">
        Enviando<span className="inline-block w-[1.5em] text-left">{".".repeat(puntos ?? 0)}</span>
      </p>
    );
  }
  // Sin valor guardado (nunca se intentó, o llegó por un camino que todavía
  // no toca este campo) se lee como "Pendiente" — nunca como "Enviado". Ojo
  // con el <select> de abajo: si `value` no coincide con ninguna <option>,
  // el navegador muestra la primera opción de la lista igual, sin que eso
  // signifique que ese es el valor real — por eso se normaliza aquí antes.
  const valorMostrado = valor || "Pendiente";
  if (soloLectura) {
    return <p className="text-foreground">{valorMostrado}</p>;
  }
  const esConocido = (ESTADOS_MENSAJE_BIENVENIDA_WA as readonly string[]).includes(valorMostrado);
  return (
    <select
      value={valorMostrado}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-lg border border-silver bg-surface-2 px-2 py-1 text-sm text-foreground outline-none ring-primary/30 focus:ring-2"
    >
      {!esConocido && <option value={valorMostrado}>{valorMostrado} (anterior)</option>}
      {ESTADOS_MENSAJE_BIENVENIDA_WA.map((op) => (
        <option key={op} value={op}>
          {op}
        </option>
      ))}
    </select>
  );
}

function TagsPopover({
  tagsCatalogo,
  tagsCliente,
  guardandoTag,
  onToggle,
}: {
  tagsCatalogo: string[];
  tagsCliente: string[];
  guardandoTag: string | null;
  onToggle: (tag: string, activo: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickFuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("mousedown", onClickFuera);
    return () => document.removeEventListener("mousedown", onClickFuera);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-label="Agregar o quitar tags"
        className="ease-spring flex h-5 w-5 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-sm transition hover:bg-black/50"
      >
        <Plus className="h-3 w-3" strokeWidth={2.5} />
      </button>

      {abierto && (
        <div className="animate-fade-in-fast absolute left-0 top-[calc(100%+6px)] z-20 w-56 rounded-xl border border-silver bg-surface p-1.5 shadow-xl">
          {tagsCatalogo.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-muted">
              Todavía no hay tags en la Biblioteca. Agrégalos desde el menú lateral.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto">
              {tagsCatalogo.map((tag) => {
                const activo = tagsCliente.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => onToggle(tag, !activo)}
                    disabled={guardandoTag === tag}
                    className={`ease-spring flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition disabled:opacity-50 ${
                      activo ? "bg-primary-dim font-medium text-primary-deep" : "text-foreground hover:bg-surface-2"
                    }`}
                  >
                    <span
                      className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                        activo ? "border-primary bg-primary text-white" : "border-silver"
                      }`}
                    >
                      {activo && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="truncate">{tag}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
