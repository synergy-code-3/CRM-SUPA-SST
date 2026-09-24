"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  Check,
  Copy,
  Layers,
  LayoutGrid,
  MessageCircle,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  StickyNote,
  Tag as TagIcon,
  Ticket,
  Trash2,
  Undo2,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { ClienteCertificacion, EventoCertificacion } from "@/lib/certificaciones-tipos";
import { REGION_CERTIFICACION_LABEL, REGIONES_CERTIFICACION } from "@/lib/certificaciones-tipos";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { CERTIFICACION_LEGENDAR_IA, beneficiosDeRegion, colorDeTag, diasRestantes, estaActivo, estadoReal } from "./constantes";
import { StatusBadge } from "./StatusBadge";
import { MensajeBienvenidaToggle } from "./Toggles";
import { TagPicker, VendedorSelect } from "./Selectores";
import { CountdownTimer } from "./CountdownTimer";
import { TimelineCert } from "./TimelineCert";

const OPCIONES_REGION = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));

type Tab = "resumen" | "acciones" | "historial";
const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
  { key: "resumen", label: "Resumen", icon: LayoutGrid },
  { key: "acciones", label: "Acciones", icon: Zap },
  { key: "historial", label: "Historial", icon: Activity },
];

type Respuesta = {
  cliente: ClienteCertificacion;
  eventos: EventoCertificacion[];
  estadoClub: "activo" | "inactivo" | null;
};

type FormEdicion = { nombre: string; email: string; telefono: string; region: string; notas: string; monto: string };

// Botones y campos con el estilo del panel del Club (ClientePanel.tsx).
const BTN_PRIMARIO =
  "ease-spring flex items-center gap-1.5 rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50";
const BTN_SECUNDARIO =
  "ease-spring flex items-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-50";
const INPUT =
  "w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2";

