import { after, NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { registrarAuditoria, registrarConfirmacionDeHoja } from "@/lib/captura-datos/auditoria";
import { cerrarEventoSiCompleto } from "@/lib/captura-datos/cierre";
import { actualizarCamposHoja, confirmarHoja, eliminarHoja, obtenerEvento, ErrorEstadoHoja, ErrorFolioDuplicado, ErrorHojaOcupada, ErrorVersion, registrarCapturista } from "@/lib/captura-datos/db";
import { adelantarLecturas } from "@/lib/captura-datos/lectura-ia";
import { bloqueoVigente } from "@/lib/captura-datos/colaboracion";
import { ErrorPeticion } from "@/lib/captura-datos/errores";
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
    const previa = await requerirHoja(permiso.usuario, id);
    const inverso = await registrarCapturista(previa.eventoId, permiso.usuario.id);
    const b = await leerJson(req, patchHoja);

    if (b.confirmar) {
      if (!b.campos) return NextResponse.json({ error: "Faltan los datos de la hoja" }, { status: 400 });
      const forzar = new URL(req.url).searchParams.get("force") === "1";
      try {
        const hoja = await confirmarHoja(id, permiso.usuario.id, b.campos, b.voucherBox ?? null, { forzarDuplicado: forzar, versionEsperada: b.version });
        await registrarConfirmacionDeHoja({ usuario: permiso.usuario, previa, hoja, duplicadoForzado: forzar });
        const eventoCerrado = await cerrarEventoSiCompleto(hoja.eventoId, permiso.usuario);
        // Solo si se está trabajando con IA (la hoja se leyó con IA): se mantiene el adelanto sin gastar lecturas a quien no la usa.
        if (!eventoCerrado && hoja.origen.leidaIa) after(() => adelantarLecturas(hoja.eventoId, HOJAS_POR_ADELANTADO_AL_CONFIRMAR, inverso));
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

// Borra la hoja. Solo admin, con el evento abierto y sin que otra persona la esté editando. Queda en el historial.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;
  if (permiso.usuario.rol !== "admin") return NextResponse.json({ error: "No tienes permiso para esto" }, { status: 403 });

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);
    const evento = await obtenerEvento(hoja.eventoId);
    if (evento?.estado !== "abierto") throw new ErrorPeticion(409, "El evento ya está confirmado: reábrelo para borrar hojas.");
    if (bloqueoVigente(hoja) && hoja.bloqueadaPorId !== permiso.usuario.id) throw new ErrorPeticion(409, "Otra persona está editando esta hoja.");
    await eliminarHoja(id);
    await registrarAuditoria({
      usuario: permiso.usuario,
      accion: "hoja_borrada",
      eventoId: hoja.eventoId,
      eventoNombre: evento.nombre,
      hojaId: id,
      detalle: { folio: hoja.campos?.folio ?? hoja.folio ?? "", foto: hoja.origen.nombreOriginal, estado: hoja.estado },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id] DELETE");
  }
}
