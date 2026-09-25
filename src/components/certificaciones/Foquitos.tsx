import type { ClienteCertificacion } from "@/lib/certificaciones-tipos";
import { estadoReal } from "./constantes";

// Los tres foquitos de la lista de Certificaciones (mismo estilo que los del
// Club: uno redondo y dos inclinados), de izquierda a derecha:
//  1. o  Invitación a Skool — verde cuando ya se envió (al aprobar la
//        solicitud se envía sola); apagado mientras el cliente es Nuevo.
//  2. /  Mensaje de bienvenida por WhatsApp — amarillo pendiente, verde
//        enviado, rojo número inválido (lo cambia una persona, no es
//        automático).
//  3. /  Miembro VIP — apagado mientras es Nuevo; amarillo desde que se envía
//        la invitación hasta que se pasa a "Miembro VIP" (hay que revisar si
//        ya la aceptó); verde cuando ya es Miembro VIP; rojo cuando se le
//        venció el año.
export function Foquitos({ cliente }: { cliente: ClienteCertificacion }) {
  const estado = estadoReal(cliente);
  const invitado = cliente.estado !== "NUEVO";
  const bienvenida = cliente.mensajeBienvenida;

  const tituloBienvenida =
    bienvenida === "ENVIADA"
      ? "Mensaje de bienvenida: enviado"
      : bienvenida === "INVALIDO"
        ? "Mensaje de bienvenida: número inválido"
        : "Mensaje de bienvenida: pendiente";
  const tituloVip =
    estado === "VENCIDO"
      ? "Membresía vencida"
      : estado === "ACTIVO"
        ? "Miembro VIP"
        : estado === "INVITACION_ENVIADA"
          ? "Miembro VIP: pendiente, revisar si ya aceptó la invitación"
          : "Miembro VIP: aún sin invitar";

  return (
    <div
      className="flex flex-none items-center gap-2"
      title={`${invitado ? "Invitación: enviada" : "Invitación: sin enviar"} · ${tituloBienvenida} · ${tituloVip}`}
    >
      <span
        className={`h-2.5 w-2.5 flex-none rounded-full ${
          invitado ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-silver"
        }`}
      />
      <span
        className={`h-4 w-1.5 flex-none -skew-x-12 rounded-full transition ${
          bienvenida === "ENVIADA"
            ? "bg-success shadow-[0_0_6px_var(--color-success)]"
            : bienvenida === "INVALIDO"
              ? "bg-danger shadow-[0_0_6px_var(--color-danger)]"
              : "bg-warning shadow-[0_0_6px_var(--color-warning)]"
        }`}
      />
      <span
        className={`h-4 w-1.5 flex-none -skew-x-12 rounded-full transition ${
          estado === "VENCIDO"
            ? "bg-danger shadow-[0_0_6px_var(--color-danger)]"
            : estado === "ACTIVO"
              ? "bg-success shadow-[0_0_6px_var(--color-success)]"
              : estado === "INVITACION_ENVIADA"
                ? "bg-warning shadow-[0_0_6px_var(--color-warning)]"
                : "bg-silver"
        }`}
      />
    </div>
  );
}