// Perfil de un socio de Certificaciones como panel lateral, con el mismo
// formato que ClientePanel del Club (cabecera oscura, pestañas, tarjetas) y
// las opciones del perfil del CRM original: bienvenida WA, vendedor/monto,
// tags, certificaciones, beneficios Synergy Unlimited, acciones,
// temporizador, línea de tiempo y eliminar. Sin "Registrar abono".
export function ClienteCertificacionPanel({
  clienteId,
  vendedores,
  onClose,
  onCambio,
}: {
  clienteId: string;
  vendedores: string[];
  onClose: () => void;
  onCambio: () => void;
}) {
  const { usuario } = useSesion();
  const puedeGestionar = !!usuario && tienePermiso(usuario.rol, "gestionarCertificaciones");
  const puedeNotas = !!usuario && tienePermiso(usuario.rol, "agregarNotaCertificaciones");

  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resumen");
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormEdicion | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [notaNueva, setNotaNueva] = useState("");
  const [diasExtra, setDiasExtra] = useState("");
  const [diasCorregir, setDiasCorregir] = useState("");
  const [copiado, setCopiado] = useState<"email" | "telefono" | null>(null);

  const url = `/api/certificaciones/${encodeURIComponent(clienteId)}`;

  const cargar = useCallback(async () => {
    const res = await fetch(url);
    if (!res.ok) {
      setError("No se pudo cargar el cliente");
      return;
    }
    setDatos(await res.json());
    setError(null);
  }, [url]);

  useEffect(() => {
    setDatos(null);
    setEditando(false);
    setTab("resumen");
    cargar();
  }, [cargar]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Ejecuta una acción POST del cliente y refresca panel + lista.
  async function accion(ruta: string, body?: unknown, confirmar?: string): Promise<boolean> {
    if (confirmar && !window.confirm(confirmar)) return false;
    setProcesando(true);
    try {
      const res = await fetch(`${url}/${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "No se pudo completar la acción");
        return false;
      }
      if (data.avisoSkool) alert(`Invitación registrada, pero hubo un problema con Skool:\n\n${data.avisoSkool}`);
      await cargar();
      onCambio();
      return true;
    } finally {
      setProcesando(false);
    }
  }

  async function quitar(ruta: "tags" | "etiquetas", param: string, valor: string) {
    if (!window.confirm(`¿Quitar "${valor}"?`)) return;
    setProcesando(true);
    try {
      const res = await fetch(`${url}/${ruta}?${param}=${encodeURIComponent(valor)}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "No se pudo quitar");
        return;
      }
      await cargar();
      onCambio();
    } finally {
      setProcesando(false);
    }
  }

  function abrirEdicion() {
    if (!datos) return;
    const c = datos.cliente;
    setForm({
      nombre: c.nombre,
      email: c.email ?? "",
      telefono: c.telefono ?? "",
      region: c.region ?? "",
      notas: c.notas ?? "",
      monto: c.monto ?? "",
    });
    setTab("resumen");
    setEditando(true);
  }

  async function guardarEdicion() {
    if (!form) return;
    setProcesando(true);
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "No se pudo guardar");
        return;
      }
      setEditando(false);
      await cargar();
      onCambio();
    } finally {
      setProcesando(false);
    }
  }

  async function enviarNota() {
    if (!notaNueva.trim()) return;
    if (await accion("nota", { nota: notaNueva })) setNotaNueva("");
  }

  async function enviarDias(modo: "agregar" | "corregir") {
    const valor = Number(modo === "agregar" ? diasExtra : diasCorregir);
    if (!Number.isInteger(valor) || valor < (modo === "agregar" ? 1 : 0)) {
      alert("Escribe un número entero de días válido");
      return;
    }
    const ok = await accion(
      "dias",
      { accion: modo, dias: valor },
      modo === "corregir" ? `¿Corregir los días restantes a ${valor} desde hoy?` : undefined
    );
    if (ok) (modo === "agregar" ? setDiasExtra : setDiasCorregir)("");
  }

  async function eliminar() {
    if (!datos) return;
    if (!window.confirm(`¿Enviar a "${datos.cliente.nombre}" a la papelera? Se puede restaurar durante 30 días.`)) return;
    if (await accion("eliminar")) onClose();
  }

  async function copiar(valor: string, cual: "email" | "telefono") {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(cual);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      // portapapeles no disponible
    }
  }

  const cliente = datos?.cliente;
  const estado = cliente ? estadoReal(cliente) : null;
  const dias = cliente ? diasRestantes(cliente) : null;
  const beneficios = cliente ? beneficiosDeRegion(cliente.region) : [];
  const tieneLegendarIA = cliente?.etiquetas.some((e) => e.toLowerCase() === CERTIFICACION_LEGENDAR_IA.toLowerCase());
  // Mismo criterio que el badge "Activo" de la lista (compara timestamps: con
  // días redondeados, alguien vencido hace horas seguía saliendo "Activo").
  const activo = !!cliente && estaActivo(cliente);

  // Portal a <body>: el panel se pinta fuera de <main> (que es el que hace
  // scroll), así la rueda sobre el fondo o al llegar al final del perfil ya no
  // mueve la lista de atrás — el scroll no tiene por dónde encadenarse.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Cerrar panel"
        onClick={onClose}
        className="animate-fade-in-fast absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="animate-slide-in-right relative flex h-full w-full flex-col bg-surface shadow-2xl sm:w-[520px]">
        {!cliente || !estado ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
            {error ? (
              <>
                <p className="text-danger">{error}</p>
                <button onClick={onClose} className={BTN_SECUNDARIO}>
                  Cerrar
                </button>
              </>
            ) : (
              "Cargando…"
            )}
          </div>
        ) : (
          <>
            {/* Cabecera oscura, igual que el panel del Club */}
            <div className="relative flex-none overflow-hidden text-white">
              <div
                className="absolute inset-0 bg-[#050b1f] bg-cover bg-center"
                style={{ backgroundImage: "url(/certificaciones/legendar-ia-logo.png)" }}
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/55 to-black/75" aria-hidden="true" />
              <div className="relative px-6 pb-5 pt-[calc(1.5rem+env(safe-area-inset-top))]">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full border border-white/20 bg-black/30 text-lg font-semibold text-white shadow-sm backdrop-blur-sm">
                      {cliente.nombre.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                        {(CERTIFICACION_LEGENDAR_IA).toUpperCase()}
                      </span>
                      {cliente.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/15 bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm"
                        >
                          {tag}
                        </span>
                      ))}
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
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">{cliente.nombre}</h2>
                    <span
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        activo ? "border-success/30 bg-success/25 text-white" : "border-white/15 bg-white/10 text-white"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-success" : "bg-white/50"}`} />
                      {cliente.pausada ? "Pausado" : activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5 text-sm text-white">
                    {cliente.email && (
                      <button
                        onClick={() => copiar(cliente.email!, "email")}
                        className="ease-spring -ml-1 flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-left transition hover:bg-white/10"
                      >
                        {cliente.email}
                        {copiado === "email" ? (
                          <Check className="h-3 w-3" strokeWidth={2} />
                        ) : (
                          <Copy className="h-3 w-3 opacity-70" strokeWidth={1.75} />
                        )}
                      </button>
                    )}
                    {cliente.telefono && (
                      <button
                        onClick={() => copiar(cliente.telefono!, "telefono")}
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
                    Cliente desde {new Date(cliente.fechaLlegada).toLocaleDateString("es-MX")}
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
                  {puedeGestionar &&
                    (!editando ? (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={abrirEdicion}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/35 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/55"
                        >
                          <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Editar
                        </button>
                      </div>
                    ) : (
                      <div className="ml-auto flex items-center gap-2">
                        <button
                          onClick={() => setEditando(false)}
                          className="ease-spring flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/30 px-2.5 py-1.5 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/50"
                        >
                          <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Cancelar
                        </button>
                        <button
                          onClick={guardarEdicion}
                          disabled={procesando || !form?.nombre.trim()}
                          className="ease-spring flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0037c7] transition disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" strokeWidth={1.75} />
                          {procesando ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            <nav className="flex flex-none gap-1 overflow-x-auto border-b border-silver/70 bg-surface-2 px-3 py-1.5">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`ease-spring flex flex-none items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    tab === key ? "bg-surface text-primary-deep shadow-sm" : "text-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                  {label}
                </button>
              ))}
            </nav>

            <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-6">
              {tab === "resumen" && (
                <div className="space-y-5">
                  <Tarjeta titulo="Estado y membresía">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        estado={estado}
                        onClick={
                          puedeGestionar && cliente.estado === "INVITACION_ENVIADA"
                            ? () => accion("aceptar", undefined, `¿Marcar la invitación de "${cliente.nombre}" como aceptada?`)
                            : undefined
                        }
                        cargando={procesando}
                        title={cliente.estado === "INVITACION_ENVIADA" ? "Clic para marcar la invitación como aceptada" : undefined}
                      />
                      {cliente.pausada && (
                        <span className="rounded-full bg-warning/10 px-3 py-1 text-[11px] font-medium text-warning">Pausada</span>
                      )}
                      {datos!.estadoClub && (
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-medium ${
                            datos!.estadoClub === "activo" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                          }`}
                        >
                          Club: {datos!.estadoClub === "activo" ? "Activo" : "Inactivo"}
                        </span>
                      )}
                    </div>
                    <dl className="mt-3.5 grid grid-cols-2 gap-3 border-t border-silver/60 pt-3.5 text-sm">
                      <CampoValor label="Ingresó" valor={new Date(cliente.fechaLlegada).toLocaleDateString("es-MX")} />
                      <CampoValor
                        label="Vence"
                        valor={cliente.fechaVencimiento ? new Date(cliente.fechaVencimiento).toLocaleDateString("es-MX") : null}
                      />
                      <CampoValor
                        label="Días restantes"
                        valor={dias === null ? null : dias <= 0 ? "Vencida" : `${dias} días`}
                      />
                      <CampoValor
                        label="Invitación"
                        valor={cliente.fechaInvitacion ? new Date(cliente.fechaInvitacion).toLocaleDateString("es-MX") : null}
                      />
                    </dl>
                  </Tarjeta>

                  <Tarjeta titulo="Bienvenida WA Soporte">
                    <div className="flex flex-wrap items-center gap-3">
                      {puedeGestionar ? (
                        <MensajeBienvenidaToggle
                          clienteId={cliente.id}
                          estado={cliente.mensajeBienvenida}
                          onCambio={() => {
                            cargar();
                            onCambio();
                          }}
                        />
                      ) : (
                        <p className="text-sm text-foreground">{cliente.mensajeBienvenida}</p>
                      )}
                      {cliente.telefono && (
                        <a
                          href={`https://wa.me/${cliente.telefono.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ease-spring flex items-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/25"
                        >
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Enviar bienvenida por WhatsApp
                        </a>
                      )}
                    </div>
                  </Tarjeta>

                  <Tarjeta titulo="Vendedor y monto">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <VendedorSelect
                          valor={cliente.vendedor}
                          vendedores={vendedores}
                          compacto
                          disabled={!puedeGestionar || procesando}
                          onChange={async (v) => {
                            await accion("vendedor", { vendedor: v });
                          }}
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-muted">Monto</p>
                        <p className="text-sm font-semibold text-success">{cliente.monto || "—"}</p>
                      </div>
                    </div>
                  </Tarjeta>

                  <Tarjeta titulo="Tags">
                    <div className="flex flex-wrap items-center gap-2">
                      {cliente.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${colorDeTag(tag)}`}
                        >
                          <TagIcon className="h-3 w-3" strokeWidth={1.75} />
                          {tag}
                          {puedeGestionar && (
                            <button
                              onClick={() => quitar("tags", "tag", tag)}
                              aria-label={`Quitar ${tag}`}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                            >
                              <X className="h-3 w-3" strokeWidth={2} />
                            </button>
                          )}
                        </span>
                      ))}
                      {cliente.tags.length === 0 && !puedeGestionar && <span className="text-sm text-muted">Sin tags</span>}
                      {puedeGestionar && (
                        <TagPicker
                          seleccionados={cliente.tags}
                          disabled={procesando}
                          onAgregar={async (tags) => {
                            await accion("tags", { tags });
                          }}
                        />
                      )}
                    </div>
                  </Tarjeta>

                  <Tarjeta titulo="Certificaciones">
                    <div className="flex flex-wrap items-center gap-2">
                      {cliente.etiquetas.map((e) => (
                        <span
                          key={e}
                          className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                        >
                          <Layers className="h-3 w-3" strokeWidth={1.75} />
                          {e}
                          {puedeGestionar && (
                            <button
                              onClick={() => quitar("etiquetas", "etiqueta", e)}
                              aria-label={`Quitar ${e}`}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-black/10"
                            >
                              <X className="h-3 w-3" strokeWidth={2} />
                            </button>
                          )}
                        </span>
                      ))}
                      {cliente.etiquetas.length === 0 && (
                        <span className="rounded-full bg-silver px-3 py-1 text-xs font-medium text-muted">No asignados</span>
                      )}
                      {puedeGestionar && !tieneLegendarIA && (
                        <button
                          onClick={() => accion("etiquetas", { etiquetas: [CERTIFICACION_LEGENDAR_IA] })}
                          disabled={procesando}
                          className="flex items-center gap-1.5 rounded-full border border-dashed border-silver-deep/60 px-3 py-1.5 text-xs font-medium text-muted transition hover:border-primary/50 hover:text-primary disabled:opacity-50"
                        >
                          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                          Agregar a {CERTIFICACION_LEGENDAR_IA}
                        </button>
                      )}
                    </div>
                  </Tarjeta>

                  {beneficios.length > 0 && (
                    <Tarjeta titulo="Beneficios Synergy Unlimited" icono={Ticket}>
                      <ul className="flex flex-col gap-2">
                        {beneficios.map((b) => (
                          <li
                            key={`${b.evento}-${b.tipo}`}
                            className="flex items-center justify-between rounded-xl bg-primary-dim px-4 py-2.5 text-sm text-primary-deep"
                          >
                            <span>{b.evento}</span>
                            <span>
                              {b.cantidad}x {b.tipo}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Tarjeta>
                  )}

                  {cliente.fechaVencimiento && (
                    <Tarjeta>
                      <CountdownTimer
                        fechaInicio={cliente.fechaLlegada}
                        fechaVencimiento={cliente.fechaVencimiento}
                        pausada={cliente.pausada}
                        fechaPausa={cliente.fechaPausa}
                      />
                    </Tarjeta>
                  )}

                  <Tarjeta titulo="Datos del cliente">
                    {editando && form ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        <Campo label="Nombre">
                          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={INPUT} />
                        </Campo>
                        <Campo label="Correo">
                          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />
                        </Campo>
                        <Campo label="Teléfono">
                          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={INPUT} />
                        </Campo>
                        <Campo label="Monto pagado">
                          <input value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className={INPUT} />
                        </Campo>
                        <div className="col-span-2">
                          <Campo label="Región">
                            <ComboboxBuscador
                              opciones={OPCIONES_REGION}
                              valor={form.region}
                              onChange={(region) => setForm({ ...form, region })}
                              placeholder="Seleccionar…"
                              etiquetaVacio="— Sin región —"
                            />
                          </Campo>
                        </div>
                        <div className="col-span-2">
                          <Campo label="Notas">
                            <textarea
                              value={form.notas}
                              onChange={(e) => setForm({ ...form, notas: e.target.value })}
                              rows={3}
                              className={`${INPUT} resize-none`}
                            />
                          </Campo>
                        </div>
                      </div>
                    ) : (
                      <dl className="grid grid-cols-2 gap-3 text-sm">
                        <div className="col-span-2">
                          <CampoValor label="Correo" valor={cliente.email} />
                        </div>
                        <CampoValor label="Teléfono" valor={cliente.telefono} />
                        <CampoValor label="Región" valor={cliente.region ? REGION_CERTIFICACION_LABEL[cliente.region] : null} />
                        <CampoValor label="Agregado por" valor={cliente.creadoPor} />
                        {cliente.notas && (
                          <div className="col-span-2">
                            <p className="text-xs font-medium text-muted">Notas</p>
                            <p className="whitespace-pre-wrap text-foreground">{cliente.notas}</p>
                          </div>
                        )}
                      </dl>
                    )}
                  </Tarjeta>
                </div>
              )}

              {tab === "acciones" && (
                <div className="space-y-5">
                  {puedeGestionar ? (
                    <Tarjeta titulo="Acciones">
                      <div className="flex flex-wrap gap-2">
                        {cliente.estado === "NUEVO" && (
                          <button
                            className={BTN_PRIMARIO}
                            disabled={procesando}
                            onClick={() => accion("invitar", undefined, `¿Enviar la invitación a "${cliente.nombre}"?`)}
                          >
                            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Enviar invitación
                          </button>
                        )}
                        {cliente.estado === "INVITACION_ENVIADA" && (
                          <>
                            <button
                              className={BTN_PRIMARIO}
                              disabled={procesando}
                              onClick={() => accion("aceptar", undefined, "¿Marcar la invitación como aceptada?")}
                            >
                              <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Marcar invitación aceptada
                            </button>
                            <button
                              className={BTN_SECUNDARIO}
                              disabled={procesando}
                              onClick={() => accion("deshacer", { que: "invitacion" }, "¿Deshacer el envío de la invitación?")}
                            >
                              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Deshacer invitación
                            </button>
                          </>
                        )}
                        {(cliente.estado === "ACTIVO" || cliente.estado === "VENCIDO") && (
                          <>
                            <button
                              className={BTN_PRIMARIO}
                              disabled={procesando}
                              onClick={() => accion("renovar", undefined, "¿Renovar la membresía por 1 año más?")}
                            >
                              <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Renovar membresía (1 año)
                            </button>
                            <button
                              className={BTN_SECUNDARIO}
                              disabled={procesando}
                              onClick={() => accion("deshacer", { que: "aceptacion" }, "¿Deshacer la aceptación de la invitación?")}
                            >
                              <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                              Deshacer aceptación
                            </button>
                          </>
                        )}
                        {cliente.email && (
                          <button
                            className={BTN_SECUNDARIO}
                            disabled={procesando}
                            onClick={() => accion("reenviar-skool", undefined, `¿Reenviar la invitación a Skool a ${cliente.email}?`)}
                          >
                            <Send className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Reenviar invitación a Skool
                          </button>
                        )}
                        {cliente.pausada ? (
                          <button className={BTN_SECUNDARIO} disabled={procesando} onClick={() => accion("reanudar")}>
                            <Play className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Reanudar temporizador
                          </button>
                        ) : (
                          <button className={BTN_SECUNDARIO} disabled={procesando} onClick={() => accion("pausar")}>
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.75} />
                            Pausar temporizador
                          </button>
                        )}
                        <button
                          className={BTN_SECUNDARIO}
                          disabled={procesando}
                          onClick={() => accion("dias", { accion: "agregar", dias: 30 }, "¿Agregar 30 días a la membresía?")}
                        >
                          <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Agregar 30 días
                        </button>
                      </div>

                      <div className="mt-4 space-y-3 border-t border-silver/60 pt-4">
                        <FilaDias
                          titulo="Agregar días personalizados"
                          placeholder="Ej. 15"
                          valor={diasExtra}
                          onChange={setDiasExtra}
                          boton="Agregar"
                          disabled={procesando}
                          onEnviar={() => enviarDias("agregar")}
                        />
                        <div>
                          <FilaDias
                            titulo="Corregir días restantes (desde hoy)"
                            placeholder="Ej. 20"
                            valor={diasCorregir}
                            onChange={setDiasCorregir}
                            boton="Corregir"
                            disabled={procesando}
                            onEnviar={() => enviarDias("corregir")}
                          />
                          <p className="mt-1.5 text-xs text-muted">
                            Usa esto para corregir el temporizador si le diste sin querer a renovar u otra acción.
                          </p>
                        </div>
                      </div>
                    </Tarjeta>
                  ) : (
                    <p className="text-sm text-muted">No tienes permiso para modificar este cliente.</p>
                  )}

                  {puedeNotas && (
                    <Tarjeta titulo="Agregar nota" icono={StickyNote}>
                      <div className="flex gap-2">
                        <input
                          value={notaNueva}
                          onChange={(e) => setNotaNueva(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && enviarNota()}
                          placeholder="Escribe una nota sobre el cliente…"
                          className={`${INPUT} flex-1`}
                        />
                        <button
                          onClick={enviarNota}
                          disabled={procesando || !notaNueva.trim()}
                          className={BTN_PRIMARIO}
                        >
                          Guardar
                        </button>
                      </div>
                    </Tarjeta>
                  )}

                  {puedeGestionar && (
                    <Tarjeta titulo="Eliminar cliente">
                      <p className="text-sm text-muted">
                        Se envía a la papelera por 30 días. Desde ahí se puede restaurar tal como estaba o eliminar
                        definitivamente.
                      </p>
                      <button
                        onClick={eliminar}
                        disabled={procesando}
                        className="ease-spring mt-3 flex items-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Eliminar cliente
                      </button>
                    </Tarjeta>
                  )}
                </div>
              )}

              {tab === "historial" && (
                <Tarjeta>
                  <TimelineCert eventos={datos!.eventos} />
                </Tarjeta>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

function Tarjeta({
  titulo,
  icono: Icon,
  children,
}: {
  titulo?: string;
  icono?: typeof Ticket;
  children: React.ReactNode;
}) {
  return (
    <section className="shell rounded-2xl p-2 diffused">
      <div className="core rounded-[calc(1rem-0.25rem)] p-4">
        {titulo && (
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            {Icon && <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />}
            {titulo}
          </h3>
        )}
        {children}
      </div>
    </section>
  );
}

function CampoValor({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="break-words text-foreground">{valor || <span className="text-muted">—</span>}</p>
    </div>
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

function FilaDias({
  titulo,
  placeholder,
  valor,
  onChange,
  boton,
  disabled,
  onEnviar,
}: {
  titulo: string;
  placeholder: string;
  valor: string;
  onChange: (v: string) => void;
  boton: string;
  disabled?: boolean;
  onEnviar: () => void;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
        {titulo}
      </p>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${INPUT} w-28`}
        />
        <button onClick={onEnviar} disabled={disabled || !valor.trim()} className={BTN_SECUNDARIO}>
          {boton}
        </button>
      </div>
    </div>
  );
}
