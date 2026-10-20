import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { crearHojas, actualizarOrigenHoja } from "@/lib/captura-datos/db";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { subirFotoHoja } from "@/lib/storage";
import { ESTATUS, type Estatus } from "@/lib/captura-datos/fields";

export const maxDuration = 120;

type MetaArchivo = { nombreOriginal: string; pagina?: number; paginas?: number };

// Fotos/páginas de PDF subidas desde la computadora (en vez de ya estar en
// Drive) — cada archivo ya llega convertido a JPEG desde el navegador (el
// recorte/paginado de PDF se hace ahí con pdfjs-dist, igual que el proyecto
// original). FormData porque son archivos binarios, no JSON.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await requerirPermiso("verCapturaDatos");
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;
  try {
    const form = await req.formData();
    const estatus = String(form.get("estatus") ?? "");
    if (!ESTATUS.some((e) => e.value === estatus)) throw new ErrorPeticion(400, "Estatus inválido");

    const archivos = form.getAll("archivos").filter((a): a is File => a instanceof File);
    if (archivos.length === 0) throw new ErrorPeticion(400, "No se recibió ninguna foto");
    if (archivos.length > 30) throw new ErrorPeticion(400, "Máximo 30 fotos por tanda");

    const metas = JSON.parse(String(form.get("metas") ?? "[]")) as MetaArchivo[];
    if (metas.length !== archivos.length) throw new ErrorPeticion(400, "Faltan metadatos de alguna foto");

    const hojas = await crearHojas(
      id,
      estatus as Estatus,
      metas.map((m) => ({ origen: { nombreOriginal: m.nombreOriginal, pagina: m.pagina, paginas: m.paginas } }))
    );

    for (let i = 0; i < hojas.length; i++) {
      const buffer = Buffer.from(await archivos[i].arrayBuffer());
      const ruta = await subirFotoHoja(hojas[i].id, buffer);
      hojas[i].origen = { ...hojas[i].origen, rutaStorage: ruta };
      await actualizarOrigenHoja(hojas[i].id, hojas[i].origen);
    }

    return NextResponse.json({ hojas });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/hojas/subir POST");
  }
}
