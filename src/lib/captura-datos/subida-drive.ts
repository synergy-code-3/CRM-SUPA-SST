import { z } from "zod";
import { ErrorPeticion } from "./api";
import { ESTATUS, type Estatus } from "./fields";
import { carpetaDeFotos, subirArchivoADrive } from "./google";
import type { FotoRef } from "./modelo";

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_TANDA_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVOS = 30;
const CONCURRENCIA_DRIVE = 3;
const metasEsquema = z
  .array(z.object({ nombreOriginal: z.string().max(500), pagina: z.number().int().min(1).optional(), paginas: z.number().int().min(1).optional() }))
  .max(MAX_ARCHIVOS);
const esJpeg = (b: Buffer) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const esPdf = (b: Buffer) => b.subarray(0, 5).toString("latin1") === "%PDF-";
const nombreEnDrive = (original: string, tipo: "jpeg" | "pdf") => `${original.replace(/\.\w+$/, "")}.${tipo === "pdf" ? "pdf" : "jpg"}`;

export interface Tanda {
  estatus: Estatus;
  metas: z.infer<typeof metasEsquema>;
  buffers: { buffer: Buffer; tipo: "jpeg" | "pdf" }[];
  form: FormData;
}

/** Lee y valida una tanda de FormData (estatus, metas, archivos) sin subir nada. */
export async function leerTanda(req: Request): Promise<Tanda> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_TANDA_BYTES) throw new ErrorPeticion(413, "La tanda pesa más de 100 MB: sube menos archivos a la vez.");
  const form = await req.formData();
  const estatus = String(form.get("estatus") ?? "");
  if (!ESTATUS.some((e) => e.value === estatus)) throw new ErrorPeticion(400, "Estatus inválido");

  const archivos = form.getAll("archivos").filter((a): a is File => a instanceof File);
  if (archivos.length === 0) throw new ErrorPeticion(400, "No se recibió ninguna foto");
  if (archivos.length > MAX_ARCHIVOS) throw new ErrorPeticion(400, "Máximo 30 fotos por tanda");

  let metasCrudas: unknown;
  try {
    metasCrudas = JSON.parse(String(form.get("metas") ?? "[]"));
  } catch {
    throw new ErrorPeticion(400, "Metadatos inválidos");
  }
  const metas = metasEsquema.safeParse(metasCrudas);
  if (!metas.success || metas.data.length !== archivos.length) throw new ErrorPeticion(400, "Faltan metadatos de alguna foto");

  const buffers: Tanda["buffers"] = [];
  for (const a of archivos) {
    if (a.size > MAX_BYTES) throw new ErrorPeticion(413, `"${a.name}" pesa más de 15 MB.`);
    const buffer = Buffer.from(await a.arrayBuffer());
    if (esJpeg(buffer)) buffers.push({ buffer, tipo: "jpeg" });
    else if (esPdf(buffer)) buffers.push({ buffer, tipo: "pdf" });
    else throw new ErrorPeticion(400, `"${a.name}" no es una imagen JPEG ni un PDF válido.`);
  }
  return { estatus: estatus as Estatus, metas: metas.data, buffers, form };
}

/** Sube la tanda a la subcarpeta del estatus dentro de la carpeta del evento y devuelve las referencias. */
export async function subirTanda(destinoId: string, { estatus, metas, buffers }: Tanda): Promise<FotoRef[]> {
  const carpetaId = await carpetaDeFotos(destinoId, estatus);
  const nombres = metas.map((m, i) => nombreEnDrive(m.nombreOriginal, buffers[i].tipo));
  const driveIds: string[] = new Array(buffers.length);
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < buffers.length) {
      const i = siguiente++;
      driveIds[i] = await subirArchivoADrive(carpetaId, nombres[i], buffers[i].buffer, buffers[i].tipo);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA_DRIVE, buffers.length) }, trabajador));
  return metas.map((m, i) => ({ nombreOriginal: m.nombreOriginal, pagina: m.pagina, paginas: m.paginas, driveId: driveIds[i], nombreDrive: nombres[i] }));
}
