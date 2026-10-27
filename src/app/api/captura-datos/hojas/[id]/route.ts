import { after, NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { cerrarEventoSiCompleto } from "@/lib/captura-datos/cierre";
import { actualizarCamposHoja, confirmarHoja, ErrorEstadoHoja, ErrorFolioDuplicado, ErrorHojaOcupada, ErrorVersion } from "@/lib/captura-datos/db";
import { adelantarLecturas } from "@/lib/captura-datos/lectura-ia";
import { leerJson, respuestaError } from "@/lib/captura-datos/api";
import { patchHoja } from "@/lib/captura-datos/validacion";

export const maxDuration = 120; // el adelanto de lecturas (after) corre dentro de este plazo

/** Quien confirma queda trabajando la siguiente hoja: esa y las dos que le siguen deben estar ya leídas. */
const HOJAS_POR_ADELANTADO_AL_CONFIRMAR = 3;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);
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
    await requerirHoja(permiso.usuario, id);
    const b = await leerJson(req, patchHoja);

    if (b.confirmar) {
      if (!b.campos) return NextResponse.json({ error: "Faltan los datos de la hoja" }, { status: 400 });
      const forzar = new URL(req.url).searchParams.get("force") === "1";
      try {
        const hoja = await confirmarHoja(id, permiso.usuario.id, b.campos, b.voucherBox ?? null, { forzarDuplicado: forzar, versionEsperada: b.version });
        const eventoCerrado = await cerrarEventoSiCompleto(hoja.eventoId, permiso.usuario.id);
        // Solo si se está trabajando con IA (la hoja se leyó con IA): se mantiene el adelanto sin gastar lecturas a quien no la usa.
        if (!eventoCerrado && hoja.origen.leidaIa) after(() => adelantarLecturas(hoja.eventoId, HOJAS_POR_ADELANTADO_AL_CONFIRMAR));
        return NextResponse.json({ hoja, eventoCerrado });
      } catch (err) {
        if (err instanceof ErrorFolioDuplicado) {
          return NextResponse.json({ error: err.message, duplicado: err.duplicado }, { status: 409 });
        }
        throw err;
      }
    }

    const hoja = await actualizarCamposHoja(id, { campos: b.campos, voucherBox: b.voucherBox }, b.version, permiso.usuario.id);
    return NextResponse.json({ hoja });
  } catch (err) {
    if (err instanceof ErrorVersion || err instanceof ErrorHojaOcupada || err instanceof ErrorEstadoHoja) return NextResponse.json({ error: err.message }, { status: 409 });
    return respuestaError(err, "captura-datos/hojas/[id] PATCH");
  }
}
