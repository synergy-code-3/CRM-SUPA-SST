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
    setProcesando(id);
    try {
      const res = await fetch(`/api/solicitudes/${id}/aprobar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "No se pudo aprobar la solicitud");
        return;
      }
      const avisos = [data.avisoKajabi, data.avisoSkool, data.avisoGhl, data.avisoVsl].filter(Boolean);
      if (avisos.length) alert(`Cliente creado, pero hubo problemas:\n\n${avisos.join("\n")}`);
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
                <tr key={s.id} className="border-t border-silver/60">
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
