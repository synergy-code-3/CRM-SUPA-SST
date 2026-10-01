// Matriz de permisos por rol. Sin imports de servidor (next/headers,
// bcryptjs, supabase) a propósito: se importa tanto desde route handlers
// como desde componentes cliente (para mostrar/ocultar UI).
export type Rol = "admin" | "coordinador" | "abeja";

export const ROLES: Rol[] = ["admin", "coordinador", "abeja"];

// admin: control total.
// coordinador: en el Club, ver todo + agregar notas/llamadas + exportar CSV
//   (no puede crear/editar clientes ni renovar/pausar/revocar/eliminar). En
//   Certificaciones sí tiene control total (gestionarCertificaciones), igual
//   que admin.
// abeja: solo lectura de clientes y sus perfiles/timeline.
export const PERMISOS = {
  verClientes: ["admin", "coordinador", "abeja"],
  verDashboard: ["admin"],
  verActividad: ["admin", "coordinador"],
  verEliminados: ["admin"],
  verBiblioteca: ["admin"],
  crearCliente: ["admin"],
  editarCliente: ["admin"],
  editarAccesos: ["admin"],
  eliminarCliente: ["admin"],
  renovarMembresia: ["admin"],
  pausarMembresia: ["admin"],
  revocarAccesoCliente: ["admin"], // "Revocar acceso" — reembolsos u otros casos que deben quitar el acceso ya
  solicitarCliente: ["admin", "coordinador", "abeja"],
  revisarSolicitudes: ["admin"],
  agregarNota: ["admin", "coordinador"],
  exportarCsv: ["admin", "coordinador"],
  importarCsv: ["admin"],
  gestionarCatalogo: ["admin"],
  gestionarUsuarios: ["admin"],
  verOtrasOfertas: ["admin", "coordinador", "abeja"], // igual criterio que verClientes
  importarOtrasOfertas: ["admin"], // igual criterio que importarCsv
  otorgarOferta: ["admin"], // Club: "Agregar oferta" en el panel + oferta opcional en la alta
  verAvisos: ["admin", "coordinador", "abeja"],
  gestionarAvisos: ["admin"], // crear, editar, borrar avisos
  verCertificaciones: ["admin", "coordinador", "abeja"],
  actualizarCertificaciones: ["admin", "coordinador"], // botón "Actualizar" (sync desde la hoja de ventas)
  agregarNotaCertificaciones: ["admin", "coordinador"],
  gestionarCertificaciones: ["admin", "coordinador"], // crear, editar datos, pausar/renovar, papelera
  solicitarCertificacion: ["admin", "coordinador", "abeja"], // igual criterio que solicitarCliente
  revisarSolicitudesCertificacion: ["admin"], // igual criterio que revisarSolicitudes
} as const satisfies Record<string, readonly Rol[]>;

export type Accion = keyof typeof PERMISOS;

export function tienePermiso(rol: Rol, accion: Accion): boolean {
  return (PERMISOS[accion] as readonly Rol[]).includes(rol);
}
