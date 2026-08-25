import { randomUUID } from "crypto";
import { supabase } from "@/lib/supabase";

// Bucket privado (no público): los comprobantes de pago solo se ven vía URL
// firmada de corta duración, nunca por link directo.
export const BUCKET_COMPROBANTES = "comprobantes-pago";

const TAMANO_MAXIMO_BYTES = 8 * 1024 * 1024;
const TIPOS_PERMITIDOS = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];

export async function subirComprobante(solicitudId: string, archivo: File): Promise<string> {
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    throw new Error(`"${archivo.name}" pesa más de 8 MB`);
  }
  if (archivo.type && !TIPOS_PERMITIDOS.includes(archivo.type)) {
    throw new Error(`"${archivo.name}" no es una imagen o PDF válido`);
  }

  const extension = archivo.name.includes(".") ? archivo.name.split(".").pop() : "bin";
  const ruta = `${solicitudId}/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET_COMPROBANTES)
    .upload(ruta, buffer, { contentType: archivo.type || "application/octet-stream" });
  if (error) throw error;

  return ruta;
}

// 10 minutos: alcanza de sobra para que el admin vea el comprobante al
// revisar, sin dejar el link firmado activo por más tiempo del necesario.
export async function urlFirmadaComprobante(ruta: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrl(ruta, 600);
  if (error) throw error;
  return data.signedUrl;
}

// Bucket público (a diferencia de comprobantes-pago): una foto de perfil no
// es un documento sensible, así que se guarda la URL pública directo en
// usuarios.foto_url — sin firmar/renovar nada cada vez que se muestra.
export const BUCKET_AVATARES = "avatares";

const TAMANO_MAXIMO_AVATAR_BYTES = 4 * 1024 * 1024;
const TIPOS_IMAGEN_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"];

let bucketAvataresListo = false;

// Se crea solo (perezoso, la primera vez que alguien sube una foto) en vez
// de requerir un paso manual en el dashboard de Supabase, a diferencia de
// comprobantes-pago.
async function asegurarBucketAvatares(): Promise<void> {
  if (bucketAvataresListo) return;
  const { error } = await supabase.storage.createBucket(BUCKET_AVATARES, { public: true });
  if (error && !/already exists/i.test(error.message ?? "")) throw error;
  bucketAvataresListo = true;
}

export async function subirAvatar(usuarioId: string, archivo: File): Promise<string> {
  if (archivo.size > TAMANO_MAXIMO_AVATAR_BYTES) {
    throw new Error("La imagen pesa más de 4 MB");
  }
  if (archivo.type && !TIPOS_IMAGEN_PERMITIDOS.includes(archivo.type)) {
    throw new Error("Debe ser una imagen JPG, PNG o WEBP");
  }

  await asegurarBucketAvatares();

  const extension = archivo.type === "image/png" ? "png" : archivo.type === "image/webp" ? "webp" : "jpg";
  // Nombre fijo (no random) por usuario: subir una foto nueva reemplaza la
  // anterior en vez de acumular archivos huérfanos en el bucket.
  const ruta = `${usuarioId}/foto.${extension}`;
  const buffer = Buffer.from(await archivo.arrayBuffer());

  const { error } = await supabase.storage
    .from(BUCKET_AVATARES)
    .upload(ruta, buffer, { contentType: archivo.type || "image/jpeg", upsert: true });
  if (error) throw error;

  // Cache-bust: la ruta es siempre la misma (upsert), así que sin esto el
  // navegador seguiría mostrando la foto vieja desde caché tras reemplazarla.
  const { data } = supabase.storage.from(BUCKET_AVATARES).getPublicUrl(ruta);
  return `${data.publicUrl}?v=${Date.now()}`;
}
