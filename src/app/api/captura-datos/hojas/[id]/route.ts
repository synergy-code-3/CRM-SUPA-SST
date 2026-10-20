import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { actualizarCamposHoja, confirmarHoja, ErrorFolioDuplicado, ErrorVersion, obtenerHoja } from "@/lib/captura-datos/db";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { patchHoja } from "@/lib/captura-datos/validacion";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await obtenerHoja(id);
    if (!hoja) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ hoja });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id] GET");
  }
}

// Sin `confirmar`: autoguardado mientras se revisa (bloqueo optimista por
// `version`, ver actualizarCamposHoja). Con `confirmar: true`: valida y
// cierra la hoja — si el folio ya está en otro evento confirmado, responde
// 409 con el duplicado (el cliente puede reintentar agregando force=true
// en un segundo PATCH, que aquí se traduce a mandar de nuevo sin volver a
// chocar solo si el admin decide forzarlo explícitamente).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const b = await leerJson(req, patchHoja);

    if (b.confirmar) {
      if (!b.campos) return NextResponse.json({ error: "Faltan los datos de la hoja" }, { status: 400 });
      const forzar = new URL(req.url).searchParams.get("force") === "1";
      try {
        const hoja = await confirmarHoja(id, permiso.usuario.id, b.campos, b.voucherBox ?? null, { forzarDuplicado: forzar });
        return NextResponse.json({ hoja });
      } catch (err) {
        if (err instanceof ErrorFolioDuplicado) {
          return NextResponse.json({ error: err.message, duplicado: err.duplicado }, { status: 409 });
        }
        throw err;
      }
    }

    const hoja = await actualizarCamposHoja(id, { campos: b.campos, voucherBox: b.voucherBox }, b.version);
    return NextResponse.json({ hoja });
  } catch (err) {
    if (err instanceof ErrorVersion) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id] PATCH");
  }
}
