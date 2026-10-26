import { NextRequest, NextResponse } from "next/server";
import { requerirEvento } from "@/lib/captura-datos/acceso";
import { requerirPermiso } from "@/lib/auth";
import { crearHojas, actualizarOrigenHoja, obtenerEvento } from "@/lib/captura-datos/db";
import { respuestaError, ErrorPeticion } from "@/lib/captura-datos/api";
import { subirFotoHoja } from "@/lib/storage";
import { z } from "zod";
import { ESTATUS, type Estatus } from "@/lib/captura-datos/fields";

export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024; // mismo tope que Storage
const MAX_TANDA_BYTES = 100 * 1024 * 1024;
const metasEsquema = z.array(z.object({ nombreOriginal: z.string().max(500), pagina: z.number().int().min(1).optional(), paginas: z.number().int().min(1).optional() })).max(30);
const esJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const esPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";

// Fotos/páginas de PDF subidas desde la computadora (en vez de ya estar en
// Drive) — cada archivo ya llega convertido a JPEG desde el navegador (el
// recorte/paginado de PDF se hace ahí con pdfjs-dist, igual que el proyecto
// original). FormData porque son archivos binarios, no JSON.
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

    // Se rechaza por Content-Length antes de cargar nada en memoria: 30 archivos de 15 MB serían 450 MB.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_TANDA_BYTES) throw new ErrorPeticion(413, "La tanda pesa más de 100 MB: sube menos archivos a la vez.");
    const form = await req.formData();
    const estatus = String(form.get("estatus") ?? "");
    if (!ESTATUS.some((e) => e.value === estatus)) throw new ErrorPeticion(400, "Estatus inválido");

    const archivos = form.getAll("archivos").filter((a): a is File => a instanceof File);
    if (archivos.length === 0) throw new ErrorPeticion(400, "No se recibió ninguna foto");
    if (archivos.length > 30) throw new ErrorPeticion(400, "Máximo 30 fotos por tanda");

    let metasCrudas: unknown;
    try {
      metasCrudas = JSON.parse(String(form.get("metas") ?? "[]"));
    } catch {
      throw new ErrorPeticion(400, "Metadatos inválidos");
    }
    const metas = metasEsquema.safeParse(metasCrudas);
    if (!metas.success || metas.data.length !== archivos.length) throw new ErrorPeticion(400, "Faltan metadatos de alguna foto");

    // Se valida todo antes de crear filas, para no dejar hojas huérfanas si algo no es una imagen válida.
    const buffers: { buffer: Buffer; tipo: "jpeg" | "pdf" }[] = [];
    for (const a of archivos) {
      if (a.size > MAX_BYTES) throw new ErrorPeticion(413, `"${a.name}" pesa más de 15 MB.`);
      const buffer = Buffer.from(await a.arrayBuffer());
      if (esJpeg(buffer)) buffers.push({ buffer, tipo: "jpeg" });
      else if (esPdf(buffer)) buffers.push({ buffer, tipo: "pdf" });
      else throw new ErrorPeticion(400, `"${a.name}" no es una imagen JPEG ni un PDF válido.`);
    }

    const hojas = await crearHojas(
      id,
      estatus as Estatus,
      metas.data.map((m) => ({ origen: { nombreOriginal: m.nombreOriginal, pagina: m.pagina, paginas: m.paginas } }))
    );

    for (let i = 0; i < hojas.length; i++) {
      const ruta = await subirFotoHoja(hojas[i].id, buffers[i].buffer, buffers[i].tipo);
      hojas[i].origen = { ...hojas[i].origen, rutaStorage: ruta };
      await actualizarOrigenHoja(hojas[i].id, hojas[i].origen);
    }

    return NextResponse.json({ hojas });
  } catch (err) {
    return respuestaError(err, "captura-datos/eventos/[id]/hojas/subir POST");
  }
}
