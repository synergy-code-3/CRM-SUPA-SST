import { NextRequest, NextResponse } from "next/server";
import { normalizarEmail, obtenerCliente } from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { filaACliente, type ClienteRow } from "@/lib/supabase-map";
import type { Cliente } from "@/lib/types";

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
//
// Acepta `email` (id, único) o `telefono` — los últimos 10 dígitos, sin
// código de país (así lo manda axis) — no es único en este CRM, ver el caso
// 409 "ambiguo" más abajo. Si mandan ambos, gana email.
function ultimos10Digitos(v: string): string {
  return v.replace(/\D/g, "").slice(-10);
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  if (!token || token !== process.env.SU26_QUOTA_API_TOKEN) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const email = req.nextUrl.searchParams.get("email");
  const telefono = req.nextUrl.searchParams.get("telefono");
  if (!email && !telefono) {
    return NextResponse.json({ error: "Falta el parámetro email o telefono" }, { status: 400 });
  }

  let cliente: Cliente | null;
  if (email) {
    cliente = await obtenerCliente(normalizarEmail(email));
  } else {
    const sufijo = ultimos10Digitos(telefono as string);
    if (sufijo.length !== 10) {
      return NextResponse.json({ error: "telefono debe tener 10 dígitos" }, { status: 400 });
    }
    // A diferencia de email (id, único por definición), el teléfono no es
    // una llave única en este CRM — raro pero posible que 2 clientes lo
    // compartan. En vez de adivinar cuál es el correcto (le diría a alguien
    // los boletos de otra persona), se responde "ambiguo" explícito. Se
    // guarda con código de país (+52...), por eso el match es por sufijo.
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .like("telefono", `%${sufijo}`);
    if (error) throw error;
    if ((data?.length ?? 0) > 1) {
      return NextResponse.json(
        { encontrado: false, ambiguo: true, error: "Más de un cliente con este teléfono" },
        { status: 409 }
      );
    }
    cliente = data && data[0] ? filaACliente(data[0] as ClienteRow) : null;
  }

  if (!cliente) {
    // 404 es el caso normal (sin cliente para ese correo/teléfono en este CRM), no un error.
    return NextResponse.json({ encontrado: false }, { status: 404 });
  }

  return NextResponse.json({
    encontrado: true,
    boletos_sin_informacion: cliente.boletosSinInformacion,
    accesos_editado_manual: cliente.accesosEditadoManual,
    accesos: cliente.accesos,
  });
}
