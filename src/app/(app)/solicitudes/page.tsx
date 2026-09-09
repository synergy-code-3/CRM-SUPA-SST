"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Pencil, Sparkles, X } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { EstadoSolicitud, SolicitudCliente } from "@/lib/types";
import { FormularioSolicitudCliente } from "@/components/FormularioSolicitudCliente";
import { ComboboxBuscador } from "@/components/ComboboxBuscador";

type SolicitudConUrls = SolicitudCliente & { comprobantesUrl: string[] };

const OPCIONES_MEMBRESIA = ["3 Meses", "6 Meses", "12 Meses"].map((m) => ({ valor: m, etiqueta: m }));

type FormEdicion = {
  nombre: string;
  correoPago: string;
  correoAcceso: string;
  telefono: string;
  pais: string;
  evento: string;
  tipoMembresia: string;
  etiqueta: string;
  notas: string;
};

function formEdicionDeSolicitud(s: SolicitudCliente): FormEdicion {
  return {
    nombre: s.nombre,
    correoPago: s.correoPago,
    correoAcceso: s.correoAcceso,
    telefono: s.telefono,
    pais: s.pais ?? "",
    evento: s.evento,
    tipoMembresia: s.tipoMembresia,
    etiqueta: s.etiqueta ?? "",
    notas: s.notas ?? "",
  };
}

