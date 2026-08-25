// Fondo del header del panel del cliente (ClientePanel.tsx): qué logo va
// según el evento o la etiqueta del cliente. Se busca en ambos campos —
// cualquiera de los dos que matchee decide el logo.
export type LogoEvento = "mastermind" | "black-access" | "bgi" | "club-sinergetico";

export const RUTA_LOGO_EVENTO: Record<LogoEvento, string> = {
  mastermind: "/logos-eventos/mastermind.jpg",
  "black-access": "/logos-eventos/black-access.jpg",
  bgi: "/logos-eventos/bgi.jpeg",
  "club-sinergetico": "/logos-eventos/club-sinergetico.png",
};

// Único logo que es un PNG blanco (transparente) en vez de una imagen ya
// autocontenida — necesita su propio fondo oscuro sólido detrás, además del
// degradado que ya llevan todos para que el texto blanco se lea bien.
export const LOGO_NECESITA_FONDO_SOLIDO: LogoEvento = "club-sinergetico";

const MAPA_CLAVE_A_LOGO: Record<string, LogoEvento> = {
  "más+": "mastermind",
  "mas+": "mastermind",
  "más+ usa": "mastermind",
  "mas+ usa": "mastermind",
  "black access": "black-access",
  bgi: "bgi",
  "bussines growth": "bgi",
  "business growth": "bgi",
};

export function logoParaCliente(evento: string | null, etiqueta: string | null): LogoEvento {
  for (const valor of [evento, etiqueta]) {
    const clave = valor?.trim().toLowerCase();
    if (clave && MAPA_CLAVE_A_LOGO[clave]) return MAPA_CLAVE_A_LOGO[clave];
  }
  return "club-sinergetico";
}
