import { parse } from "csv-parse/sync";
import {
  agregarTagsCertificacion,
  buscarClienteCertificacionPorCorreo,
  crearClienteCertificacion,
  obtenerClienteCertificacion,
  ultimos10Digitos,
  type ClienteCertificacion,
} from "./certificaciones";
import type {
  CambioPendienteCertificacion,
  NuevoClientePendienteCertificacion,
  RegionCertificacion,
  ResultadoSincronizacionCertificacion,
} from "./certificaciones-tipos";
import { normalizarTelefono } from "./db";
import { supabase } from "./supabase";

export type { CambioPendienteCertificacion, NuevoClientePendienteCertificacion, ResultadoSincronizacionCertificacion };

// Sincronización con la hoja de ventas de Legendar-IA — puerto de
// sincronizarHojaVentas() del CRM aparte, quitando todo lo de seguimiento
// (esta versión no tiene ese estado: los "ganadores" que ya son clientes
// aquí solo se comparan por monto/vendedor, nunca se gradúan de nada).
// Mismas 3 hojas públicas (sheetId/gid confirmados contra el CRM viejo).
const HOJAS: { region: RegionCertificacion; sheetId: string; gid: string }[] = [
  { region: "MX", sheetId: "1LaldIZLNdgjt9taTDzyIXAMDSdEYYpl5By-KLJAlPLk", gid: "1759324868" },
  { region: "US", sheetId: "15FgcB4VQADP8-DEjsT-gUhZjMp6OnbdEUG6R_OaqyNs", gid: "1759324868" },
  { region: "LATAM", sheetId: "1xZaHBqsGd4UA6hP5QIjzbrlbQJvlkWRAEuamat_tsI4", gid: "1759324868" },
];

const ESTADOS_GANADORES = new Set(["vendido", "seg. vendido", "repitch vendido", "apart/pagado", "upgrade", "1a upgrade"]);
const TAG_MIEMBRO_CS = "Miembro del CS";
const ESTADO_MIEMBRO_CS = "upgrade";

// Posiciones fijas de columna (encabezados repetidos/con saltos de línea en
// la hoja real, no sirven para ubicar por nombre) — mismas que el CRM viejo:
// A id, B fecha, C nombre, D correo, E lada, F celular, G corregido,
// J monto, M estado, N abeja seguimiento, O vendedor asignado.
const COL = { nombre: 2, correo: 3, lada: 4, celular: 5, corregido: 6, amount: 9, estado: 12, abejaSeguimiento: 13, assigned: 14 };

type FilaHoja = {
  nombre: string;
  correo: string;
  celular: string;
  corregido: string;
  lada: string;
  amount: string;
  estado: string;
  assigned: string;
  abejaSeguimiento: string;
};

function filasAObjetos(filas: string[][]): FilaHoja[] {
  if (filas.length === 0) return [];
  const leer = (fila: string[], i: number) => (fila[i] ?? "").trim();
  return filas.slice(1).map((fila) => ({
    nombre: leer(fila, COL.nombre),
    correo: leer(fila, COL.correo),
    celular: leer(fila, COL.celular),
    corregido: leer(fila, COL.corregido),
    lada: leer(fila, COL.lada),
    amount: leer(fila, COL.amount),
    estado: leer(fila, COL.estado),
    assigned: leer(fila, COL.assigned),
    abejaSeguimiento: leer(fila, COL.abejaSeguimiento),
  }));
}

function limpiarTelefono(corregido: string, celular: string, region: RegionCertificacion, lada: string): string | null {
  const deCorregido = corregido.replace(/[^0-9]/g, "");
  if (deCorregido.length === 10) return deCorregido;

  let digitos = celular.replace(/[^0-9]/g, "");
  if (region === "MX") {
    if (digitos.length === 12 && digitos.startsWith("52")) digitos = digitos.slice(2);
    else if (digitos.length === 13 && digitos.startsWith("521")) digitos = digitos.slice(3);
  } else if (region === "US") {
    if (digitos.length === 11 && digitos.startsWith("1")) digitos = digitos.slice(1);
  } else {
    const codigo = lada.replace(/[^0-9]/g, "");
    if (codigo && digitos.startsWith(codigo) && digitos.length > codigo.length) digitos = digitos.slice(codigo.length);
  }
  return digitos || null;
}

