"use client";

import { Pencil } from "lucide-react";
import { Modal } from "./Modal";
import { VisorHoja } from "./VisorHoja";
import type { HojaCaptura } from "@/lib/captura-datos/modelo";

const DATOS = [
  ["Folio", (h: HojaCaptura) => h.folio],
  ["Nombre", (h: HojaCaptura) => h.campos?.nombre],
  ["Correo", (h: HojaCaptura) => h.campos?.correo],
  ["Teléfono", (h: HojaCaptura) => (h.campos?.telefono ? `${h.campos.lada} ${h.campos.telefono}` : "")],
  ["Método de pago", (h: HojaCaptura) => h.campos?.metodoPago],
  ["Marca", (h: HojaCaptura) => h.campos?.marcaTarjeta],
  ["Últimos 4 dígitos", (h: HojaCaptura) => h.campos?.tarjeta],
  ["Cantidad", (h: HojaCaptura) => h.campos?.cantidad],
  ["Membresía", (h: HojaCaptura) => h.campos?.membresia],
  ["Notas", (h: HojaCaptura) => h.campos?.notas],
] as const;

export function VerHojaModal({ hoja, onCerrar, onEditar }: { hoja: HojaCaptura; onCerrar: () => void; onEditar?: () => void }) {
  const url = `/api/captura-datos/hojas/${hoja.id}/foto`;
  const esPdf = hoja.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(hoja.origen.nombreOriginal);
  const filas = DATOS.map(([etiqueta, valor]) => [etiqueta, valor(hoja)] as const).filter(([, v]) => v);
  return (
    <Modal titulo={hoja.folio ? `Hoja · Folio ${hoja.folio}` : "Hoja"} onCerrar={onCerrar} tamano="max-h-[80vh] sm:max-w-[72vw]">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-[60vh]">
          <VisorHoja url={url} esPdf={esPdf} voucherBox={hoja.voucherBox} onVoucherBox={() => {}} soloLectura />
        </div>
        <dl className="space-y-2 self-start text-base">
          {filas.length === 0 && <p className="text-muted">Esta hoja no tiene datos capturados.</p>}
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-baseline gap-2">
              <dt className="shrink-0 text-sm text-muted">{etiqueta}:</dt>
              <dd className="min-w-0 break-words font-medium text-foreground">{valor}</dd>
            </div>
          ))}
          {onEditar && (
            <button onClick={onEditar} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white">
              <Pencil className="h-4 w-4" /> Editar
            </button>
          )}
        </dl>
      </div>
    </Modal>
  );
}
