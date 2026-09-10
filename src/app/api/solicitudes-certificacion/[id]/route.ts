import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { editarSolicitudCertificacion } from "@/lib/solicitudes-certificacion";

// Corregir una solicitud pendiente antes de aprobarla/rechazarla — pensado
// sobre todo para las que crea sola la sincronización con VSL (región
// adivinada por el código de país del teléfono, se puede equivocar).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("revisarSolicitudesCertificacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();

  try {
    const solicitud = await editarSolicitudCertificacion(id, {
      nombre: body.nombre,
      correo: body.correo,
      telefono: body.telefono,
      region: body.region,
      monto: body.monto,
      etiqueta: body.etiqueta,
      notas: body.notas,
    });
    return NextResponse.json({ solicitud });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo editar la solicitud";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