function resolverVendedor(fila: FilaHoja): string | null {
  const asignado = fila.assigned.trim();
  const esVacioOEmpresa = !asignado || asignado.toLowerCase() === "empresa";
  if (esVacioOEmpresa && fila.abejaSeguimiento) return fila.abejaSeguimiento;
  return asignado || null;
}

async function buscarClientePorTelefonoCertificacion(ultimos10: string): Promise<ClienteCertificacion | null> {
  const { data, error } = await supabase
    .from("certificaciones_clientes")
    .select("*")
    .eq("telefono_busqueda", ultimos10)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as ClienteCertificacion | null;
}

async function buscarExistente(fila: FilaHoja, telefonoLimpio: string | null): Promise<ClienteCertificacion | null> {
  const porCorreo = await buscarClienteCertificacionPorCorreo(fila.correo);
  if (porCorreo) return porCorreo;
  const ultimos10 = ultimos10Digitos(telefonoLimpio);
  return ultimos10 ? buscarClientePorTelefonoCertificacion(ultimos10) : null;
}

function detectarCambios(
  cliente: ClienteCertificacion,
  monto: string | null,
  vendedor: string | null,
  telefono: string | null
): { monto?: string; vendedor?: string; telefono?: string } | null {
  const cambios: { monto?: string; vendedor?: string; telefono?: string } = {};
  if (monto && monto !== cliente.monto) cambios.monto = monto;
  if (vendedor && vendedor !== cliente.vendedor) cambios.vendedor = vendedor;
  // Se compara por los últimos 10 dígitos: el teléfono guardado lleva "+" y el
  // de la hoja no, y eso solo es formato, no un cambio real.
  if (telefono && ultimos10Digitos(telefono) !== ultimos10Digitos(cliente.telefono)) cambios.telefono = telefono;
  return Object.keys(cambios).length > 0 ? cambios : null;
}

// Preview: no escribe nada, solo detecta qué cambiaría — el admin/
// coordinador confirma desde /certificaciones qué aplicar.
export async function previsualizarSincronizacionCertificacion(): Promise<ResultadoSincronizacionCertificacion> {
  const resultado: ResultadoSincronizacionCertificacion = {
    filasLeidas: 0,
    ganadoras: 0,
    omitidos: 0,
    errores: [],
    cambiosPendientes: [],
    nuevosPendientes: [],
  };

  for (const hoja of HOJAS) {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${hoja.sheetId}/export?format=csv&gid=${hoja.gid}`;
      const res = await fetch(url);
      if (!res.ok) {
        resultado.errores.push(`Hoja ${hoja.region}: no se pudo leer (status ${res.status})`);
        continue;
      }
      const filas = filasAObjetos(parse(await res.text(), { skip_empty_lines: true, relax_column_count: true }));
      resultado.filasLeidas += filas.length;

      for (const fila of filas) {
        const estado = fila.estado.trim().toLowerCase();
        if (!ESTADOS_GANADORES.has(estado)) continue;
        resultado.ganadoras++;
        if (!fila.correo) {
          resultado.omitidos++;
          continue;
        }

        const monto = fila.amount || null;
        const vendedor = resolverVendedor(fila);
        const telefono = limpiarTelefono(fila.corregido, fila.celular, hoja.region, fila.lada);
        const existente = await buscarExistente(fila, telefono);
        const esMiembroCS = estado === ESTADO_MIEMBRO_CS;

        if (existente) {
          const cambios = detectarCambios(existente, monto, vendedor, telefono);
          const necesitaTagCS = esMiembroCS && !existente.tags.includes(TAG_MIEMBRO_CS);
          if (cambios || necesitaTagCS) {
            const cambioPendiente: CambioPendienteCertificacion = {
              clienteId: existente.id,
              nombre: existente.nombre,
              correo: existente.email ?? fila.correo,
              monto: cambios?.monto ? { actual: existente.monto, nuevo: cambios.monto } : undefined,
              vendedor: cambios?.vendedor ? { actual: existente.vendedor, nuevo: cambios.vendedor } : undefined,
              telefono: cambios?.telefono ? { actual: existente.telefono, nuevo: cambios.telefono } : undefined,
              agregarTagMiembroCS: necesitaTagCS ? true : undefined,
            };
            const idx = resultado.cambiosPendientes.findIndex((c) => c.clienteId === existente.id);
            if (idx >= 0) resultado.cambiosPendientes[idx] = cambioPendiente;
            else resultado.cambiosPendientes.push(cambioPendiente);
          } else {
            resultado.omitidos++;
          }
        } else {
          const idx = resultado.nuevosPendientes.findIndex((n) => n.correo === fila.correo);
          if (idx >= 0) resultado.nuevosPendientes.splice(idx, 1);
          resultado.nuevosPendientes.push({
            correo: fila.correo,
            nombre: fila.nombre || fila.correo,
            telefono,
            region: hoja.region,
            vendedor,
            monto,
            tags: esMiembroCS ? [TAG_MIEMBRO_CS] : [],
          });
        }
      }
    } catch (err) {
      resultado.errores.push(`Hoja ${hoja.region}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
  }

  return resultado;
}

