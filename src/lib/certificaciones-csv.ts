import { REGIONES_CERTIFICACION } from "./certificaciones-tipos";

// Parser del CSV de importación de Certificaciones (portado de csvParse.ts del
// CRM original). Puro, sin imports de servidor.

/** Parser de CSV simple: soporta comillas, comas dentro de campos y saltos de línea \r\n o \n. */
export function parsearCSV(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = "";
  let dentroDeComillas = false;

  const limpio = texto.replace(/^﻿/, "");

  for (let i = 0; i < limpio.length; i++) {
    const char = limpio[i];
    const siguiente = limpio[i + 1];

    if (dentroDeComillas) {
      if (char === '"' && siguiente === '"') {
        campo += '"';
        i++;
      } else if (char === '"') {
        dentroDeComillas = false;
      } else {
        campo += char;
      }
      continue;
    }

    if (char === '"') {
      dentroDeComillas = true;
    } else if (char === ",") {
      fila.push(campo);
      campo = "";
    } else if (char === "\r") {
      // se ignora, \n cierra la fila
    } else if (char === "\n") {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = "";
    } else {
      campo += char;
    }
  }

  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

export type FilaClienteCSV = {
  nombre: string;
  email: string;
  telefono: string;
  region: string;
  notas: string;
  vendedor: string;
  fechaInscripcionTexto: string;
  fechaInscripcion: string | null; // ISO
  valido: boolean;
  error?: string;
};

type CampoTexto = "nombre" | "email" | "telefono" | "region" | "notas" | "vendedor" | "fechaInscripcionTexto";

const ALIAS_COLUMNAS: Record<string, CampoTexto> = {
  nombre: "nombre",
  "nombre completo": "nombre",
  email: "email",
  correo: "email",
  telefono: "telefono",
  teléfono: "telefono",
  region: "region",
  región: "region",
  notas: "notas",
  vendedor: "vendedor",
  fecha_inscripcion: "fechaInscripcionTexto",
  "fecha de inscripcion": "fechaInscripcionTexto",
  "fecha de inscripción": "fechaInscripcionTexto",
  fecha_inscripción: "fechaInscripcionTexto",
};

function parsearFecha(texto: string): Date | null {
  const limpio = texto.trim();
  if (!limpio) return null;

  const iso = limpio.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const fecha = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const dmy = limpio.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const fecha = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fallback = new Date(limpio);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function filasAClientes(filas: string[][]): FilaClienteCSV[] {
  if (filas.length === 0) return [];

  const encabezados = filas[0].map((h) => h.trim().toLowerCase());
  const indices: Partial<Record<CampoTexto, number>> = {};
  encabezados.forEach((encabezado, i) => {
    const campo = ALIAS_COLUMNAS[encabezado];
    if (campo) indices[campo] = i;
  });

  const leer = (fila: string[], campo: CampoTexto) =>
    (indices[campo] !== undefined ? fila[indices[campo] as number] : "")?.trim() ?? "";

  return filas.slice(1).map((fila) => {
    const email = leer(fila, "email");
    const nombre = leer(fila, "nombre") || email;
    const telefono = leer(fila, "telefono");
    const notas = leer(fila, "notas");
    const vendedor = leer(fila, "vendedor");
    const fechaInscripcionTexto = leer(fila, "fechaInscripcionTexto");

    const regionCruda = leer(fila, "region").toUpperCase();
    const region = (REGIONES_CERTIFICACION as string[]).includes(regionCruda) ? regionCruda : "";

    const base = { nombre, email, telefono, region, notas, vendedor, fechaInscripcionTexto };

    // Aquí el correo es la llave del cliente (su id), así que es obligatorio.
    if (!email || !email.includes("@")) {
      return { ...base, fechaInscripcion: null, valido: false, error: "Falta un correo válido" };
    }

    if (fechaInscripcionTexto) {
      const fecha = parsearFecha(fechaInscripcionTexto);
      if (!fecha) {
        return {
          ...base,
          fechaInscripcion: null,
          valido: false,
          error: "Fecha de inscripción inválida (usa AAAA-MM-DD)",
        };
      }
      return { ...base, fechaInscripcion: fecha.toISOString(), valido: true };
    }

    return { ...base, fechaInscripcion: null, valido: true };
  });
}
