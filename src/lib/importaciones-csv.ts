import { supabase } from "@/lib/supabase";

// Mismas columnas que exportarResultados() en ImportarClientesModal.tsx —
// un snapshot de cada fila tal como se vería en el CSV descargado.
export type FilaImportacionCsv = {
  nombre: string;
  correo: string;
  telefono: string;
  crm: string;
  motivo: string;
  skool: string;
  whatsapp: string;
};

export type ImportacionCsv = {
  id: string;
  autor: string;
  filas: FilaImportacionCsv[];
  total: number;
  creados: number;
  yaExistian: number;
  errores: number;
  creadoEn: string;
};

type ImportacionCsvRow = {
  id: string;
  autor: string;
  filas: FilaImportacionCsv[];
  total: number;
  creados: number;
  ya_existian: number;
  errores: number;
  creado_en: string;
};

function filaAImportacion(row: ImportacionCsvRow): ImportacionCsv {
  return {
    id: row.id,
    autor: row.autor,
    filas: row.filas,
    total: row.total,
    creados: row.creados,
    yaExistian: row.ya_existian,
    errores: row.errores,
    creadoEn: row.creado_en,
  };
}

export async function guardarImportacionCsv(autor: string, filas: FilaImportacionCsv[]): Promise<ImportacionCsv> {
  const creados = filas.filter((f) => f.crm === "Creado").length;
  const yaExistian = filas.filter((f) => f.crm === "Ya existe en el CRM").length;
  const errores = filas.length - creados - yaExistian;
  const { data, error } = await supabase
    .from("importaciones_csv")
    .insert({ autor, filas, total: filas.length, creados, ya_existian: yaExistian, errores })
    .select("*")
    .single();
  if (error) throw error;
  return filaAImportacion(data as ImportacionCsvRow);
}

// Sin las filas completas (jsonb pesado) — para la lista de Actividad, que
// solo necesita el resumen; el detalle se pide aparte al expandir una.
export async function listarImportacionesCsv(limite = 30): Promise<Omit<ImportacionCsv, "filas">[]> {
  const { data, error } = await supabase
    .from("importaciones_csv")
    .select("id,autor,total,creados,ya_existian,errores,creado_en")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data as Omit<ImportacionCsvRow, "filas">[]).map((row) => ({
    id: row.id,
    autor: row.autor,
    total: row.total,
    creados: row.creados,
    yaExistian: row.ya_existian,
    errores: row.errores,
    creadoEn: row.creado_en,
  }));
}

export async function obtenerImportacionCsv(id: string): Promise<ImportacionCsv | null> {
  const { data, error } = await supabase.from("importaciones_csv").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? filaAImportacion(data as ImportacionCsvRow) : null;
}
