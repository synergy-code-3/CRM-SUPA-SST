import { NextRequest, NextResponse } from "next/server";
import { requerirHoja } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/captura-datos/auditoria";
import { eliminarHoja, listarHojasDeEvento, obtenerEvento } from "@/lib/captura-datos/db";
import { hacerSecundaria, quitarSecundaria } from "@/lib/captura-datos/db-duplicadas";
import { bloqueadaPorOtra } from "@/lib/captura-datos/colaboracion";
import { esSecundaria, grupoDuplicadas } from "@/lib/captura-datos/duplicadas";
import { ErrorPeticion, leerJson, respuestaError } from "@/lib/captura-datos/api";
import { duplicadasBody } from "@/lib/captura-datos/validacion";

// [id] es la principal (vincular), la secundaria a soltar (desvincular) o la hoja que se conserva (borrar).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const hoja = await requerirHoja(permiso.usuario, id);
    const evento = await obtenerEvento(hoja.eventoId);
    if (evento?.estado !== "abierto") throw new ErrorPeticion(409, "El evento ya está confirmado: reábrelo para cambiar sus hojas.");
    const b = await leerJson(req, duplicadasBody);
    const usuarioId = permiso.usuario.id;

    if (b.accion === "desvincular") {
      if (!esSecundaria(hoja)) throw new ErrorPeticion(409, "Esta hoja no está vinculada.");
      await quitarSecundaria(hoja);
      return NextResponse.json({ ok: true });
    }

    const hojas = await listarHojasDeEvento(hoja.eventoId);
    const grupo = grupoDuplicadas(hojas, hoja);
    const elegidas = b.ids.filter((i) => i !== id).map((i) => grupo.find((h) => h.id === i));
    if (!elegidas.length || elegidas.some((h) => !h)) throw new ErrorPeticion(409, "Solo se pueden vincular o borrar hojas repetidas (mismo teléfono).");
    const otras = elegidas as typeof grupo;
    if ([hoja, ...otras].some((h) => bloqueadaPorOtra(h, usuarioId))) throw new ErrorPeticion(409, "Otra persona está editando alguna de esas hojas.");

    if (b.accion === "vincular") {
      if (esSecundaria(hoja)) await quitarSecundaria(hoja);
      for (const h of otras) await hacerSecundaria(h, id, usuarioId);
      return NextResponse.json({ ok: true });
    }

    if (permiso.usuario.rol !== "admin" && otras.some((h) => h.estado === "confirmada")) throw new ErrorPeticion(403, "Solo un admin puede borrar una hoja confirmada.");
    for (const h of otras) {
      await eliminarHoja(h.id);
      await registrarAuditoria({
        usuario: permiso.usuario, accion: "hoja_borrada", eventoId: h.eventoId, eventoNombre: evento.nombre, hojaId: h.id,
        detalle: { folio: h.campos?.folio ?? h.folio ?? "", foto: h.origen.nombreOriginal, estado: h.estado, motivo: "Repetida" },
      });
    }
    const borradas = new Set(otras.map((h) => h.id));
    for (const h of hojas) if (h.origen.principalId && borradas.has(h.origen.principalId) && !borradas.has(h.id)) await quitarSecundaria(h);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respuestaError(err, "captura-datos/hojas/[id]/duplicadas POST");
  }
}
