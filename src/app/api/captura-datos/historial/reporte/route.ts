import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requerirPermiso } from "@/lib/auth";
import { listarConfirmaciones } from "@/lib/captura-datos/auditoria";
import { resumirCaptura } from "@/lib/captura-datos/historial";
import { ErrorPeticion, respuestaError } from "@/lib/captura-datos/api";

const consulta = z.object({
  eventoId: z.uuid().optional(),
  fechaDesde: z.iso.datetime().optional(),
  fechaHasta: z.iso.datetime().optional(),
});

// Reporte de captura: quién capturó cuánto, cuándo empezó y terminó y cuánto tardó por hoja. Solo admin.
export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const q = consulta.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!q.success) throw new ErrorPeticion(400, "Parámetros inválidos.");
    const { registros, truncado } = await listarConfirmaciones(q.data);
    return NextResponse.json({ filas: resumirCaptura(registros), truncado });
  } catch (err) {
    return respuestaError(err, "captura-datos/historial/reporte GET");
  }
}
