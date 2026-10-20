import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { listarHojasDeEvento, obtenerEvento } from "@/lib/captura-datos/db";
import { generarExcelEvento } from "@/lib/captura-datos/excel";
import { leerExcelEvento, subirExcelEvento } from "@/lib/storage";
import { respuestaError } from "@/lib/captura-datos/api";

export const maxDuration = 60;

// Descarga el Excel del evento: si ya se generó uno (al confirmar), sirve
// esa copia; si no existe todavía, lo genera al vuelo con lo que ya esté
// confirmado (útil para revisar antes de confirmar el evento completo).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const evento = await obtenerEvento(id);
    if (!evento) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    let buffer = await leerExcelEvento(id);
    if (!buffer) {
      const hojas = await listarHojasDeEvento(id);
      buffer = await generarExcelEvento(hojas);
      await subirExcelEvento(id, buffer);
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${evento.nombre.replace(/[^\w.-]+/g, "_")}.xlsx"`,
      },
    });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/excel GET");
  }
}
