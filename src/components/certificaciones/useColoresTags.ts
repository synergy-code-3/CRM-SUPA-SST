"use client";

import { useEffect, useState } from "react";
import { registrarOrdenTags } from "@/lib/tag-colores";

// Trae una sola vez el orden de creación de los tags para asignarles color
// (compartido por todos los componentes de la página). Si el usuario no tiene
// permiso de Biblioteca, los tags usan el color por nombre de respaldo.
let cargado = false;
let pendiente: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function cargar(forzar = false): Promise<void> {
  if (cargado && !forzar) return Promise.resolve();
  if (pendiente) return pendiente;
  pendiente = fetch("/api/biblioteca?tipo=tag_certificaciones")
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data?.orden) {
        registrarOrdenTags(data.orden);
        cargado = true;
        oyentes.forEach((f) => f());
      }
    })
    .catch(() => {})
    .finally(() => {
      pendiente = null;
    });
  return pendiente;
}

export function refrescarColoresTags() {
  return cargar(true);
}

export function useColoresTags() {
  const [, setVersion] = useState(0);
  useEffect(() => {
    const f = () => setVersion((v) => v + 1);
    oyentes.add(f);
    cargar();
    return () => {
      oyentes.delete(f);
    };
  }, []);
}
