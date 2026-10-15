import { NextRequest, NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { obtenerCliente, revocarAccesoCliente } from "@/lib/db";
import { KAJABI_OFFER_ID_CLUB_SINERGETICO, revocarOferta } from "@/lib/kajabi";

// Mismos 2 pasos que /api/clientes/[id]/revocar-acceso, repetidos por cada
// id — no borra a nadie, solo revoca (acceso_plataforma = "Revocado" +
// intento de quitar la oferta en Kajabi). Si Kajabi falla para alguno, no
// se aborta el lote completo: ese cliente igual queda revocado en Supabase
// y se reporta el aviso por separado, mismo criterio que la revocación
// individual.
export async function POST(req: NextRequest) {
  const permiso = await requerirPermiso("revocarAccesoCliente");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json().catch(() => null);
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "Falta la lista de ids" }, { status: 400 });
  }

  const resultados: { id: string; ok: boolean; avisoKajabi: string | null; error?: string }[] = [];
  for (const id of ids) {
    try {
      const cliente = await obtenerCliente(id);
      if (!cliente) {
        resultados.push({ id, ok: false, avisoKajabi: null, error: "No encontrado" });
        continue;
      }
      let avisoKajabi: string | null = null;
      try {
        await revocarOferta(cliente.email, KAJABI_OFFER_ID_CLUB_SINERGETICO);
      } catch (err) {
        avisoKajabi = err instanceof Error ? err.message : "No se pudo revocar el acceso en Kajabi";
      }
      await revocarAccesoCliente(id, permiso.usuario.nombre);
      resultados.push({ id, ok: true, avisoKajabi });
    } catch (err) {
      resultados.push({ id, ok: false, avisoKajabi: null, error: err instanceof Error ? err.message : "Error desconocido" });
    }
  }

  return NextResponse.json({ resultados });
}
