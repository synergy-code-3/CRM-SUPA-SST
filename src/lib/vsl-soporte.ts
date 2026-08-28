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

async function listarConvertidosVsl(): Promise<ConvertidoVsl[]> {
  const token = process.env.VSL_SOPORTE_API_TOKEN;
  if (!token) throw new Error("Falta VSL_SOPORTE_API_TOKEN en las variables de entorno");

  const res = await fetch(URL_CONVERTIDOS, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`El CRM de VSL respondió ${res.status}`);
  const data = (await res.json()) as RespuestaConvertidos;
  return data.convertidos ?? [];
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
  const todos = await listarConvertidosVsl();
  return todos.filter((c) => c.email?.trim().toLowerCase() === buscado).sort(ordenarPorFechaVentaDesc);
}
