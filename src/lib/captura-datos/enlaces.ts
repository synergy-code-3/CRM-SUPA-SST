// Enlaces a los recursos que la app menciona (carpetas, archivos y Hojas de Drive, copia del Excel).

export const URL_PAPELERA_DRIVE = "https://drive.google.com/drive/trash";
export const urlCarpeta = (id: string) => `https://drive.google.com/drive/folders/${id}`;
export const urlArchivo = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const urlHoja = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

/** Abre la Hoja de Drive en esa fila (si se conoce la pestaña; si no, solo la Hoja). */
export function urlFila(hojaUrl: string, fila: number, gid?: number | null) {
  const base = hojaUrl.split("#")[0];
  return gid == null ? base : `${base}#gid=${gid}&range=A${fila}`;
}

/** Descarga la última copia del Excel generado para ese evento. */
export const urlExcelEvento = (eventoId: string) => `/api/captura-datos/eventos/${encodeURIComponent(eventoId)}/excel`;

/** Dónde ver un folio ya registrado: la fila en Drive o, si no se subió, la copia del Excel. */
export interface Duplicado {
  eventoId: string;
  fila: number;
  id: string; // hoja con ese folio
  hojaUrl?: string | null;
  gid?: number | null;
  excel?: boolean;
}
export function urlDuplicado(d: Duplicado): { url: string; texto: string } | null {
  if (d.hojaUrl) return { url: urlFila(d.hojaUrl, d.fila, d.gid), texto: "Ver en Drive" };
  if (d.excel) return { url: urlExcelEvento(d.eventoId), texto: "Descargar ese Excel" };
  return null;
}
