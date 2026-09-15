import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { reenviarSolicitudInvalida } from "@/lib/solicitudes";

// El vendedor corrige y reenvía SU PROPIA solicitud marcada "correo
// inválido" — vuelve a "pendiente" para que un admin la revise otra vez.
// Gateado por solicitarCliente (compartido por los 3 roles, igual que crear
// una solicitud nueva); el ownership real (solo el dueño puede reenviar la
// suya) se valida dentro de reenviarSolicitudInvalida.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("solicitarCliente");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    const solicitud = await reenviarSolicitudInvalida(id, permiso.usuario.id, {
      nombre: body.nombre,
      correoPago: body.correoPago,
      correoAcceso: body.correoAcceso,
      telefono: body.telefono,
      pais: body.pais,
      evento: body.evento,
      tipoMembresia: body.tipoMembresia,
      etiqueta: body.etiqueta,
      notas: body.notas,
    });
    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo reenviar la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
