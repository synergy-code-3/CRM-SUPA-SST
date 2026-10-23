// Autenticación de otro backend llamando al nuestro (no un usuario con
// sesión, no un webhook de un proveedor con formato fijo) — mismo criterio
// que SU26_QUOTA_API_TOKEN (Authorization: Bearer) pero con comparación en
// tiempo constante (como LANDING_PUBLIC_TOKEN), para no filtrar el token
// por temporización.
import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

function tokenValido(recibido: string | null, esperado: string | undefined): boolean {
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** null = autorizado; si no, la respuesta 401 ya armada para devolver tal cual. */
export function requerirTokenExterno(req: NextRequest, variableEntorno: string): NextResponse | null {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!tokenValido(token, process.env[variableEntorno])) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return null;
}
