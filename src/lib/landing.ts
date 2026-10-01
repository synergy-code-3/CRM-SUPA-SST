import { supabase } from "@/lib/supabase";
import { buscarClientePorCorreo, normalizarEmail } from "@/lib/db";

export type EstadoLandingRegistro = "enlazado" | "sin_coincidencia" | "revision";

export function normalizarTelefonoLanding(telefono: string): string {
  return telefono.replace(/\D/g, "").slice(-10);
}

// clientes.telefono_norm es una columna generada (ver schema.sql) a partir
// del mismo criterio (últimos 10 dígitos) — así no importa si quedó
// guardado con "+", espacios, o sin lada.
async function buscarClientesPorTelefonoNorm(telefonoNorm: string): Promise<{ id: string }[]> {
  if (telefonoNorm.length < 10) return [];
  const { data, error } = await supabase.from("clientes").select("id").eq("telefono_norm", telefonoNorm);
  if (error) throw error;
  return (data ?? []) as { id: string }[];
}

// Registra un envío del popup de la landing: lo guarda en landing_registros
// (actualiza el mismo registro si el correo+teléfono ya habían mandado
// antes) y, si encuentra una única coincidencia con un cliente existente
// (por correo o por teléfono), marca en ese cliente que ya entró a la
// landing. 0 coincidencias → sin_coincidencia (puede que aún no sea
// cliente). 2+ coincidencias DISTINTAS (ej. el correo es de alguien y el
// teléfono es de otra persona) → revisión manual, no se adivina a cuál de
// los dos pertenece.
export async function registrarEnvioLanding(input: {
  nombre: string;
  email: string;
  telefono: string;
  pagina?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ estado: EstadoLandingRegistro; clienteId: string | null }> {
  const email = normalizarEmail(input.email);
  const telefonoNorm = normalizarTelefonoLanding(input.telefono);

  const [porEmail, porTelefono] = await Promise.all([
    buscarClientePorCorreo(email),
    buscarClientesPorTelefonoNorm(telefonoNorm),
  ]);

  const idsEncontrados = new Set<string>();
  if (porEmail) idsEncontrados.add(porEmail.id);
  for (const c of porTelefono) idsEncontrados.add(c.id);

  let estado: EstadoLandingRegistro = "sin_coincidencia";
  let clienteId: string | null = null;
  if (idsEncontrados.size === 1) {
    estado = "enlazado";
    clienteId = [...idsEncontrados][0];
  } else if (idsEncontrados.size > 1) {
    estado = "revision";
  }

  const ahora = new Date().toISOString();
  const { data: previo, error: errPrevio } = await supabase
    .from("landing_registros")
    .select("envios")
    .eq("email", email)
    .eq("telefono_norm", telefonoNorm)
    .maybeSingle();
  if (errPrevio) throw errPrevio;

  const { error: errReg } = await supabase.from("landing_registros").upsert(
    {
      nombre: input.nombre,
      email,
      telefono: input.telefono,
      telefono_norm: telefonoNorm,
      cliente_id: clienteId,
      estado,
      pagina: input.pagina ?? null,
      ip: input.ip ?? null,
      user_agent: input.userAgent ?? null,
      envios: (previo?.envios ?? 0) + 1,
      actualizado_en: ahora,
    },
    { onConflict: "email,telefono_norm" }
  );
  if (errReg) throw errReg;

  if (clienteId) {
    const { data: filaCliente, error: errLectura } = await supabase
      .from("clientes")
      .select("landing_registrado_en, landing_envios")
      .eq("id", clienteId)
      .maybeSingle();
    if (errLectura) throw errLectura;
    const { error: errCli } = await supabase
      .from("clientes")
      .update({
        // Conserva la primera vez — un segundo envío no debe "resetear"
        // cuándo entró de verdad.
        landing_registrado_en: filaCliente?.landing_registrado_en ?? ahora,
        landing_ultimo_envio: ahora,
        landing_envios: (filaCliente?.landing_envios ?? 0) + 1,
        actualizado_en: ahora,
      })
      .eq("id", clienteId);
    if (errCli) throw errCli;
  }

  return { estado, clienteId };
}

