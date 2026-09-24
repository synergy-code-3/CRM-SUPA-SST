"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Globe2,
  Layers,
  Mail,
  MessageCircle,
  Pause,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Send,
  StickyNote,
  Tag as TagIcon,
  Ticket,
  Trash2,
  Undo2,
  User,

  DollarSign,
  X,
} from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { ClienteCertificacion, EventoCertificacion } from "@/lib/certificaciones-tipos";
import { REGION_CERTIFICACION_LABEL, REGIONES_CERTIFICACION } from "@/lib/certificaciones-tipos";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";
import { CERTIFICACION_LEGENDAR_IA, beneficiosDeRegion, colorDeTag, estadoReal } from "./constantes";
import { StatusBadge } from "./StatusBadge";
import { CopyButton } from "./CopyButton";
import { MensajeBienvenidaToggle } from "./Toggles";
import { TagPicker, VendedorSelect } from "./Selectores";
import { CountdownTimer } from "./CountdownTimer";
import { TimelineCert } from "./TimelineCert";

const OPCIONES_REGION = REGIONES_CERTIFICACION.map((r) => ({ valor: r, etiqueta: REGION_CERTIFICACION_LABEL[r] }));

type Respuesta = {
  cliente: ClienteCertificacion;
  eventos: EventoCertificacion[];
  estadoClub: "activo" | "inactivo" | null;
};

type FormEdicion = { nombre: string; email: string; telefono: string; region: string; notas: string; monto: string };

