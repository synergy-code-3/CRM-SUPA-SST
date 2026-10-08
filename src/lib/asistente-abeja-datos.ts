// Contenido del asistente de la abejita — SIN imports de servidor a
// propósito (lo usa un componente cliente): es una base de respuestas fija
// por palabras clave, no un modelo de lenguaje. Si el CRM cambia de forma
// que alguna respuesta de aquí quede desactualizada, hay que actualizarla
// a mano.

export type TemaAsistente = {
  id: string;
  pregunta: string; // texto del chip cuando es una de las iniciales
  palabrasClave: string[]; // en minúsculas, sin acentos no hace falta quitarlos (se normaliza al buscar)
  respuesta: string;
};

// Las primeras 5 son las que se muestran como chips al abrir el chat — el
// resto solo se encuentra escribiendo (coincidencia por palabra clave).
export const IDS_PREGUNTAS_INICIALES = [
  "alta-cliente",
  "aprobar-solicitud",
  "renovar",
  "certificaciones",
  "pausar-revocar",
];

export const TEMAS_ASISTENTE: TemaAsistente[] = [
  {
    id: "alta-cliente",
    pregunta: "¿Cómo doy de alta un cliente nuevo?",
    palabrasClave: ["alta", "nuevo cliente", "crear cliente", "dar de alta", "registrar cliente"],
    respuesta:
      'Clientes → botón "Nuevo cliente". Llena nombre, correo, país, teléfono, evento y tipo de membresía. Al guardar, el CRM solo le otorga la oferta "Club Sinergético" en Kajabi, la invitación a Skool y el mensaje de bienvenida por WhatsApp — automático, no hay que hacer nada más.',
  },
  {
    id: "aprobar-solicitud",
    pregunta: "¿Cómo apruebo una solicitud?",
    palabrasClave: ["aprobar", "solicitud", "rechazar", "revisar solicitud"],
    respuesta:
      'Solicitudes → la solicitud pendiente trae el comprobante de pago adjunto para revisarlo. "Aprobar" crea el cliente (o aplica el cambio, si el correo ya es cliente) y dispara Kajabi/Skool/WhatsApp solo. "Rechazar" pide una nota opcional y la deja marcada, sin tocar nada más.',
  },
  {
    id: "renovar",
    pregunta: "¿Cómo renuevo una membresía?",
    palabrasClave: ["renovar", "renovacion", "renovación", "membresia vencida", "membresía vencida"],
    respuesta:
      'Perfil del cliente → botón "Renovar membresía". No toca la fecha de inscripción original — guarda una fecha de renovación aparte y el fin de acceso se recalcula solo (renovación o inscripción + 1 año). Si ya pagó pero Kajabi todavía no refleja el cambio, usa "Registrar renovación anticipada" en vez de este botón.',
  },
  {
    id: "certificaciones",
    pregunta: "¿Qué es Certificaciones (Legendar-IA)?",
    palabrasClave: ["certificacion", "certificación", "legendaria", "legendar-ia", "legendar ia"],
    respuesta:
      "Es un producto aparte del Club Sinergético, con su propia lista de socios, Solicitudes y accesos (no comparte clientes ni boletos con el Club). Cambias de espacio de trabajo con el selector del logo, arriba del menú lateral. Si el mismo correo es socio de ambos, cada uno se maneja en su propia tabla, sin mezclarse.",
  },
  {
    id: "pausar-revocar",
    pregunta: "¿Cómo pauso o revoco un acceso?",
    palabrasClave: ["pausar", "pausa", "revocar", "reembolso", "suspender acceso", "reanudar"],
    respuesta:
      'Perfil del cliente → "Pausar membresía" quita el acceso en Kajabi pero congela los días que le quedaban (al reanudar, no se regala un año completo de nuevo). "Revocar acceso" es para reembolsos — pide doble confirmación porque no se puede deshacer solo; "Reanudar" regresa de una pausa.',
  },
  {
    id: "otras-ofertas",
    pregunta: "¿Qué es Otras Ofertas?",
    palabrasClave: ["otras ofertas", "club sinergetico aparte", "oferta adicional"],
    respuesta:
      "Es el roster del Club Sinergético para correos que no son clientes del Club (o para dar una oferta extra a alguien que sí lo es, desde su perfil con 'Agregar oferta'). Vive separado de la lista principal de Clientes a propósito.",
  },
  {
    id: "importar-csv",
    pregunta: "¿Cómo importo un CSV de clientes?",
    palabrasClave: ["importar", "csv", "excel", "carga masiva", "subir archivo"],
    respuesta:
      'Clientes → "Importar" (arriba de la lista). El CSV tiene que respetar las columnas que ya trae el formato de origen — si tienes dudas del formato exacto, pide el ejemplo a un admin antes de subir uno nuevo, una importación mal mapeada puede pisar datos reales.',
  },
  {
    id: "usuarios-roles",
    pregunta: "¿Qué puede hacer cada rol (admin/coordinador/abeja)?",
    palabrasClave: ["rol", "permiso", "admin", "coordinador", "abeja rol", "usuario nuevo"],
    respuesta:
      "Admin: control total. Coordinador: ve todo, agrega notas/llamadas, exporta CSV, y en Certificaciones tiene control total (ahí sí puede crear/editar). Abeja: solo lectura de clientes y perfiles, puede enviar solicitudes. Usuarios nuevos los crea un admin desde Usuarios en el menú.",
  },
  {
    id: "actividad",
    pregunta: "¿Dónde veo el historial de cambios de un cliente?",
    palabrasClave: ["actividad", "historial", "timeline", "linea de tiempo", "línea de tiempo", "quien hizo"],
    respuesta:
      "Cada cliente tiene su Timeline dentro de su perfil (creación, ediciones, pausas, renovaciones, notas...). Para buscar across todos los clientes con filtros, usa la página Actividad en el menú — ahí también se puede filtrar por tipo de evento y autor.",
  },
  {
    id: "avisos",
    pregunta: "¿Cómo funcionan los Avisos?",
    palabrasClave: ["aviso", "notificacion", "notificación", "ventana emergente", "popup"],
    respuesta:
      "Avisos manda un mensaje (con imagen opcional) a uno, varios o todos los usuarios — aparece como ventana emergente la próxima vez que esa persona entra, y queda vigente 5 días. Se administra desde Avisos en el menú lateral.",
  },
  {
    id: "community-manager",
    pregunta: "¿Qué hace Community Manager?",
    palabrasClave: ["community manager", "cm", "moderacion", "moderación", "redes sociales", "skool atencion"],
    respuesta:
      "Es el espacio para llevar Estadísticas y Moderación de las redes/comunidades (incluye Skool) — registra publicaciones, atenciones y motivos de moderación por plataforma, con sus propios gráficos. Está en construcción, pero ya funciona para coordinador y abeja.",
  },
  {
    id: "coordinacion",
    pregunta: "¿Qué es Coordinación Académica?",
    palabrasClave: ["coordinacion", "coordinación", "mentoria", "mentoría", "mentor", "gira", "grupo de comunidad", "calendario"],
    respuesta:
      "Es el workspace para Mentorías (con sus Mentores), Giras y Grupos de Comunidad, más un Calendario que junta eventos internos y giras en un solo lugar — con copys listos para copiar y pegar.",
  },
  {
    id: "apartado-50",
    pregunta: "¿Qué es el Apartado 50%?",
    palabrasClave: ["apartado", "50%", "anticipo", "usa-wjs"],
    respuesta:
      "Es exclusivo del evento USA-WJS: cuando alguien paga el 50% como apartado, se le da acceso completo de una vez con un temporizador de 30 días para liquidar el resto. Si no liquida a tiempo, hay que apagar el apartado manualmente desde su perfil.",
  },
  {
    id: "upgrade-12-meses",
    pregunta: "¿Cómo pido un upgrade a 12 meses?",
    palabrasClave: ["upgrade", "12 meses", "subir membresia", "subir membresía"],
    respuesta:
      "Desde el perfil del cliente (tarjeta de Resumen o botón dedicado) se abre una ventana para solicitar el upgrade de 3/6 a 12 meses. Igual que las solicitudes de alta, un admin la aprueba o rechaza desde Solicitudes.",
  },
  {
    id: "vsl-sync",
    pregunta: "¿Qué es la sincronización con VSL?",
    palabrasClave: ["vsl", "sincronizacion", "sincronización", "convertidos"],
    respuesta:
      "Cada 15 minutos el CRM revisa las ventas convertidas en el CRM de VSL y crea solas las Solicitudes correspondientes (Club o Certificaciones, según el producto vendido) — no hace falta capturarlas a mano. El vendedor de VSL ya elige evento/tipo de membresía o región en su propio formulario, así que la solicitud llega con esos datos listos para revisar.",
  },
  {
    id: "telefono-invalido",
    pregunta: "El WhatsApp de bienvenida dice 'Número Inválido', ¿qué hago?",
    palabrasClave: ["numero invalido", "número inválido", "whatsapp no llega", "telefono mal"],
    respuesta:
      "Corrige el teléfono en el perfil del cliente (con lada correcta) y usa el botón para reenviar el mensaje de bienvenida por WhatsApp. 'Número Inválido' es una marca manual del equipo, no se pone sola.",
  },
  {
    id: "exportar",
    pregunta: "¿Cómo exporto clientes a CSV?",
    palabrasClave: ["exportar", "descargar csv", "descargar excel"],
    respuesta: "Clientes (o Eventos) → botón de exportar arriba de la lista — baja exactamente lo que esté filtrado en ese momento, no toda la base completa.",
  },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita acentos para comparar parejo
}

// Cuenta cuántas palabras clave de cada tema aparecen en el texto escrito;
// se queda con el tema de más coincidencias (mínimo 1). Empate → el primero
// en el arreglo gana (los 5 iniciales van primero a propósito).
export function buscarRespuesta(texto: string): TemaAsistente | null {
  const plano = normalizar(texto);
  if (!plano.trim()) return null;

  let mejor: { tema: TemaAsistente; coincidencias: number } | null = null;
  for (const tema of TEMAS_ASISTENTE) {
    const coincidencias = tema.palabrasClave.filter((k) => plano.includes(normalizar(k))).length;
    if (coincidencias > 0 && (!mejor || coincidencias > mejor.coincidencias)) {
      mejor = { tema, coincidencias };
    }
  }
  return mejor?.tema ?? null;
}

export function temaPorId(id: string): TemaAsistente | undefined {
  return TEMAS_ASISTENTE.find((t) => t.id === id);
}
