import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/captura-datos/auditoria";
import { crearHojas, obtenerEvento } from "@/lib/captura-datos/db";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { leerTanda, subirTanda } from "@/lib/captura-datos/subida-drive";

export const maxDuration = 300;

// Fotos/páginas de PDF subidas desde la computadora a un evento ya creado; cada archivo llega como JPEG desde el navegador.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const evento = await obtenerEvento(id);
    if (!evento) throw new ErrorPeticion(404, "Evento no encontrado");
    if (evento.estado !== "abierto") throw new ErrorPeticion(409, "El evento ya está confirmado.");

    const tanda = await leerTanda(req);
    const fotos = await subirTanda(evento.destino.id, tanda);
    const hojas = await crearHojas(id, tanda.estatus, fotos.map((origen) => ({ origen })));

    await registrarAuditoria({ usuario: permiso.usuario, accion: "hojas_agregadas", eventoId: id, eventoNombre: evento.nombre, detalle: { cantidad: hojas.length, origen: "local" } });
    return NextResponse.json({ hojas });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/hojas/subir POST");
  }
}
