// Contenido del asistente de la abejita — SIN imports de servidor a
// propósito (lo usa un componente cliente): es una base de respuestas fija
// por palabras clave, no un modelo de lenguaje. Si el CRM cambia de forma
// que alguna respuesta de aquí quede desactualizada, hay que actualizarla
// a mano. Los permisos reales viven en permisos.ts — este archivo solo
// refleja esa matriz para decidir qué le muestra la abejita a cada rol.
import type { Rol } from "./permisos";

export type TemaAsistente = {
  id: string;
  pregunta: string; // texto del chip cuando es una de las iniciales
  palabrasClave: string[];
  // Las claves presentes son los roles que SÍ ven este tema (en chips y en
  // la búsqueda por palabras clave) — un rol ausente no lo ve ni como
  // sugerencia ni por búsqueda. Cada rol trae 1-2 variantes de respuesta,
  // elegidas al azar cada vez (variedad, no se siente repetido) y a veces
  // con contenido distinto de verdad (ej. quién sí puede aprobar algo).
  respuestas: Partial<Record<Rol, string[]>>;
};

// 5 preguntas sugeridas por rol, distintas a propósito — las que de verdad
// aplican a lo que cada quien puede hacer en el CRM.
export const IDS_PREGUNTAS_INICIALES: Record<Rol, string[]> = {
  abeja: ["solicitud-alta", "upgrade-12-meses", "certificaciones", "foquitos-estado", "telefono-invalido"],
  coordinador: ["certificaciones", "notas-llamadas", "exportar", "actividad", "vsl-sync"],
  admin: ["alta-cliente", "aprobar-solicitud", "pausar-revocar", "importar-csv", "coordinacion-academica"],
};