export type CambioAAplicarCertificacion = {
  clienteId: string;
  monto?: string;
  vendedor?: string;
  telefono?: string;
  agregarTagMiembroCS?: boolean;
};

export async function aplicarCambiosPendientesCertificacion(
  cambios: CambioAAplicarCertificacion[],
  autor: string
): Promise<{ aplicados: number; errores: string[] }> {
  let aplicados = 0;
  const errores: string[] = [];

  for (const cambio of cambios) {
    try {
      const cliente = await obtenerClienteCertificacion(cambio.clienteId);
      if (!cliente) {
        errores.push(`${cambio.clienteId}: cliente no encontrado`);
        continue;
      }
      const datos: Record<string, unknown> = {};
      if (cambio.monto) datos.monto = cambio.monto;
      if (cambio.vendedor) datos.vendedor = cambio.vendedor;
      if (cambio.telefono) {
        datos.telefono = normalizarTelefono(cambio.telefono);
        datos.telefono_busqueda = ultimos10Digitos(cambio.telefono);
      }

      let tocado = false;
      if (Object.keys(datos).length > 0) {
        const { error } = await supabase.from("certificaciones_clientes").update(datos).eq("id", cliente.id);
        if (error) throw error;
        tocado = true;
      }
      if (cambio.agregarTagMiembroCS && !cliente.tags.includes(TAG_MIEMBRO_CS)) {
        await agregarTagsCertificacion(cliente.id, [TAG_MIEMBRO_CS], autor);
        tocado = true;
      }
      if (tocado) aplicados++;
    } catch (err) {
      errores.push(`${cambio.clienteId}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
  }

  return { aplicados, errores };
}

export async function aplicarNuevosPendientesCertificacion(
  nuevos: NuevoClientePendienteCertificacion[],
  autor: string,
  autorRol: string
): Promise<{ creados: number; errores: string[] }> {
  let creados = 0;
  const errores: string[] = [];

  for (const nuevo of nuevos) {
    try {
      await crearClienteCertificacion(
        {
          nombre: nuevo.nombre,
          email: nuevo.correo,
          telefono: nuevo.telefono,
          region: nuevo.region,
          vendedor: nuevo.vendedor,
          monto: nuevo.monto,
          tags: nuevo.tags,
        },
        autor,
        autorRol
      );
      creados++;
    } catch (err) {
      errores.push(`${nuevo.correo}: ${err instanceof Error ? err.message : "error desconocido"}`);
    }
  }

  return { creados, errores };
}
