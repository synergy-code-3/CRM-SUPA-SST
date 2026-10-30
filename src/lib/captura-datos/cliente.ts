// Utilidades del navegador para Captura de Datos: llamadas a la API y conversión de imágenes.

export class ErrorApi extends Error {
  constructor(message: string, public status: number, public datos: Record<string, unknown>) {
    super(message);
  }
}

/** fetch + JSON: lanza ErrorApi con el mensaje del servidor si la respuesta no es 2xx. */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...resto } = init ?? {};
  const r = await fetch(url, {
    ...resto,
    ...(json !== undefined ? { method: resto.method ?? "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) } : {}),
  });
  const datos = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new ErrorApi(typeof datos.error === "string" ? datos.error : "Algo salió mal. Intenta de nuevo.", r.status, datos);
  return datos as T;
}

const LADO_MAX = 2000;

/** Reduce una imagen a JPEG (lado mayor 2000 px) para subirla ligera y legible. */
export async function imagenAJpeg(archivo: File): Promise<Blob> {
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * escala);
  canvas.height = Math.round(bmp.height * escala);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((ok, fallo) =>
    canvas.toBlob((b) => (b ? ok(b) : fallo(new Error("No se pudo procesar la imagen."))), "image/jpeg", 0.85)
  );
}

/** "2026-11-15" → "15/11/2026" sin pasar por Date (evita el desfase de zona horaria). */
export function formatearFecha(fecha: string): string {
  const [a, m, d] = fecha.split("-");
  return `${d}/${m}/${a}`;
}

export const FOTOS_POR_TANDA = 30; // límite de la ruta /hojas/subir

/** Sube archivos de la computadora a un evento en tandas (imágenes reducidas a JPEG, PDF tal cual). `alSubirTanda` avisa qué archivos ya quedaron. */
export async function subirHojas(eventoId: string, archivos: File[], estatus: string, alSubirTanda?: (tanda: File[]) => void): Promise<void> {
  const lista = archivos.filter((a) => a.type.startsWith("image/") || a.type === "application/pdf");
  for (let i = 0; i < lista.length; i += FOTOS_POR_TANDA) {
    const tanda = lista.slice(i, i + FOTOS_POR_TANDA);
    const form = new FormData();
    form.set("estatus", estatus);
    form.set("metas", JSON.stringify(tanda.map((a) => ({ nombreOriginal: a.name }))));
    for (const a of tanda) {
      if (a.type === "application/pdf") form.append("archivos", a, a.name);
      else form.append("archivos", await imagenAJpeg(a), a.name.replace(/\.\w+$/, ".jpg"));
    }
    await api(`/api/captura-datos/eventos/${eventoId}/hojas/subir`, { method: "POST", body: form });
    alSubirTanda?.(tanda);
  }
}
