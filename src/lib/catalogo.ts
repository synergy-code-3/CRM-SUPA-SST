import { supabase } from "./supabase";

// Catálogos administrables desde "Biblioteca": las opciones de los
// desplegables con buscador (Evento, Etiqueta, Tag) en toda la app.
export type TipoCatalogo = "evento" | "etiqueta" | "tag" | "tag_certificaciones" | "certificacion" | "motivo_cm";

export async function listarCatalogo(tipo: TipoCatalogo): Promise<string[]> {
  const { data, error } = await supabase
    .from("catalogo_opciones")
    .select("valor")
    .eq("tipo", tipo)
    .order("valor");
  if (error) throw error;
  return (data ?? []).map((d) => d.valor as string);
}

export async function agregarOpcionCatalogo(tipo: TipoCatalogo, valor: string): Promise<void> {
  const limpio = valor.trim();
  if (!limpio) throw new Error("El valor no puede estar vacío");
  const { error } = await supabase.from("catalogo_opciones").insert({ tipo, valor: limpio });
  if (error) {
    if (error.code === "23505") throw new Error("Esa opción ya existe");
    throw error;
  }
}

export async function eliminarOpcionCatalogo(tipo: TipoCatalogo, valor: string): Promise<void> {
  const { error } = await supabase.from("catalogo_opciones").delete().eq("tipo", tipo).eq("valor", valor);
  if (error) throw error;
}

// Valores de un catálogo en orden de creación (el más viejo primero) — para
// asignar a cada tag de Certificaciones un color estable (ver tag-colores.ts).
export async function listarCatalogoPorCreacion(tipo: TipoCatalogo): Promise<string[]> {
  const { data, error } = await supabase
    .from("catalogo_opciones")
    .select("valor")
    .eq("tipo", tipo)
    .order("creado_en")
    .order("valor");
  if (error) throw error;
  return (data ?? []).map((d) => d.valor as string);
}
