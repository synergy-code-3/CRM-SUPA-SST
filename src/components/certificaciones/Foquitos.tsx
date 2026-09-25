import type { ClienteCertificacion } from "@/lib/certificaciones-tipos";

// Los tres foquitos de la lista de Certificaciones (mismo estilo que los del
// Club: uno redondo y dos inclinados), de izquierda a derecha:
//  1. o  Invitación a Skool — verde cuando ya se envió (al aprobar la
//        solicitud se envía sola); apagado mientras el cliente es Nuevo.
//  2. /  Mensaje de bienvenida por WhatsApp — amarillo pendiente, verde
//        enviado, rojo número inválido (lo cambia una persona, no es
//        automático).
//  3. /  Invitación aceptada — verde cuando ya está en Skool como VIP y se
//        marcó "invitación aceptada".
export function Foquitos({ cliente }: { cliente: ClienteCertificacion }) {
  const invitado = cliente.estado !== "NUEVO";
  const aceptada = cliente.estado === "ACTIVO" || cliente.estado === "VENCIDO";
  const bienvenida = cliente.mensajeBienvenida;

  const tituloBienvenida =
    bienvenida === "ENVIADA"
      ? "Mensaje de bienvenida: enviado"
      : bienvenida === "INVALIDO"
        ? "Mensaje de bienvenida: número inválido"
        : "Mensaje de bienvenida: pendiente";

  return (
    <div
      className="flex flex-none items-center gap-2"
      title={`${invitado ? "Invitación: enviada" : "Invitación: sin enviar"} · ${tituloBienvenida} · ${
        aceptada ? "Invitación aceptada" : "Invitación sin aceptar"
      }`}
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
          aceptada ? "bg-success shadow-[0_0_6px_var(--color-success)]" : "bg-silver"
        }`}
      />
    </div>
  );
}
