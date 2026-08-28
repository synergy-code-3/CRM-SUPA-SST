import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { editarSolicitud } from "@/lib/solicitudes";

// Corregir una solicitud pendiente antes de aprobarla/rechazarla — pensado
// sobre todo para las que crea sola la sincronización con VSL (evento/país
// adivinados por el código de país del teléfono, se pueden equivocar).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudes");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();

  try {
    const solicitud = await editarSolicitud(id, {
      nombre: body.nombre,
      correoPago: body.correoPago,
      correoAcceso: body.correoAcceso,
      telefono: body.telefono,
      pais: body.pais,
      evento: body.evento,
      tipoMembresia: body.tipoMembresia,
    });
    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo editar la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