// Perfil de un socio de Certificaciones como panel lateral (mismo formato que
// ClientePanel del Club) con las secciones del perfil del CRM original:
// cabecera, vendedor/monto, tags, certificaciones, beneficios Synergy
// Unlimited, acciones, temporizador, línea de tiempo y eliminar. Sin
// "Registrar abono" (aquí no se llevan seguimientos).
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
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<FormEdicion | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [notaNueva, setNotaNueva] = useState("");
  const [diasExtra, setDiasExtra] = useState("");
  const [diasCorregir, setDiasCorregir] = useState("");

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

  const cliente = datos?.cliente;
  const estado = cliente ? estadoReal(cliente) : null;
  const beneficios = cliente ? beneficiosDeRegion(cliente.region) : [];
  const tieneLegendarIA = cliente?.etiquetas.some((e) => e.toLowerCase() === CERTIFICACION_LEGENDAR_IA.toLowerCase());

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Cerrar panel"
        onClick={onClose}
        className="animate-fade-in-fast absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
      />
      <div className="animate-slide-in-right relative flex h-full w-full flex-col bg-background shadow-2xl sm:w-[600px]">
        {!cliente ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
            {error ? (
              <>
                <p className="text-danger">{error}</p>
                <button onClick={onClose} className="rounded-full border border-silver-deep/60 px-4 py-2 text-xs font-medium">
                  Cerrar
                </button>
              </>
            ) : (
              "Cargando…"
            )}
          </div>
        ) : (
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
            {/* 1. Cabecera */}
            <Tarjeta>
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      estado={estado!}
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
                    {puedeGestionar && !editando && (
                      <button
                        onClick={abrirEdicion}
                        className="flex items-center gap-1.5 rounded-full border border-silver-deep/60 px-3 py-1 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:border-primary/50 hover:text-primary"
                      >
                        <Pencil className="h-3 w-3" strokeWidth={1.75} />
                        Editar
                      </button>
                    )}
                  </div>
                  <button
                    onClick={onClose}
                    aria-label="Cerrar"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
                  >
                    <X className="h-4 w-4" strokeWidth={1.75} />
                  </button>
                </div>

                {editando && form ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo label="Nombre">
                      <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className={INPUT} />
                    </Campo>
                    <Campo label="Correo">
                      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={INPUT} />
                    </Campo>
                    <Campo label="Teléfono">
                      <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} className={INPUT} />
                    </Campo>
                    <Campo label="Región">
                      <ComboboxBuscador
                        opciones={OPCIONES_REGION}
                        valor={form.region}
                        onChange={(region) => setForm({ ...form, region })}
                        placeholder="Seleccionar…"
                        etiquetaVacio="— Sin región —"
                      />
                    </Campo>
                    <Campo label="Monto pagado">
                      <input value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} className={INPUT} />
                    </Campo>
                    <div className="sm:col-span-2">
                      <Campo label="Notas">
                        <textarea
                          value={form.notas}
                          onChange={(e) => setForm({ ...form, notas: e.target.value })}
                          rows={3}
                          className={`${INPUT} resize-none`}
                        />
                      </Campo>
                    </div>
                    <div className="flex items-center gap-3 sm:col-span-2">
                      <button
                        onClick={guardarEdicion}
                        disabled={procesando || !form.nombre.trim()}
                        className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-60"
                      >
                        {procesando ? "Guardando…" : "Guardar"}
                      </button>
                      <button onClick={() => setEditando(false)} className="text-sm text-muted hover:text-foreground">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div>
                      <h2 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
                        {cliente.nombre}
                        {(tieneLegendarIA || cliente.etiquetas.length === 0) && (
                          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                            {CERTIFICACION_LEGENDAR_IA}
                          </span>
                        )}
                        {datos.estadoClub && (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              datos.estadoClub === "activo" ? "bg-success/10 text-success" : "bg-danger/10 text-danger"
                            }`}
                          >
                            Club: {datos.estadoClub === "activo" ? "Activo" : "Inactivo"}
                          </span>
                        )}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
                        {cliente.email && (
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {cliente.email}
                            <CopyButton valor={cliente.email} />
                          </span>
                        )}
                        {cliente.telefono && (
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {cliente.telefono}
                            <CopyButton valor={cliente.telefono} />
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Agregado por: {cliente.creadoPor}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
                          Ingresó: {new Date(cliente.fechaLlegada).toLocaleDateString("es-MX")}
                        </span>
                        {cliente.region && (
                          <span className="flex items-center gap-1.5">
                            <Globe2 className="h-3.5 w-3.5" strokeWidth={1.5} />
                            {REGION_CERTIFICACION_LABEL[cliente.region]}
                          </span>
                        )}
                      </div>
                      {cliente.notas && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{cliente.notas}</p>}
                    </div>

                    <div className="flex flex-col items-start gap-2 rounded-2xl bg-surface-2 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-primary">Bienvenida WA Soporte</p>
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
                          className="flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition-colors hover:bg-success/25"
                        >
                          <MessageCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                          Enviar bienvenida por WhatsApp
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Tarjeta>

            {/* 2. Vendedor y monto */}
            <Tarjeta>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">Vendedor</p>
                  <VendedorSelect
                    valor={cliente.vendedor}
                    vendedores={vendedores}
                    disabled={!puedeGestionar || procesando}
                    onChange={async (v) => {
                      await accion("vendedor", { vendedor: v });
                    }}
                  />
                </div>
                <div className="text-right">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Monto</p>
                  <p className="flex items-center justify-end gap-1 text-sm font-medium text-success">
                    <DollarSign className="h-3.5 w-3.5" strokeWidth={1.75} />
                    {cliente.monto ? cliente.monto.replace(/^\$/, "$") : "—"}
                  </p>
                </div>
              </div>
            </Tarjeta>

            {/* 3. Tags */}
            <Tarjeta>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted">Tags</span>
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

            {/* 4. Certificaciones */}
            <Tarjeta>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted">Certificaciones</span>
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
                    className="flex items-center gap-1.5 rounded-full border border-dashed border-silver-deep/60 px-3 py-1.5 text-xs font-medium text-muted transition-all duration-500 ease-spring hover:border-primary/50 hover:text-primary disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                    Agregar a {CERTIFICACION_LEGENDAR_IA}
                  </button>
                )}
              </div>
            </Tarjeta>

            {/* 5. Beneficios Synergy Unlimited */}
            {beneficios.length > 0 && (
              <Tarjeta>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-[0.15em] text-muted">
                  <Ticket className="h-4 w-4 text-primary" strokeWidth={1.5} />
                  Beneficios Synergy Unlimited
                </h3>
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

            {/* 6. Acciones */}
            {puedeGestionar && (
              <Tarjeta>
                <h3 className="mb-4 text-sm font-medium uppercase tracking-[0.15em] text-muted">Acciones</h3>
                <div className="flex flex-wrap gap-3">
                  {cliente.estado === "NUEVO" && (
                    <BotonPrimario icono={Send} disabled={procesando} onClick={() => accion("invitar", undefined, `¿Enviar la invitación a "${cliente.nombre}"?`)}>
                      Enviar invitación
                    </BotonPrimario>
                  )}
                  {cliente.estado === "INVITACION_ENVIADA" && (
                    <>
                      <BotonPrimario icono={Send} disabled={procesando} onClick={() => accion("aceptar", undefined, "¿Marcar la invitación como aceptada?")}>
                        Marcar invitación aceptada
                      </BotonPrimario>
                      <BotonSecundario icono={Undo2} disabled={procesando} onClick={() => accion("deshacer", { que: "invitacion" }, "¿Deshacer el envío de la invitación?")}>
                        Deshacer invitación
                      </BotonSecundario>
                    </>
                  )}
                  {(cliente.estado === "ACTIVO" || cliente.estado === "VENCIDO") && (
                    <>
                      <BotonPrimario icono={RefreshCw} disabled={procesando} onClick={() => accion("renovar", undefined, "¿Renovar la membresía por 1 año más?")}>
                        Renovar membresía (1 año)
                      </BotonPrimario>
                      <BotonSecundario icono={Undo2} disabled={procesando} onClick={() => accion("deshacer", { que: "aceptacion" }, "¿Deshacer la aceptación de la invitación?")}>
                        Deshacer aceptación
                      </BotonSecundario>
                    </>
                  )}
                  {cliente.email && (
                    <BotonSecundario
                      icono={Send}
                      disabled={procesando}
                      onClick={() => accion("reenviar-skool", undefined, `¿Reenviar la invitación a Skool a ${cliente.email}?`)}
                    >
                      Reenviar invitación a Skool
                    </BotonSecundario>
                  )}
                  {cliente.pausada ? (
                    <BotonSecundario icono={Play} disabled={procesando} onClick={() => accion("reanudar")}>
                      Reanudar temporizador
                    </BotonSecundario>
                  ) : (
                    <BotonSecundario icono={Pause} disabled={procesando} onClick={() => accion("pausar")}>
                      Pausar temporizador
                    </BotonSecundario>
                  )}
                  <BotonSecundario
                    icono={CalendarPlus}
                    disabled={procesando}
                    onClick={() => accion("dias", { accion: "agregar", dias: 30 }, "¿Agregar 30 días a la membresía?")}
                  >
                    Agregar 30 días
                  </BotonSecundario>
                </div>

                <div className="mt-5 flex flex-col gap-4">
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
                    <p className="mt-2 text-xs text-muted">
                      Usa esto para corregir el temporizador si le diste sin querer a renovar u otra acción.
                    </p>
                  </div>
                </div>

                {puedeNotas && (
                  <div className="mt-5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
                      <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Agregar nota
                    </p>
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
                        className="rounded-2xl bg-surface-2 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary-dim disabled:opacity-40"
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                )}
              </Tarjeta>
            )}

            {/* 7. Temporizador */}
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

            {/* 8. Línea de tiempo */}
            <Tarjeta>
              <TimelineCert eventos={datos.eventos} />
            </Tarjeta>

            {/* 9. Eliminar */}
            {puedeGestionar && (
              <Tarjeta>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Eliminar cliente</p>
                    <p className="text-sm text-muted">
                      Se envía a la papelera por 30 días. Desde ahí se puede restaurar tal como estaba o eliminar
                      definitivamente.
                    </p>
                  </div>
                  <button
                    onClick={eliminar}
                    disabled={procesando}
                    className="flex flex-none items-center justify-center gap-2 rounded-full bg-danger/10 px-5 py-2.5 text-sm font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                    Eliminar cliente
                  </button>
                </div>
              </Tarjeta>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const INPUT =
  "w-full rounded-2xl border border-silver-deep/60 bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none transition-all duration-500 ease-spring placeholder:text-muted/60 focus:border-primary/50 focus:ring-4 focus:ring-primary/10";

function Tarjeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell rounded-[1.75rem] p-1.5 diffused">
      <div className="core rounded-[calc(1.75rem-0.375rem)] p-5">{children}</div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function BotonPrimario({
  icono: Icon,
  children,
  onClick,
  disabled,
}: {
  icono: typeof Send;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="group flex items-center gap-2 rounded-full bg-primary py-1 pl-5 pr-1 text-sm font-medium text-white shadow-[0_10px_24px_-8px_rgba(10,92,255,0.5)] transition-all duration-500 ease-spring active:scale-[0.98] disabled:opacity-60"
    >
      <span className="py-2">{children}</span>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 transition-transform duration-500 ease-spring group-hover:translate-x-1">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    </button>
  );
}

function BotonSecundario({
  icono: Icon,
  children,
  onClick,
  disabled,
}: {
  icono: typeof Send;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-2 rounded-full border border-silver-deep/60 bg-surface-2 px-5 py-2.5 text-sm font-medium text-muted transition-all duration-500 ease-spring hover:border-danger/30 hover:text-danger active:scale-[0.98] disabled:opacity-50"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
      {children}
    </button>
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
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
        <CalendarPlus className="h-3.5 w-3.5" strokeWidth={1.5} />
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
        <button
          onClick={onEnviar}
          disabled={disabled || !valor.trim()}
          className="rounded-2xl bg-surface-2 px-4 text-sm font-medium text-primary transition-colors hover:bg-primary-dim disabled:opacity-40"
        >
          {boton}
        </button>
      </div>
    </div>
  );
}

