import { createHash } from "node:crypto";

/** Huella de una imagen (para recordar las que no son hojas de registro y rechazarlas siempre). */
export const huellaImagen = (base64: string) => createHash("sha256").update(base64).digest("hex");
