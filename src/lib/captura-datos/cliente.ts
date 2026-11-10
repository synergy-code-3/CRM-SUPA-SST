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
async function imagenAJpeg(archivo: File): Promise<Blob> {
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

const FOTOS_POR_TANDA = 30; // límite de la ruta /hojas/subir

/** Una foto lista para subir: imagen ya reducida a JPEG o una página de un PDF convertida a JPEG. */
export interface HojaPreparada {
  jpeg: Blob;
  nombreOriginal: string;
  pagina?: number;
  paginas?: number;
}

function canvasAJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, fallo) => canvas.toBlob((b) => (b ? ok(b) : fallo(new Error("No se pudo procesar la imagen."))), "image/jpeg", 0.85));
}

/** Cada página del PDF es una hoja de registro: se dibuja como JPEG (lado mayor 2000 px). */
async function paginasDePdf(archivo: File): Promise<HojaPreparada[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const carga = pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) });
  const pdf = await carga.promise;
  const base = archivo.name.replace(/\.pdf$/i, "");
  const hojas: HojaPreparada[] = [];
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const pagina = await pdf.getPage(n);
      const vista1 = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: LADO_MAX / Math.max(vista1.width, vista1.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await pagina.render({ canvas, viewport }).promise;
      hojas.push({ jpeg: await canvasAJpeg(canvas), nombreOriginal: `${base}_p${n}.jpg`, pagina: n, paginas: pdf.numPages });
      pagina.cleanup();
    }
  } finally {
    await carga.destroy();
  }
  return hojas;
}

/** Convierte todo antes de subir nada: si un archivo no se puede leer, falla aquí y no se crea nada. */
export async function prepararHojas(archivos: File[]): Promise<HojaPreparada[]> {
  const listas: HojaPreparada[][] = [];
  for (const a of archivos) {
    try {
      if (a.type === "application/pdf") listas.push(await paginasDePdf(a));
      else if (a.type.startsWith("image/")) listas.push([{ jpeg: await imagenAJpeg(a), nombreOriginal: a.name.replace(/\.\w+$/, ".jpg") }]);
    } catch {
      throw new ErrorApi(`No se pudo leer "${a.name}". Revisa que no esté dañado o protegido con contraseña.`, 0, {});
    }
  }
  return listas.flat();
}

/** Sube hojas ya preparadas a un evento en tandas. */
export async function subirHojas(eventoId: string, hojas: HojaPreparada[], estatus: string): Promise<void> {
  for (let i = 0; i < hojas.length; i += FOTOS_POR_TANDA) {
    const tanda = hojas.slice(i, i + FOTOS_POR_TANDA);
    const form = new FormData();
    form.set("estatus", estatus);
    form.set("metas", JSON.stringify(tanda.map(({ nombreOriginal, pagina, paginas }) => ({ nombreOriginal, pagina, paginas }))));
    for (const h of tanda) form.append("archivos", h.jpeg, h.nombreOriginal);
    await api(`/api/captura-datos/eventos/${eventoId}/hojas/subir`, { method: "POST", body: form });
  }
}
