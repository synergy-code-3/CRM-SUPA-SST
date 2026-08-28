// Extracción defensiva del payload del webhook de Hotmart: no hay acceso a
// un pago real todavía para confirmar el formato exacto contra la cuenta,
// así que se prueban varias rutas conocidas de su formato v2.0.0 (y algunas
// del v1.0.0 por si acaso) en vez de asumir una sola forma fija.
export type DatosHotmart = { email: string; telefono: string | null; producto: string | null };

function primerString(...valores: unknown[]): string | null {
  for (const v of valores) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

export function extraerDatosHotmart(payload: unknown): DatosHotmart | null {
  const p = obj(payload);
  const data = Object.keys(obj(p.data)).length ? obj(p.data) : p;
  const buyer = Object.keys(obj(data.buyer)).length ? obj(data.buyer) : obj(data.subscriber);
  const product = obj(data.product);

  const email = primerString(buyer.email, data.email, p.email);
  if (!email) return null;

  const codigo = primerString(buyer.checkout_phone_code, buyer.ddi, buyer.phone_code);
  const numero = primerString(buyer.checkout_phone, buyer.phone, buyer.phone_number, data.phone);
  const telefono = numero ? (codigo && !numero.startsWith(codigo) ? `${codigo}${numero}` : numero) : null;

  const producto = primerString(product.name, data.product_name);

  return { email, telefono, producto };
}

// Productos del Club Sinergético en Hotmart, mapeados al evento
// correspondiente (ya existen en el catálogo de boletos con su propia
// asignación por duración) y al tipo de membresía. Comparación flexible
// (sin mayúsculas/acentos): el nombre real trae variantes ("SINERGÉTICO" vs
// "SINERGETICO"). Cada funnel/región (MX JS, MX MDL, LATAM Centro JS, ...)
// tiene sus propios 3 productos (3/6/12 meses) mapeados a su propio evento.
const PRODUCTOS_CLUB_SINERGETICO: Record<string, { evento: string; tipoMembresia: string }> = {
  "club sinergetico general mexico": { evento: "WJS-MX", tipoMembresia: "3 Meses" },
  "club sinergetico mx js | 3 meses": { evento: "WJS-MX", tipoMembresia: "3 Meses" },
  "club sinergetico mx js | 6 meses": { evento: "WJS-MX", tipoMembresia: "6 Meses" },
  "club sinergetico mx js | 1 ano": { evento: "WJS-MX", tipoMembresia: "12 Meses" },
  "club sinergetico mx mdl | 3 meses": { evento: "WMDL-MX", tipoMembresia: "3 Meses" },
  "club sinergetico mx mdl | 6 meses": { evento: "WMDL-MX", tipoMembresia: "6 Meses" },
  "club sinergetico mx mdl | 1 ano": { evento: "WMDL-MX", tipoMembresia: "12 Meses" },
  "club sinergetico latam centro js | 3 meses": { evento: "LATAM CENTRO-JS", tipoMembresia: "3 Meses" },
  "club sinergetico latam centro js | 6 meses": { evento: "LATAM CENTRO-JS", tipoMembresia: "6 Meses" },
  "club sinergetico latam centro js | 1 ano": { evento: "LATAM CENTRO-JS", tipoMembresia: "12 Meses" },
};

const DIACRITICOS = new RegExp("[\\u0300-\\u036f]", "g");

function normalizarNombreProducto(producto: string): string {
  return producto.trim().toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
}

export function detectarProductoClubSinergetico(producto: string | null): { evento: string; tipoMembresia: string } | null {
  if (!producto) return null;
  return PRODUCTOS_CLUB_SINERGETICO[normalizarNombreProducto(producto)] ?? null;
}

const ORDEN_MEMBRESIA: Record<string, number> = { "3 Meses": 3, "6 Meses": 6, "12 Meses": 12 };

// La mayor de dos duraciones de membresía — para no degradar a alguien que
// hace upgrade (compra 3 Meses y luego 1 Año) o que ya tenía algo más grande.
export function mayorMembresia(actual: string | null, nueva: string): string {
  if (!actual) return nueva;
  return (ORDEN_MEMBRESIA[nueva] ?? 0) > (ORDEN_MEMBRESIA[actual] ?? 0) ? nueva : actual;
}
