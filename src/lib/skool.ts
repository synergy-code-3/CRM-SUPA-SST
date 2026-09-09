// Invitación automática a la comunidad de Skool al dar de alta un cliente.
// Skool expone un webhook de invitación por grupo: un POST con el correo
// como query param (?email=...) y le llega al cliente un link de
// invitación directo, sin pasar por la cola de aprobación. Verificado a
// mano contra el endpoint real (GET da 405; POST da 200).
export async function invitarASkool(email: string): Promise<void> {
  await invitarASkoolConWebhook(email, process.env.SKOOL_WEBHOOK_URL, "SKOOL_WEBHOOK_URL");
}

// Comunidad de Skool aparte para Certificaciones (Legendar-IA) — mismo
// mecanismo, webhook distinto.
export async function invitarASkoolCertificaciones(email: string): Promise<void> {
  await invitarASkoolConWebhook(
    email,
    process.env.SKOOL_WEBHOOK_URL_CERTIFICACIONES,
    "SKOOL_WEBHOOK_URL_CERTIFICACIONES"
  );
}

async function invitarASkoolConWebhook(email: string, webhookUrl: string | undefined, nombreVar: string): Promise<void> {
  if (!webhookUrl) throw new Error(`Falta ${nombreVar} en las variables de entorno`);

  const url = new URL(webhookUrl);
  url.searchParams.set("email", email);

  const res = await fetch(url.toString(), { method: "POST" });
  if (!res.ok) throw new Error(`Skool respondió ${res.status}: ${await res.text()}`);
}
