"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { useSesion } from "@/lib/session-context";
import { tienePermiso } from "@/lib/permisos";
import type { EstadoSolicitud, SolicitudCliente } from "@/lib/types";
import { FormularioSolicitudCliente } from "@/components/FormularioSolicitudCliente";

type SolicitudConUrls = SolicitudCliente & { comprobantesUrl: string[] };

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
      const avisos = [data.avisoKajabi, data.avisoSkool, data.avisoGhl].filter(Boolean);
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
                        {s.evento} · {s.tipoMembresia} · solicitado por {s.solicitadoPorNombre}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ESTADO_ESTILO[s.estado]}`}>
                      {ESTADO_LABEL[s.estado]}
                    </span>
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
                      onClick={() => rechazar(s.id)}
                      disabled={procesando === s.id}
                      className="ease-spring flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                      Rechazar
                    </button>
                  </div>
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
