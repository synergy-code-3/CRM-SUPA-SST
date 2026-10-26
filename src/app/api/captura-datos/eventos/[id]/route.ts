import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { listarHojasDeEvento, obtenerEvento, reabrirEvento } from "@/lib/captura-datos/db";
import { guardarEventoEnDrive } from "@/lib/captura-datos/google";
import { generarExcelEvento } from "@/lib/captura-datos/excel";
import { subirExcelEvento } from "@/lib/storage";
import { leerJson, respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { patchEvento, solicitudBorrado } from "@/lib/captura-datos/validacion";
import { borrarEventoDirecto, solicitarBorrado } from "@/lib/captura-datos/borrado";

export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const evento = await obtenerEvento(id);
    if (!evento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    return NextResponse.json({ evento });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id] GET");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const b = await leerJson(req, patchEvento);
    if (b.accion === "reabrir") {
      if (permiso.usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede reabrir un evento confirmado.");
      if (!b.motivo?.trim()) throw new ErrorPeticion(400, "Indica el motivo de la reapertura.");
      const evento = await reabrirEvento(id, permiso.usuario.id, b.motivo.trim());
      return NextResponse.json({ evento });
    }

    // Guardar en Drive y cerrar solo lo hacen admins (aunque el evento ya esté cerrado).
    if (permiso.usuario.rol !== "admin") throw new ErrorPeticion(403, "Solo un admin puede guardar en Drive o cerrar el evento.");
    // "confirmar": sube a Drive las fotos pendientes + crea/actualiza la Hoja de cálculo (evento sigue abierto).
    // "cerrar": lo mismo y además cierra el evento.
    const resultado = await guardarEventoEnDrive(id, permiso.usuario.id, { crearCarpeta: b.crearCarpeta, sinFotos: b.sinFotos, cerrar: b.accion === "cerrar" });
    if (!resultado.ok) return NextResponse.json({ faltaCarpeta: resultado.faltaCarpeta }, { status: 409 });

    // Copia descargable actualizada (best-effort: si falla, el evento ya
    // quedó confirmado de todos modos — la Hoja de Drive es la fuente real).
    try {
      const hojas = await listarHojasDeEvento(id);
      await subirExcelEvento(id, await generarExcelEvento(hojas));
    } catch (err) {
      console.error("captura-datos: no se pudo generar el Excel descargable", err);
    }

    const evento = await obtenerEvento(id);
    return NextResponse.json({ evento, resultado });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id] PATCH");
  }
}

// Un admin borra directo (queda en el historial); el resto solo deja una solicitud que cualquier admin decide (ver borrado.ts).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await requerirEvento(permiso.usuario, id);
    const b = await leerJson(req, solicitudBorrado);
    if (permiso.usuario.rol === "admin") {
      await borrarEventoDirecto(permiso.usuario, id, b.motivo);
      return NextResponse.json({ ok: true, pendiente: false });
    }
    await solicitarBorrado(permiso.usuario, id, b.motivo);
    return NextResponse.json({ ok: true, pendiente: true }, { status: 202 });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id] DELETE");
  }
}
