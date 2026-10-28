import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requerirPermiso } from "@/lib/auth";
import { listarAuditoria } from "@/lib/captura-datos/auditoria";
import { ErrorPeticion, respuestaError } from "@/lib/captura-datos/api";

const consulta = z.object({
  eventoId: z.uuid().optional(),
  antes: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().min(1).max(100).optional(),
});

// Historial de movimientos de Captura de Datos: solo admin. No cuelga de un evento concreto porque también debe verse
// lo de eventos ya borrados (por eso no usa requerirEvento).
export async function GET(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const q = consulta.safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!q.success) throw new ErrorPeticion(400, "Parámetros inválidos.");
    return NextResponse.json(await listarAuditoria(q.data));
  } catch (err) {
    return respuestaError(err, "captura-datos/historial GET");
  }
}
