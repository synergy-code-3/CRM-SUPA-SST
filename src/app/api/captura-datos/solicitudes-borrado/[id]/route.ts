import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { resolverBorrado } from "@/lib/captura-datos/borrado";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { idUuid, resolucionBorrado } from "@/lib/captura-datos/validacion";
import { ErrorPeticion } from "@/lib/captura-datos/errores";

// Aprobar borra el evento; rechazar lo deja intacto. Solo la persona aprobadora (ver esAprobadorBorrado).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    if (!idUuid.safeParse(id).success) throw new ErrorPeticion(404, "No encontrada");
    const b = await leerJson(req, resolucionBorrado);
    await resolverBorrado(permiso.usuario, id, b.accion === "aprobar");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/solicitudes-borrado/[id] PATCH");
  }
}