export const TEMAS_ASISTENTE: TemaAsistente[] = [
  {
    id: "alta-cliente",
    pregunta: "¿Cómo doy de alta un cliente nuevo?",
    palabrasClave: ["alta", "nuevo cliente", "crear cliente", "dar de alta", "registrar cliente"],
    respuestas: {
      admin: [
        'Clientes → "Nuevo cliente". Con nombre, correo, país, teléfono, evento y tipo de membresía, el CRM solo le otorga Kajabi ("Club Sinergético"), la invitación a Skool y el WhatsApp de bienvenida.',
        'Botón "Nuevo cliente" en Clientes. Al guardar, Kajabi/Skool/WhatsApp de bienvenida salen solos, no hay que hacer nada más.',
      ],
    },
  },
  {
    id: "solicitud-alta",
    pregunta: "¿Cómo envío una solicitud de alta de cliente?",
    palabrasClave: ["solicitud", "solicitar", "alta", "nuevo cliente", "mandar datos"],
    respuestas: {
      abeja: [
        'Solicitudes → llena el formulario con los datos del cliente y adjunta el comprobante de pago. Un admin la revisa y crea el cliente — ahí ves el estado (Pendiente/Aprobada/Rechazada).',
        "Desde el menú Solicitudes, igual que cualquier otra — comprobante de pago obligatorio. Si la rechazan te dicen por qué.",
      ],
      coordinador: [
        'Solicitudes → llena el formulario con los datos del cliente y el comprobante de pago. La revisión final la hace un admin.',
      ],
      admin: [
        "Puedes mandarla por Solicitudes como cualquiera, pero normalmente te conviene usar \"Nuevo cliente\" directo en Clientes — te ahorras el paso de revisión.",
      ],
    },
  },
  {
    id: "aprobar-solicitud",
    pregunta: "¿Cómo apruebo o rechazo una solicitud?",
    palabrasClave: ["aprobar", "solicitud", "rechazar", "revisar solicitud"],
    respuestas: {
      admin: [
        'Solicitudes → "Aprobar" crea el cliente (o aplica el cambio si el correo ya es cliente) y dispara Kajabi/Skool/WhatsApp solo. "Rechazar" deja una nota opcional, sin tocar nada más.',
        "Solo un admin revisa Solicitudes (Club y Certificaciones). Aprobar da de alta solo; rechazar solo deja constancia con nota.",
      ],
    },
  },
  {
    id: "renovar",
    pregunta: "¿Cómo renuevo una membresía?",
    palabrasClave: ["renovar", "renovacion", "renovación", "membresia vencida", "membresía vencida"],
    respuestas: {
      admin: [
        'Perfil del cliente → "Renovar membresía". No toca la fecha de inscripción original, guarda una fecha de renovación aparte y el fin de acceso se recalcula solo.',
        'Si ya pagó pero Kajabi todavía no refleja el cambio, usa "Registrar renovación anticipada" en vez de "Renovar membresía".',
      ],
    },
  },
  {
    id: "pausar-revocar",
    pregunta: "¿Cómo pauso o revoco un acceso?",
    palabrasClave: ["pausar", "pausa", "revocar", "reembolso", "suspender acceso", "reanudar"],
    respuestas: {
      admin: [
        'Perfil del cliente → "Pausar membresía" quita el acceso en Kajabi pero congela los días que le quedaban. "Revocar acceso" es para reembolsos — pide doble confirmación, no se deshace solo. "Reanudar" regresa de una pausa.',
        "Pausar = temporal, congela días. Revocar = definitivo (reembolsos), con doble confirmación. Ambos están en el perfil del cliente.",
      ],
    },
  },
  {
    id: "certificaciones",
    pregunta: "¿Qué es Certificaciones (Legendar-IA)?",
    palabrasClave: ["certificacion", "certificación", "legendaria", "legendar-ia", "legendar ia"],
    respuestas: {
      abeja: [
        "Es un producto aparte del Club, con su propia lista de socios (no comparte clientes ni boletos). Cambias de espacio con el selector del logo arriba del menú. Tú ves perfiles y puedes mandar solicitudes de alta ahí también.",
      ],
      coordinador: [
        "Producto aparte del Club, con su propia lista de socios. Ahí tienes control total: crear, editar, pausar, renovar y papelera — igual que un admin.",
        "Cambias de espacio con el selector del logo. A diferencia del Club, aquí sí puedes gestionar clientes completo, no solo ver.",
      ],
      admin: [
        "Producto aparte del Club, con su propia lista de socios y Solicitudes — no se mezcla con Clientes ni con boletos del Club.",
      ],
    },
  },
  {
    id: "otras-ofertas",
    pregunta: "¿Qué es Otras Ofertas?",
    palabrasClave: ["otras ofertas", "club sinergetico aparte", "oferta adicional"],
    respuestas: {
      abeja: ["Roster del Club para correos que no son clientes del Club. Vive separado de la lista principal de Clientes."],
      coordinador: ["Roster aparte del Club. Lo ves igual que Clientes, pero es una lista independiente."],
      admin: [
        "Roster aparte del Club. También puedes dar una oferta extra a un cliente que sí es del Club, desde su perfil con 'Agregar oferta'.",
      ],
    },
  },
  {
    id: "importar-csv",
    pregunta: "¿Cómo importo un CSV de clientes?",
    palabrasClave: ["importar", "csv", "excel", "carga masiva", "subir archivo"],
    respuestas: {
      admin: [
        'Clientes → "Importar", arriba de la lista. Respeta las columnas del formato de origen — una importación mal mapeada puede pisar datos reales, revisa el archivo antes de confirmar.',
      ],
    },
  },
  {
    id: "usuarios-nuevos",
    pregunta: "¿Cómo creo un usuario nuevo?",
    palabrasClave: ["usuario nuevo", "crear usuario", "dar de alta usuario", "cuenta nueva"],
    respuestas: {
      admin: ["Usuarios en el menú → crear con correo, nombre y rol (admin/coordinador/abeja). Solo un admin puede hacerlo."],
    },
  },
  {
    id: "usuarios-roles",
    pregunta: "¿Qué puedo hacer yo con mi rol?",
    palabrasClave: ["rol", "permiso", "que puedo hacer", "qué puedo hacer", "mi rol"],
    respuestas: {
      abeja: [
        "Como abeja: ves Clientes, Otras Ofertas y Certificaciones (solo lectura), y puedes mandar solicitudes de alta o de upgrade. No editas clientes ni apruebas nada directo.",
      ],
      coordinador: [
        "Como coordinador: ves todo en el Club (sin editar directo), agregas notas/llamadas, exportas CSV, y en Certificaciones sí tienes control total (crear/editar/pausar/renovar).",
      ],
      admin: ["Como admin: control total en todo el CRM — Club, Certificaciones, Usuarios, Biblioteca y Coordinación Académica."],
    },
  },
  {
    id: "actividad",
    pregunta: "¿Dónde veo el historial de cambios de un cliente?",
    palabrasClave: ["actividad", "historial", "timeline", "linea de tiempo", "línea de tiempo", "quien hizo"],
    respuestas: {
      abeja: ["No tienes la página Actividad, pero cada cliente tiene su Timeline dentro de su perfil con todo su historial."],
      coordinador: [
        "Actividad en el menú busca y filtra across todos los clientes (por tipo de evento, autor, etc.). Cada perfil también trae su Timeline propio.",
      ],
      admin: ["Actividad en el menú, con filtros por tipo y autor. El Timeline de cada cliente vive dentro de su perfil."],
    },
  },
  {
    id: "avisos",
    pregunta: "¿Cómo funcionan los Avisos?",
    palabrasClave: ["aviso", "notificacion", "notificación", "ventana emergente", "popup"],
    respuestas: {
      abeja: ["Te aparecen como ventana emergente al entrar, vigentes 5 días — no tienes que hacer nada para recibirlos."],
      coordinador: ["Te aparecen como ventana emergente al entrar, vigentes 5 días. Solo un admin puede crearlos."],
      admin: [
        "Avisos en el menú → crea uno (con imagen opcional) para uno, varios o todos los usuarios; aparece como ventana emergente y dura 5 días.",
      ],
    },
  },
  {
    id: "community-manager",
    pregunta: "¿Qué hace Community Manager?",
    palabrasClave: ["community manager", "cm", "moderacion", "moderación", "redes sociales", "skool atencion"],
    respuestas: {
      abeja: ["Está en construcción para tu rol todavía — pronto vas a poder usarlo."],
      coordinador: ["Está en construcción para tu rol todavía — pronto vas a poder usarlo."],
      admin: [
        "Estadísticas y Moderación de redes/comunidades (incluye Skool): publicaciones, atenciones y motivos de moderación, con sus propios gráficos.",
      ],
    },
  },
  {
    id: "coordinacion-academica",
    pregunta: "¿Qué es Coordinación Académica?",
    palabrasClave: [
      "coordinacion",
      "coordinación",
      "mentoria",
      "mentoría",
      "mentor",
      "gira",
      "grupo de comunidad",
      "calendario",
    ],
    respuestas: {
      admin: [
        "Workspace para Mentorías (con sus Mentores), Giras y Grupos de Comunidad, más un Calendario que junta todo con copys listos para copiar.",
      ],
    },
  },
  {
    id: "apartado-50",
    pregunta: "¿Qué es el Apartado 50%?",
    palabrasClave: ["apartado", "50%", "anticipo", "usa-wjs"],
    respuestas: {
      admin: [
        "Exclusivo del evento USA-WJS: si pagó el 50% como apartado, se da acceso completo de una vez con 30 días de temporizador para liquidar. Si no liquida a tiempo, se apaga manualmente desde su perfil.",
      ],
    },
  },
  {
    id: "upgrade-12-meses",
    pregunta: "¿Cómo pido un upgrade a 12 meses?",
    palabrasClave: ["upgrade", "12 meses", "subir membresia", "subir membresía"],
    respuestas: {
      abeja: ['Desde el perfil del cliente, botón de upgrade a 12 meses — queda como solicitud, la aprueba un admin.'],
      coordinador: ['Desde el perfil del cliente, botón de upgrade a 12 meses — queda pendiente de que un admin la apruebe.'],
      admin: [
        "Desde el perfil del cliente se pide, y tú la apruebas/rechazas en Solicitudes, igual que una de alta.",
      ],
    },
  },
  {
    id: "vsl-sync",
    pregunta: "¿Qué es la sincronización con VSL?",
    palabrasClave: ["vsl", "sincronizacion", "sincronización", "convertidos"],
    respuestas: {
      coordinador: [
        "Cada 15 minutos el CRM revisa las ventas convertidas en el CRM de VSL y crea solas las Solicitudes (Club o Certificaciones, según lo que vendieron) — llegan listas para revisar.",
      ],
      admin: [
        "Cada 15 min se revisan las ventas convertidas en VSL y se crean solas las Solicitudes correspondientes. El vendedor de VSL ya elige evento/membresía o región en su propio formulario, así que llegan con esos datos.",
      ],
    },
  },
  {
    id: "telefono-invalido",
    pregunta: "El WhatsApp de bienvenida dice 'Número Inválido', ¿qué hago?",
    palabrasClave: ["numero invalido", "número inválido", "whatsapp no llega", "telefono mal"],
    respuestas: {
      abeja: ["Avísale a un admin para que corrija el teléfono en el perfil — tú no puedes editarlo directo."],
      coordinador: ["Avísale a un admin para que corrija el teléfono en el perfil — la edición directa es solo de admin."],
      admin: [
        "Corrige el teléfono en el perfil (con lada correcta) y usa el botón para reenviar el WhatsApp de bienvenida. 'Número Inválido' es una marca manual, no se pone sola.",
      ],
    },
  },
  {
    id: "exportar",
    pregunta: "¿Cómo exporto clientes a CSV?",
    palabrasClave: ["exportar", "descargar csv", "descargar excel"],
    respuestas: {
      coordinador: ["Clientes (o Eventos) → botón de exportar arriba de la lista. Baja justo lo que esté filtrado, no toda la base."],
      admin: ["Botón de exportar arriba de la lista en Clientes o Eventos — exporta lo filtrado en ese momento."],
    },
  },
  {
    id: "notas-llamadas",
    pregunta: "¿Cómo agrego una nota o registro una llamada?",
    palabrasClave: ["nota", "llamada", "agregar nota", "registrar llamada"],
    respuestas: {
      coordinador: ["Desde el perfil del cliente, en la tarjeta de Notas — queda con tu nombre y fecha, visible en el Timeline."],
      admin: ["Perfil del cliente → tarjeta de Notas. Queda registrada en el Timeline con quién la escribió."],
    },
  },
  {
    id: "dashboard",
    pregunta: "¿Qué muestra el Dashboard?",
    palabrasClave: ["dashboard", "resumen general", "panel principal"],
    respuestas: {
      admin: ["Resumen general del Club: números clave de clientes, membresías y actividad reciente. Solo lo ve un admin."],
    },
  },
  {
    id: "eliminados",
    pregunta: "¿Dónde veo los clientes eliminados?",
    palabrasClave: ["eliminado", "papelera", "borrado", "cliente borrado"],
    respuestas: {
      admin: ["Eliminados en el menú — son clientes archivados (no borrados de verdad), se pueden restaurar desde ahí."],
    },
  },
  {
    id: "foquitos-estado",
    pregunta: "¿Qué significan los foquitos de estado en la lista?",
    palabrasClave: ["foquito", "foco", "semaforo", "semáforo", "color estado", "luz de estado"],
    respuestas: {
      abeja: [
        "Son el estado de Kajabi/Skool/Bienvenida de cada cliente: parpadeando = esperando confirmación, encendido fijo = ya confirmado.",
      ],
      coordinador: [
        "Muestran si Kajabi, Skool y el WhatsApp de bienvenida ya se confirmaron (encendido) o siguen pendientes (parpadeando).",
      ],
      admin: [
        "Kajabi/Skool/Bienvenida por cliente: parpadeando = pendiente de confirmar, fijo = confirmado. En Certificaciones son tres: invitación, bienvenida, aceptada.",
      ],
    },
  },
];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita acentos para comparar parejo
}

