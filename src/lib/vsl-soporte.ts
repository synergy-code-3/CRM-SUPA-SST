// Integración de solo lectura con el CRM de otra área ("VSL / Soporte") —
// consulta en vivo, nunca se guarda copia en este CRM. Su API no filtra por
// correo del lado de ellos: siempre trae la lista completa (tope interno de
// 500 de su lado) y este archivo filtra aquí por el correo del cliente.

export type ConvertidoVsl = {
  leadId: string;
  nombre: string;
  email: string;
  telefono: string | null;
  producto: string;
  vendedor: string | null;
  fechaVenta: string | null; // ISO 8601
  monto: number | null;
  moneda: string | null;
  fuenteVenta: "stripe" | "manual" | "sin registrar";
  notas: string;
  comprobanteUrl: string | null; // URL firmada, expira ~5 min desde que ellos la generan
  accesoDado: boolean;
};

type RespuestaConvertidos = { convertidos: ConvertidoVsl[] };

const URL_CONVERTIDOS = "https://vsl.sinergeticos.com/api/soporte/convertidos";

function tokenVsl(): string {
  const token = process.env.VSL_SOPORTE_API_TOKEN;
  if (!token) throw new Error("Falta VSL_SOPORTE_API_TOKEN en las variables de entorno");
  return token;
}

export async function listarTodosConvertidosVsl(): Promise<ConvertidoVsl[]> {
  const res = await fetch(URL_CONVERTIDOS, {
    headers: { Authorization: `Bearer ${tokenVsl()}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`El CRM de VSL respondió ${res.status}`);
  const data = (await res.json()) as RespuestaConvertidos;
  return data.convertidos ?? [];
}

// Le avisa a VSL que ya se le dio acceso a este lead (Kajabi + Skool) — se
// refleja en su panel. Se llama después de aprobar la solicitud que
// originó ese lead, o directamente si se detecta que el correo ya es
// cliente aquí pero VSL todavía lo tiene marcado como pendiente.
export async function marcarAccesoDadoVsl(leadId: string): Promise<void> {
  const res = await fetch(URL_CONVERTIDOS, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${tokenVsl()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ leadId, accesoDado: true }),
  });
  if (!res.ok) throw new Error(`El CRM de VSL respondió ${res.status} al marcar acceso dado`);
}

// Más reciente primero; los sin fecha de venta van al final.
function ordenarPorFechaVentaDesc(a: ConvertidoVsl, b: ConvertidoVsl): number {
  if (!a.fechaVenta && !b.fechaVenta) return 0;
  if (!a.fechaVenta) return 1;
  if (!b.fechaVenta) return -1;
  return b.fechaVenta.localeCompare(a.fechaVenta);
}

export async function historicoVslPorCorreo(email: string): Promise<ConvertidoVsl[]> {
  const buscado = email.trim().toLowerCase();
  const todos = await listarTodosConvertidosVsl();
  return todos.filter((c) => c.email?.trim().toLowerCase() === buscado).sort(ordenarPorFechaVentaDesc);
}
