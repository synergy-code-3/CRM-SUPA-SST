import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/captura-datos/auditoria";
import { crearHojas, listarHojasDeEvento, nombresDeUsuarios, obtenerEvento } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { idDrive } from "@/lib/captura-datos/validacion";
import { ESTATUS } from "@/lib/captura-datos/fields";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const hojas = await listarHojasDeEvento(id);
    // Solo el nombre de quien tiene o confirmó alguna hoja: para ver quién trabaja cada una y el avance por persona.
    const usuarios = await nombresDeUsuarios(hojas.flatMap((h) => [h.bloqueadaPorId, h.confirmadaPorId].filter((u): u is string => !!u)));
    return NextResponse.json({ hojas, usuarios });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/hojas GET");
  }
}

// Importa hojas que YA están en Drive (elegidas de una carpeta listada antes
// con POST /api/captura-datos/drive/carpeta) — no se sube ni descarga nada,
// solo se crea la fila con su driveId. Para fotos desde la computadora, ver
// el POST de .../hojas/subir (FormData, distinto por el tipo de body).
const importarDesdeD = z.object({
  estatus: z.enum(ESTATUS.map((e) => e.value) as [string, ...string[]]),
  archivos: z.array(z.object({ driveId: idDrive, nombreOriginal: z.string().max(500) })).max(2000),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const evento = await obtenerEvento(id);
    if (!evento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    const b = await leerJson(req, importarDesdeD);
    const hojas = await crearHojas(
      id,
      b.estatus as (typeof ESTATUS)[number]["value"],
      b.archivos.map((a) => ({ origen: { nombreOriginal: a.nombreOriginal, driveId: a.driveId } }))
    );
    await registrarAuditoria({ usuario: permiso.usuario, accion: "hojas_agregadas", eventoId: id, eventoNombre: evento.nombre, detalle: { cantidad: hojas.length, origen: "drive" } });
    return NextResponse.json({ hojas });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/hojas POST");
  }
}
