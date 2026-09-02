import { NextRequest, NextResponse } from "next/server";
import { marcarMensajeBienvenidaWa, normalizarEmail, obtenerCliente } from "@/lib/db";

// Confirmación real de entrega del WhatsApp de bienvenida. Hasta ahora
// "Enviado" se ponía optimista en cuanto el CRM lograba agregarle el tag al
// contacto en GHL — eso solo confirma que el Workflow arrancó, no que el
// mensaje de verdad salió. Este webhook lo cierra: se agrega un paso
// "Webhook" al final de cada rama del Workflow "Mensaje de Bienvenida" en
// GHL para que avise el resultado real.
//
// Configuración en GHL (un paso Webhook por rama, método POST):
//   Rama de éxito -> <BASE_URL>/api/webhooks/ghl-bienvenida-wa?token=...&estado=enviado
//   Rama de falla -> <BASE_URL>/api/webhooks/ghl-bienvenida-wa?token=...&estado=fallido
//   Body (JSON):    { "email": "{{contact.email}}" }
export async function POST(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token || token !== process.env.GHL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const estadoParam = req.nextUrl.searchParams.get("estado");
  if (estadoParam !== "enviado" && estadoParam !== "fallido") {
    return NextResponse.json({ error: "Falta ?estado=enviado o ?estado=fallido en la URL" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const emailCrudo = typeof body?.email === "string" ? body.email.trim() : "";
  if (!emailCrudo) {
    return NextResponse.json({ error: "Falta email en el body" }, { status: 400 });
  }

  const id = normalizarEmail(emailCrudo);
  const cliente = await obtenerCliente(id);
  if (!cliente) {
    // 200 para que GHL no reintente un webhook que nunca va a encontrar a
    // nadie (p. ej. contacto de prueba que no existe en el CRM).
    return NextResponse.json({ ok: true, ignorado: "cliente no encontrado" });
  }

  // "Número Inválido" es una corrección manual del equipo — una confirmación
  // tardía de un intento anterior no debe pisarla.
  if (cliente.contactoWhats === "Número Inválido") {
    return NextResponse.json({ ok: true, ignorado: "marcado manualmente como Número Inválido" });
  }

  const estado = estadoParam === "enviado" ? "Enviado" : "No se pudo entregar";
  await marcarMensajeBienvenidaWa(
    id,
    estado,
    "GHL",
    estado === "Enviado"
      ? "GHL confirmó: WhatsApp de bienvenida entregado"
      : "GHL confirmó: el WhatsApp de bienvenida no se pudo entregar"
  );

  return NextResponse.json({ ok: true });
}