function elegirAlAzar<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

export function temasVisiblesParaRol(rol: Rol): TemaAsistente[] {
  return TEMAS_ASISTENTE.filter((t) => !!t.respuestas[rol]?.length);
}

export function preguntasInicialesParaRol(rol: Rol): TemaAsistente[] {
  return IDS_PREGUNTAS_INICIALES[rol]
    .map((id) => TEMAS_ASISTENTE.find((t) => t.id === id))
    .filter((t): t is TemaAsistente => !!t && !!t.respuestas[rol]?.length);
}

// Elige una respuesta al azar entre las variantes de ESE rol para el tema
// dado — null si el tema no aplica a este rol (no debería mostrarse nunca,
// pero por si acaso no revienta).
export function respuestaAleatoria(tema: TemaAsistente, rol: Rol): string | null {
  const variantes = tema.respuestas[rol];
  if (!variantes || variantes.length === 0) return null;
  return elegirAlAzar(variantes);
}

// Cuenta cuántas palabras clave de cada tema VISIBLE PARA ESE ROL aparecen
// en el texto escrito; se queda con el de más coincidencias (mínimo 1).
export function buscarTema(texto: string, rol: Rol): TemaAsistente | null {
  const plano = normalizar(texto);
  if (!plano.trim()) return null;

  let mejor: { tema: TemaAsistente; coincidencias: number } | null = null;
  for (const tema of temasVisiblesParaRol(rol)) {
    const coincidencias = tema.palabrasClave.filter((k) => plano.includes(normalizar(k))).length;
    if (coincidencias > 0 && (!mejor || coincidencias > mejor.coincidencias)) {
      mejor = { tema, coincidencias };
    }
  }
  return mejor?.tema ?? null;
}

const RESPUESTAS_SIN_RESULTADO = [
  'No encontré nada con esas palabras — intenta con otros términos (ej. "renovar", "certificaciones", "exportar").',
  "No te entendí bien — prueba con una palabra más directa, o pregúntale a un admin si no aparece.",
];

export function respuestaSinResultado(): string {
  return elegirAlAzar(RESPUESTAS_SIN_RESULTADO);
}
