import { NextResponse } from "next/server";
import { requerirPermiso } from "@/lib/auth";
import { agregarOpcionCatalogo } from "@/lib/catalogo";

// Palabra puntual que alguien quita de "Palabras clave más comunes" /
// "Preguntas más comunes" desde la propia gráfica (ver BarChart.tsx →
// onDescartar). Se guarda en catalogo_opciones (tipo palabra_descartada_cm)
// y extraerPalabrasClave() la excluye desde entonces, además de la lista
// fija de palabras vacías en community-manager.ts.
export async function POST(req: Request) {
  const permiso = await requerirPermiso("verCommunityManager");
  if (!permiso.ok) return permiso.respuesta;

  const body = await req.json();
  const valor = String(body?.valor ?? "").trim().toLowerCase();
  if (!valor) return NextResponse.json({ error: "Falta el valor" }, { status: 400 });

  try {
    await agregarOpcionCatalogo("palabra_descartada_cm", valor);
  } catch (err) {
    if (!(err instanceof Error && err.message === "Esa opción ya existe")) {
      const message = err instanceof Error ? err.message : "No se pudo descartar la palabra";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  return NextResponse.json({ ok: true });
}
