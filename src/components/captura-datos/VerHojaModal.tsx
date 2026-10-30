"use client";

import { Modal } from "./Modal";
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

export function VerHojaModal({ hoja, onCerrar }: { hoja: HojaCaptura; onCerrar: () => void }) {
  const url = `/api/captura-datos/hojas/${hoja.id}/foto`;
  const esPdf = hoja.origen.rutaStorage?.endsWith(".pdf") || /\.pdf$/i.test(hoja.origen.nombreOriginal);
  const filas = DATOS.map(([etiqueta, valor]) => [etiqueta, valor(hoja)] as const).filter(([, v]) => v);
  return (
    <Modal titulo={hoja.folio ? `Hoja · Folio ${hoja.folio}` : "Hoja"} onCerrar={onCerrar}>
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        {esPdf
          ? <iframe src={url} title="Hoja" className="h-[70vh] w-full rounded-lg border border-silver" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={url} alt="Hoja" className="max-h-[70vh] w-full rounded-lg border border-silver object-contain" />}
        <dl className="space-y-2 text-sm">
          {filas.length === 0 && <p className="text-muted">Esta hoja no tiene datos capturados.</p>}
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta}>
              <dt className="text-xs text-muted">{etiqueta}</dt>
              <dd className="break-words font-medium text-foreground">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Modal>
  );
}
