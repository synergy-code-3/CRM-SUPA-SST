// El CRM de Renovaciones nos avisa por acá cuando un cliente inactivo
// renovó allá. Esto NO renueva solo: crea una solicitud pendiente que un
// admin aprueba desde /solicitudes, y al aprobarla se dispara exactamente
// el mismo flujo que el botón "Renovar" del perfil (ver
// src/lib/solicitudes-renovacion.ts).
import { NextRequest, NextResponse } from "next/server";
import { requerirTokenExterno } from "@/lib/token-externo";
import { crearSolicitudRenovacionExterna, ErrorClienteNoEncontrado } from "@/lib/solicitudes-renovacion";

type NotaEntrante = { texto?: unknown; fecha?: unknown; autor?: unknown };

type BodyEntrante = {
  solicitud_id?: unknown;
  etiqueta?: unknown;
  renovado_por?: unknown;
  fecha?: unknown;
  cliente?: {
    id?: unknown;
    correo?: unknown;
    notas?: unknown;
  };
};

export async function POST(req: NextRequest) {
  const noAutorizado = requerirTokenExterno(req, "RENOVACIONES_API_TOKEN");
  if (noAutorizado) return noAutorizado;

  let body: BodyEntrante;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const solicitudId = typeof body.solicitud_id === "string" ? body.solicitud_id.trim() : "";
  const clienteId = typeof body.cliente?.id === "string" ? body.cliente.id.trim() : "";
  const correo = typeof body.cliente?.correo === "string" ? body.cliente.correo.trim() : "";
  if (!solicitudId || !body.cliente || (!clienteId && !correo)) {
    return NextResponse.json({ error: "Faltan solicitud_id y/o cliente.id/cliente.correo" }, { status: 400 });
  }

  const notasCliente = Array.isArray(body.cliente.notas)
    ? (body.cliente.notas as NotaEntrante[])
        .filter((n) => typeof n.texto === "string")
        .map((n) => ({
          texto: n.texto as string,
          fecha: typeof n.fecha === "string" ? n.fecha : new Date().toISOString(),
          autor: typeof n.autor === "string" ? n.autor : "CRM Renovaciones",
        }))
    : [];

  try {
    const solicitud = await crearSolicitudRenovacionExterna({
      solicitudIdExterno: solicitudId,
      clienteId: clienteId || null,
      correo: correo || null,
      etiqueta: typeof body.etiqueta === "string" && body.etiqueta ? body.etiqueta : "renovacion",
      renovadoPor: typeof body.renovado_por === "string" ? body.renovado_por : null,
      fechaExterna: typeof body.fecha === "string" ? body.fecha : null,
      notasCliente,
    });
    return NextResponse.json({ ok: true, id: solicitud.id });
  } catch (err) {
    if (err instanceof ErrorClienteNoEncontrado) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
    }
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
