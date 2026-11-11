import { supabase } from "@/lib/supabase";
import type { HojaCaptura } from "./modelo";

const libre = () => `bloqueada_por.is.null,bloqueada_hasta.lt.${new Date().toISOString()}`;

/** Marca la hoja como secundaria de `principalId`: deja de capturarse y de contar en la Hoja de cálculo. */
export async function hacerSecundaria(h: HojaCaptura, principalId: string, usuarioId: string): Promise<void> {
  const { error } = await supabase
    .from("cap_hojas")
    .update({ estado: "no_valida", origen: { ...h.origen, principalId }, bloqueada_por: null, bloqueada_hasta: null, version: h.version + 1 })
    .eq("id", h.id)
    .or(`${libre()},bloqueada_por.eq.${usuarioId}`);
  if (error) throw error;
}

/** La hoja vuelve a capturarse normal (sin confirmar). */
export async function quitarSecundaria(h: HojaCaptura): Promise<void> {
  const origen = { ...h.origen, principalId: undefined };
  const { error } = await supabase
    .from("cap_hojas")
    .update({ estado: h.campos ? "leida" : "pendiente", origen, version: h.version + 1 })
    .eq("id", h.id);
  if (error) throw error;
}