const ESTADO_ESTILO: Record<EstadoSolicitud, string> = {
  pendiente: "bg-warning/15 text-warning",
  aprobada: "bg-success/15 text-success",
  rechazada: "bg-danger/15 text-danger",
};
const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export default function SolicitudesPage() {
  const { usuario } = useSesion();
  const [solicitudes, setSolicitudes] = useState<SolicitudConUrls[] | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formEdicion, setFormEdicion] = useState<FormEdicion | null>(null);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [todosLosEventos, setTodosLosEventos] = useState<string[]>([]);
  const [todasLasEtiquetas, setTodasLasEtiquetas] = useState<string[]>([]);
  // Cuando el correo de acceso ya es cliente, el back corta antes de tocar
  // nada y pide elegir un modo (ver POST /api/solicitudes/[id]/aprobar) —
  // este estado abre el cuadro de opciones con lo que devolvió esa primera
  // llamada.
  const [modoSolicitud, setModoSolicitud] = useState<{
    id: string;
    clienteExistente: { id: string; nombre: string; accesoPlataforma: string | null; pausadoEn: string | null };
  } | null>(null);
  // Cuadro de solo lectura con los datos capturados en el formulario —
  // no es el perfil del cliente, solo lo que mandó la vendedora.
  const [verSolicitud, setVerSolicitud] = useState<SolicitudConUrls | null>(null);

  const puedeRevisar = usuario ? tienePermiso(usuario.rol, "revisarSolicitudes") : false;

  const cargar = useCallback(async () => {
    const res = await fetch("/api/solicitudes");
    if (!res.ok) return;
    const data = await res.json();
    setSolicitudes(data.solicitudes);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (!puedeRevisar) return;
    fetch("/api/eventos-synergy")
      .then((r) => r.json())
      .then((data) => setTodosLosEventos([...(data.presencial ?? []), ...(data.webinar ?? []), ...(data.otro ?? [])]))
      .catch(() => {});
    fetch("/api/etiquetas-solicitud")
      .then((r) => r.json())
      .then((data) => setTodasLasEtiquetas(data.opciones ?? []))
      .catch(() => {});
  }, [puedeRevisar]);

  function abrirEdicion(s: SolicitudCliente) {
    setEditandoId(s.id);
    setFormEdicion(formEdicionDeSolicitud(s));
  }

  async function guardarEdicion(id: string) {
    if (!formEdicion) return;
    setGuardandoEdicion(true);
    try {
      const res = await fetch(`/api/solicitudes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formEdicion),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo guardar");
        return;
      }
      setEditandoId(null);
      setFormEdicion(null);
      cargar();
    } finally {
      setGuardandoEdicion(false);
    }
  }

  async function aprobar(id: string) {
    if (!confirm("¿Aprobar esta solicitud? Se creará el cliente y se dispararán Kajabi, Skool y el WhatsApp de bienvenida."))
      return;
    await enviarAprobacion(id);
  }

  // modo va vacío en el primer intento — si el correo ya es cliente, el back
  // corta con 409/necesitaModo sin tocar nada, y aquí se abre el cuadro de
  // opciones (modoSolicitud) para reintentar con el modo que elija el admin.
  async function enviarAprobacion(id: string, modo?: string) {
    setProcesando(id);
    try {
      const res = await fetch(`/api/solicitudes/${id}/aprobar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modo ? { modo } : {}),
      });
      const data = await res.json();
      if (res.status === 409 && data.necesitaModo) {
        setModoSolicitud({ id, clienteExistente: data.clienteExistente });
        return;
      }
      if (!res.ok) {
        alert(data.error ?? "No se pudo aprobar la solicitud");
        return;
      }
      const avisos = [data.avisoKajabi, data.avisoSkool, data.avisoGhl, data.avisoVsl].filter(Boolean);
      if (avisos.length) alert(`Se aplicó, pero hubo problemas:\n\n${avisos.join("\n")}`);
      setModoSolicitud(null);
      cargar();
    } finally {
      setProcesando(null);
    }
  }

  async function rechazar(id: string) {
    const nota = prompt("¿Por qué se rechaza? (opcional)") ?? "";
    setProcesando(id);
    try {
      const res = await fetch(`/api/solicitudes/${id}/rechazar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo rechazar la solicitud");
        return;
      }
      cargar();
    } finally {
      setProcesando(null);
    }
  }

  if (!usuario) return null;

  // El GET ya filtra en el servidor: si puede revisar, trae las de todos;
  // si no, solo las propias.
  const pendientesDeTodos = solicitudes?.filter((s) => s.estado === "pendiente") ?? [];
  const listaTabla = solicitudes ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Solicitudes</h1>
        <p className="text-sm text-muted">
          {puedeRevisar
            ? "Revisa y aprueba las solicitudes de alta de cliente que envía el equipo."
            : "Solicita el alta de un cliente nuevo con su comprobante de pago — un administrador la revisa y crea el cliente en el CRM."}
        </p>
      </div>

      {!puedeRevisar && <FormularioSolicitudCliente onEnviada={cargar} />}

      {puedeRevisar && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-foreground">
            Pendientes de revisión {pendientesDeTodos.length > 0 && `(${pendientesDeTodos.length})`}
          </h2>
          {pendientesDeTodos.length === 0 && <p className="text-sm text-muted">No hay solicitudes pendientes.</p>}
          <div className="space-y-3">
            {pendientesDeTodos.map((s) => (
              <div key={s.id} className="shell rounded-2xl p-2 diffused">
                <div className="core space-y-3 rounded-[calc(1rem-0.5rem)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{s.nombre}</p>
                      <p className="text-xs text-muted">
                        Acceso: {s.correoAcceso} · Pago: {s.correoPago} · {s.telefono}
                      </p>
                      <p className="text-xs text-muted">
                        {s.evento} · {s.tipoMembresia}
                        {s.etiqueta ? ` · ${s.etiqueta}` : ""} · solicitado por {s.solicitadoPorNombre}
                      </p>
                      {s.notas && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-foreground">
                          <span className="font-medium text-muted">Nota: </span>
                          {s.notas}
                        </p>
                      )}
                      {s.notaRevision && <p className="mt-1 text-xs text-muted">{s.notaRevision}</p>}
                    </div>
                    <div className="flex flex-none items-center gap-1.5">
                      {s.leadIdVsl && (
                        <span className="flex items-center gap-1 rounded-full bg-primary-dim px-2.5 py-1 text-xs font-medium text-primary-deep">
                          <Sparkles className="h-3 w-3" strokeWidth={1.75} />
                          Detectado por VSL
                        </span>
                      )}
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[s.estado]}`}>
                        {ESTADO_LABEL[s.estado]}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {s.comprobantesUrl.map((url, i) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="ease-spring flex items-center gap-1 rounded-lg border border-silver px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                      >
                        Comprobante {i + 1}
                        <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                      </a>
                    ))}
                  </div>

                  {editandoId === s.id && formEdicion ? (
                    <div className="space-y-2.5 rounded-lg border border-primary/30 bg-primary-dim/40 p-3">
                      <div className="grid grid-cols-2 gap-2.5">
                        <Campo label="Nombre">
                          <input
                            value={formEdicion.nombre}
                            onChange={(e) => setFormEdicion((f) => f && { ...f, nombre: e.target.value })}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <Campo label="Teléfono">
                          <input
                            value={formEdicion.telefono}
                            onChange={(e) => setFormEdicion((f) => f && { ...f, telefono: e.target.value })}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <Campo label="Correo de acceso">
                          <input
                            value={formEdicion.correoAcceso}
                            onChange={(e) => setFormEdicion((f) => f && { ...f, correoAcceso: e.target.value })}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <Campo label="Correo de pago">
                          <input
                            value={formEdicion.correoPago}
                            onChange={(e) => setFormEdicion((f) => f && { ...f, correoPago: e.target.value })}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <Campo label="País">
                          <input
                            value={formEdicion.pais}
                            onChange={(e) => setFormEdicion((f) => f && { ...f, pais: e.target.value })}
                            className="w-full rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                          />
                        </Campo>
                        <Campo label="Tipo de membresía">
                          <ComboboxBuscador
                            opciones={OPCIONES_MEMBRESIA}
                            valor={formEdicion.tipoMembresia}
                            onChange={(tipoMembresia) => setFormEdicion((f) => f && { ...f, tipoMembresia })}
                            placeholder="Seleccionar…"
                          />
                        </Campo>
                        <div className="col-span-2">
                          <Campo label="Evento">
                            <ComboboxBuscador
                              opciones={todosLosEventos.map((e) => ({ valor: e, etiqueta: e }))}
                              valor={formEdicion.evento}
                              onChange={(evento) => setFormEdicion((f) => f && { ...f, evento })}
                              placeholder="Seleccionar evento…"
                            />
                          </Campo>
                        </div>
                        <div className="col-span-2">
                          <Campo label="Etiqueta">
                            <ComboboxBuscador
                              opciones={todasLasEtiquetas.map((e) => ({ valor: e, etiqueta: e }))}
                              valor={formEdicion.etiqueta}
                              onChange={(etiqueta) => setFormEdicion((f) => f && { ...f, etiqueta })}
                              placeholder="Seleccionar etiqueta…"
                              etiquetaVacio="— Ninguna —"
                            />
                          </Campo>
                        </div>
                        <div className="col-span-2">
                          <Campo label="Notas">
                            <textarea
                              value={formEdicion.notas}
                              onChange={(e) => setFormEdicion((f) => f && { ...f, notas: e.target.value })}
                              rows={2}
                              className="w-full resize-none rounded-lg border border-silver bg-surface-2 px-2.5 py-1.5 text-xs outline-none ring-primary/30 focus:ring-2"
                            />
                          </Campo>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setEditandoId(null);
                            setFormEdicion(null);
                          }}
                          className="ease-spring rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-muted transition hover:text-foreground"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => guardarEdicion(s.id)}
                          disabled={guardandoEdicion}
                          className="ease-spring rounded-lg brand-plate px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50"
                        >
                          {guardandoEdicion ? "Guardando…" : "Guardar cambios"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => aprobar(s.id)}
                        disabled={procesando === s.id}
                        className="ease-spring flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-success/15 px-3 py-1.5 text-xs font-medium text-success transition hover:bg-success/25 disabled:opacity-40"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Aprobar y crear cliente
                      </button>
                      <button
                        onClick={() => abrirEdicion(s)}
                        disabled={procesando === s.id}
                        className="ease-spring flex items-center justify-center gap-1.5 rounded-lg border border-silver px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Editar
                      </button>
                      <button
                        onClick={() => rechazar(s.id)}
                        disabled={procesando === s.id}
                        className="ease-spring flex items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                      >
                        <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Rechazar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{puedeRevisar ? "Todas las solicitudes" : "Mis solicitudes"}</h2>
        {listaTabla.length === 0 && <p className="text-sm text-muted">Todavía no hay solicitudes.</p>}
        <div className="overflow-hidden rounded-2xl border border-silver">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Correo de acceso</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Enviada</th>
              </tr>
            </thead>
            <tbody>
              {listaTabla.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setVerSolicitud(s)}
                  className="ease-spring cursor-pointer border-t border-silver/60 transition hover:bg-surface-2"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{s.nombre}</td>
                  <td className="px-4 py-3 text-muted">{s.correoAcceso}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[s.estado]}`}>
                      {ESTADO_LABEL[s.estado]}
                    </span>
                    {s.estado === "rechazada" && s.notaRevision && (
                      <p className="mt-1 text-xs text-muted">{s.notaRevision}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(s.creadoEn).toLocaleString("es-MX")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modoSolicitud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-silver bg-surface p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-foreground">Este correo ya es cliente del CRM</h3>
            <p className="mt-1 text-sm text-muted">
              {modoSolicitud.clienteExistente.nombre} —{" "}
              {modoSolicitud.clienteExistente.pausadoEn ||
              !["si", "renovación"].includes(
                (modoSolicitud.clienteExistente.accesoPlataforma ?? "").trim().toLowerCase()
              )
                ? "membresía inactiva"
                : "membresía activa"}
              . ¿Qué quieres hacer con la solicitud?
            </p>
            <div className="mt-4 space-y-2">
              <button
                onClick={() => enviarAprobacion(modoSolicitud.id, "renovacion")}
                disabled={procesando === modoSolicitud.id}
                className="ease-spring w-full rounded-lg bg-success/15 px-3 py-2 text-left text-xs font-medium text-success transition hover:bg-success/25 disabled:opacity-40"
              >
                Renovación — igual que el botón &quot;Renovar membresía&quot;
              </button>
              {(solicitudes?.find((s) => s.id === modoSolicitud.id)?.etiqueta ?? "").trim().toLowerCase() ===
                "black access" && (
                <button
                  onClick={() => enviarAprobacion(modoSolicitud.id, "black_access")}
                  disabled={procesando === modoSolicitud.id}
                  className="ease-spring w-full rounded-lg border border-silver px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  Agregar Black Access — suma un acceso Black + 3 meses de Skool a lo que ya tenía
                </button>
              )}
              <button
                onClick={() => enviarAprobacion(modoSolicitud.id, "activar")}
                disabled={procesando === modoSolicitud.id}
                className="ease-spring w-full rounded-lg border border-silver px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
              >
                Solo activar su membresía — igual que el botón &quot;Activar oferta&quot;
              </button>
              <button
                onClick={() => enviarAprobacion(modoSolicitud.id, "sin_cambios")}
                disabled={procesando === modoSolicitud.id}
                className="ease-spring w-full rounded-lg border border-silver px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
              >
                Aprobar sin tocar el CRM — lo resuelvo yo a mano
              </button>
              <button
                onClick={() => setModoSolicitud(null)}
                disabled={procesando === modoSolicitud.id}
                className="ease-spring w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-40"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {verSolicitud && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setVerSolicitud(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-silver bg-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">{verSolicitud.nombre}</h3>
                <p className="text-xs text-muted">Solicitado por {verSolicitud.solicitadoPorNombre}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[verSolicitud.estado]}`}>
                {ESTADO_LABEL[verSolicitud.estado]}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <DatoSolicitud label="Correo de acceso" valor={verSolicitud.correoAcceso} />
              <DatoSolicitud label="Correo de pago" valor={verSolicitud.correoPago} />
              <DatoSolicitud label="Teléfono" valor={verSolicitud.telefono} />
              <DatoSolicitud label="País" valor={verSolicitud.pais} />
              <DatoSolicitud label="Evento" valor={verSolicitud.evento} />
              <DatoSolicitud label="Tipo de membresía" valor={verSolicitud.tipoMembresia} />
              <DatoSolicitud label="Etiqueta" valor={verSolicitud.etiqueta} />
              <DatoSolicitud label="Enviada" valor={new Date(verSolicitud.creadoEn).toLocaleString("es-MX")} />
              {verSolicitud.revisadoPor && (
                <DatoSolicitud
                  label="Revisada por"
                  valor={`${verSolicitud.revisadoPor}${verSolicitud.revisadoEn ? " — " + new Date(verSolicitud.revisadoEn).toLocaleString("es-MX") : ""}`}
                />
              )}
            </div>

            {verSolicitud.notas && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted">Nota de la vendedora</p>
                <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-xs text-foreground">
                  {verSolicitud.notas}
                </p>
              </div>
            )}

            {verSolicitud.notaRevision && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted">Nota de revisión</p>
                <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-xs text-foreground">
                  {verSolicitud.notaRevision}
                </p>
              </div>
            )}

            {verSolicitud.comprobantesUrl.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted">Comprobantes</p>
                <div className="flex flex-wrap gap-2">
                  {verSolicitud.comprobantesUrl.map((url, i) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="ease-spring flex items-center gap-1 rounded-lg border border-silver px-2.5 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface-2"
                    >
                      Comprobante {i + 1}
                      <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                    </a>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setVerSolicitud(null)}
              className="ease-spring mt-4 w-full rounded-lg border border-silver px-3 py-2 text-xs font-medium text-foreground transition hover:bg-surface-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DatoSolicitud({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="text-foreground">{valor?.trim() ? valor : "—"}</p>
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
