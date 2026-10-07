import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearAvisoAutomatico } from "@/lib/avisos";
import {
  obtenerMentoria,
  actualizarInfoMentoria,
  actualizarDifusionMentoria,
  actualizarRetroMentoria,
  eliminarMentoria,
  construirCopyPrevia,
  construirCopyPlataforma,
  TIPOS_MENTORIA,
  type TipoMentoria,
} from "@/lib/coordinacion";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const mentoria = await obtenerMentoria(id);
    if (!mentoria) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ mentoria });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar la mentoría";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Las 3 pestañas (Info/Difusión/Retro) editan el mismo registro — un solo
// PATCH discriminado por `seccion`, igual que la app vieja tenía un solo
// formulario con 3 pestañas para el mismo documento.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  const body = await req.json();

  try {
    if (body?.seccion === "info") {
      const tipoMentoria = body?.tipoMentoria as TipoMentoria;
      const fecha = String(body?.fecha ?? "");
      if (!fecha) return NextResponse.json({ error: "Falta la fecha" }, { status: 400 });
      await actualizarInfoMentoria(id, {
        mentorId: body?.mentorId || null,
        tipoMentoria,
        tema: String(body?.tema ?? ""),
        fecha,
        hora: String(body?.hora ?? ""),
        material: !!body?.material,
        notas: String(body?.notas ?? ""),
      });
      return NextResponse.json({ ok: true });
    }

    if (body?.seccion === "difusion") {
      const checklist = {
        canva: !!body?.checklist?.canva,
        telegram: !!body?.checklist?.telegram,
        whatsapp: !!body?.checklist?.whatsapp,
        marketing: !!body?.checklist?.marketing,
        skool: !!body?.checklist?.skool,
      };
      await actualizarDifusionMentoria(id, {
        copyPrevia: String(body?.copyPrevia ?? ""),
        copyPlataforma: String(body?.copyPlataforma ?? ""),
        checklist,
      });
      if (Object.values(checklist).every(Boolean)) {
        const mentoria = await obtenerMentoria(id);
        await crearAvisoAutomatico(
          "Difusión completada",
          `Se completó la difusión de "${mentoria?.tema ?? "una mentoría"}"${mentoria?.mentorNombre ? ` con ${mentoria.mentorNombre}` : ""}.`,
          true,
          "Coordinación"
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (body?.seccion === "retro") {
      const resultado = await actualizarRetroMentoria(id, {
        audInicial: body?.audInicial != null ? Number(body.audInicial) : null,
        audMedia: body?.audMedia != null ? Number(body.audMedia) : null,
        audFinal: body?.audFinal != null ? Number(body.audFinal) : null,
        obsPub: String(body?.obsPub ?? ""),
        ideas: String(body?.ideas ?? ""),
        preguntas: String(body?.preguntas ?? ""),
      });
      return NextResponse.json(resultado);
    }

    return NextResponse.json({ error: "Falta 'seccion' (info/difusion/retro)" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo guardar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    await eliminarMentoria(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo eliminar";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// Endpoint auxiliar: regenera el copy previa/plataforma a partir de los
// datos actuales (botón "Generar" del formulario de Difusión) — separado
// del PATCH de difusión porque esto no guarda nada, solo calcula texto.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCoordinacion");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const mentoria = await obtenerMentoria(id);
    if (!mentoria) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    const tipoLabel = TIPOS_MENTORIA[mentoria.tipoMentoria]?.label ?? mentoria.tipoMentoria;
    return NextResponse.json({
      copyPrevia: construirCopyPrevia(mentoria.tipoMentoria, mentoria.tema ?? "", mentoria.mentorNombre ?? "", mentoria.fecha),
      copyPlataforma: construirCopyPlataforma(mentoria.tipoMentoria, mentoria.tema ?? "", mentoria.mentorNombre ?? ""),
      tipoLabel,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo generar el copy";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
