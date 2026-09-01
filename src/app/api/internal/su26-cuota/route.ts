import { NextRequest, NextResponse } from "next/server";
import { normalizarEmail, obtenerCliente } from "@/lib/db";

// Canal de solo lectura para que synergy-axis (repo hermano) reemplace su
// propio cálculo simplificado de accesos a Synergy Unlimited 2026 por el de
// este CRM (más completo: BLACK, "MÁS+", "Revocado", overrides por correo).
// Espejo en la dirección opuesta de src/lib/axis.ts (que consume la API de
// axis) — mismo patrón de autenticación que los webhooks (token propio, no
// cookie de sesión: ver PREFIJOS_PUBLICOS_API en middleware.ts), pero por
// header Authorization: Bearer en vez de ?token=, ya que aquí quien llama es
// otro backend, no un proveedor externo con webhooks fijos.
//
// Nunca recalcula: lee tal cual el campo `accesos` que ya mantiene
// recalcularAccesos() en cada alta/renovación/edición — incluye el caso
// accesos_editado_manual=true (un admin corrigió a mano), que es justo lo
// que hace a este CRM mejor fuente que el cálculo propio de axis.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!token || token !== process.env.SU26_QUOTA_API_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "Falta el parámetro email" }, { status: 400 });
  }

  const cliente = await obtenerCliente(normalizarEmail(email));
  if (!cliente) {
    // 404 es el caso normal (correo sin cliente en este CRM), no un error.
    return NextResponse.json({ encontrado: false }, { status: 404 });
  }

  return NextResponse.json({
    encontrado: true,
    boletos_sin_informacion: cliente.boletosSinInformacion,
    accesos_editado_manual: cliente.accesosEditadoManual,
    accesos: cliente.accesos,
  });
}
