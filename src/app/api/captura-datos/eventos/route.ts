import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearEvento, listarEventos } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { crearEvento as esquemaCrearEvento } from "@/lib/captura-datos/validacion";
import { carpetaDeEstatus, type Estatus } from "@/lib/captura-datos/fields";

export async function GET() {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  try {
    const eventos = await listarEventos(permiso.usuario.rol === "admin" ? undefined : permiso.usuario.id);
    return NextResponse.json({ eventos });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos GET");
  }
}

export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  try {
    const b = await leerJson(req, esquemaCrearEvento);
    const evento = await crearEvento({
      nombre: b.nombre || `${carpetaDeEstatus(b.estatus as Estatus)}_${new Date().toISOString().slice(0, 16).replace("T", "_")}`,
      destino: b.destino,
      origen: b.origen,
      creadoPorId: permiso.usuario.id,
      usuariosAsignados: b.usuariosAsignados,
    });
    return NextResponse.json({ evento });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos POST");
  }
}
