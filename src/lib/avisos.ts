import { supabase } from "@/lib/supabase";
import type { Aviso, AvisoConfirmacion } from "@/lib/types";

type AvisoRow = {
  id: string;
  titulo: string;
  mensaje: string;
  autor_id: string | null;
  autor_nombre: string;
  creado_en: string;
  editado_en: string | null;
  solo_admin: boolean;
  destinatarios_ids: string[] | null;
  urgente: boolean;
  imagen_url: string | null;
};

type ConfirmacionRow = {
  aviso_id: string;
  usuario_id: string;
  usuario_nombre: string;
  confirmado_en: string;
};

function filaAAviso(row: AvisoRow, confirmaciones: AvisoConfirmacion[] | null): Aviso {
  return {
    id: row.id,
    titulo: row.titulo,
    mensaje: row.mensaje,
    autorId: row.autor_id,
    autorNombre: row.autor_nombre,
    creadoEn: row.creado_en,
    editadoEn: row.editado_en,
    confirmaciones,
    soloAdmin: row.solo_admin,
    destinatariosIds: row.destinatarios_ids ?? [],
    urgente: row.urgente,
    imagenUrl: row.imagen_url,
  };
}

// Trae todos los avisos, más nuevo primero. Las confirmaciones (quién le
// dio "Enterado" y cuándo) solo se traen y se mandan si el que pide la lista
// es admin — para los demás roles el campo queda en null, no en una lista
// vacía, para que quede claro en el tipo que ese dato ni siquiera llegó. Los
// avisos "solo_admin" (ej. reactivaciones automáticas de Kajabi) ni siquiera
// se listan para quien no es admin — no les interesa y no son suyos para
// confirmar. Un aviso "Personal" (destinatarios_ids con contenido) solo lo
// ve admin (supervisión) o alguno de esos destinatarios — antes este filtro
// faltaba aquí (solo estaba en listarAvisosPendientes) y cualquiera con
// permiso verAvisos veía avisos dirigidos a otra persona en /avisos.
export async function listarAvisos(usuario: { id: string; rol: string }): Promise<Aviso[]> {
  const esAdmin = usuario.rol === "admin";
  let query = supabase.from("avisos").select("*").order("creado_en", { ascending: false });
  if (!esAdmin) {
    query = query.eq("solo_admin", false).or(`destinatarios_ids.eq.{},destinatarios_ids.cs.{${usuario.id}}`);
  }
  const { data: avisos, error } = await query;
  if (error) throw error;
  const filas = (avisos ?? []) as AvisoRow[];
  if (!esAdmin) return filas.map((f) => filaAAviso(f, null));

  const ids = filas.map((f) => f.id);
  const porAviso = new Map<string, AvisoConfirmacion[]>();
  if (ids.length) {
    const { data: confirmaciones, error: errConf } = await supabase
      .from("avisos_confirmaciones")
      .select("aviso_id,usuario_id,usuario_nombre,confirmado_en")
      .in("aviso_id", ids)
      .order("confirmado_en", { ascending: true });
    if (errConf) throw errConf;
    for (const c of (confirmaciones ?? []) as ConfirmacionRow[]) {
      const lista = porAviso.get(c.aviso_id) ?? [];
      lista.push({ usuarioId: c.usuario_id, usuarioNombre: c.usuario_nombre, confirmadoEn: c.confirmado_en });
      porAviso.set(c.aviso_id, lista);
    }
  }
  return filas.map((f) => filaAAviso(f, porAviso.get(f.id) ?? []));
}

// destinatariosIds/urgente/imagenUrl opcionales: ver comentario en el tipo
// Aviso (types.ts) — un aviso "Personal" (destinatariosIds con contenido)
// solo le llega a esos usuarios, ignorando soloAdmin, y opcionalmente se
// muestra en tonos rojo/urgente (ej. "correo inválido" en una solicitud, ver
// marcarSolicitudCorreoInvalido) y/o con una imagen adjunta.
export async function crearAviso(
  titulo: string,
  mensaje: string,
  autorId: string,
  autorNombre: string,
  opciones?: { id?: string; destinatariosIds?: string[]; urgente?: boolean; imagenUrl?: string | null }
): Promise<Aviso> {
  const { data, error } = await supabase
    .from("avisos")
    .insert({
      ...(opciones?.id ? { id: opciones.id } : {}),
      titulo: titulo.trim(),
      mensaje: mensaje.trim(),
      autor_id: autorId,
      autor_nombre: autorNombre,
      destinatarios_ids: opciones?.destinatariosIds ?? [],
      urgente: opciones?.urgente ?? false,
      imagen_url: opciones?.imagenUrl ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return filaAAviso(data as AvisoRow, []);
}

// Aviso generado por el sistema (ej. reconciliación automática de Kajabi,
// ver /api/cron/sincronizar-kajabi) — sin autor_id porque no hay un usuario
// real detrás. soloAdmin=true (el caso real de hoy, reactivaciones de
// Kajabi) lo deja fuera de /avisos y de la ventana emergente para
// coordinador/abeja — es ruido operativo que no les toca a ellos.
export async function crearAvisoAutomatico(titulo: string, mensaje: string, soloAdmin: boolean): Promise<Aviso> {
  const { data, error } = await supabase
    .from("avisos")
    .insert({ titulo: titulo.trim(), mensaje: mensaje.trim(), autor_id: null, autor_nombre: "Kajabi", solo_admin: soloAdmin })
    .select("*")
    .single();
  if (error) throw error;
  return filaAAviso(data as AvisoRow, []);
}

// Editar NO toca avisos_confirmaciones a propósito — corregir un error de
// texto no debe volver a molestar a quien ya había confirmado que se
// enteró. imagenUrl: undefined = no cambiar, null = quitar la imagen.
export async function editarAviso(
  id: string,
  titulo: string,
  mensaje: string,
  imagenUrl?: string | null
): Promise<Aviso> {
  const patch: Record<string, string | null> = { titulo: titulo.trim(), mensaje: mensaje.trim(), editado_en: new Date().toISOString() };
  if (imagenUrl !== undefined) patch.imagen_url = imagenUrl;
  const { data, error } = await supabase.from("avisos").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return filaAAviso(data as AvisoRow, null);
}

export async function eliminarAviso(id: string): Promise<void> {
  const { error } = await supabase.from("avisos").delete().eq("id", id);
  if (error) throw error;
}

// Un aviso solo puede aparecer como ventana emergente durante estos días
// desde que se creó — pasado ese plazo, quien no lo haya visto ya no lo ve
// emergente (se queda nada más en la página "Avisos", donde siempre sigue
// visible sin importar la vigencia). Evita que alguien nuevo reciba, de
// golpe, todo el historial de avisos de meses atrás como si fueran de hoy.
export const VIGENCIA_AVISO_DIAS = 5;

// Avisos que "usuarioId" todavía no ha confirmado, sin contar los que él
// mismo publicó — más viejo primero, para mostrarlos en ese orden en la
// ventana emergente. Volumen bajo (avisos internos del equipo, no miles de
// filas), así que se filtra en JS en vez de armar un anti-join en SQL.
// esAdmin en false deja fuera los avisos "solo_admin" (ej. reactivaciones
// automáticas de Kajabi) — ni le cuentan para la burbuja ni le abren la
// ventana emergente a coordinador/abeja.
export async function listarAvisosPendientes(usuarioId: string, esAdmin: boolean): Promise<Aviso[]> {
  const limiteVigencia = new Date(Date.now() - VIGENCIA_AVISO_DIAS * 24 * 60 * 60 * 1000).toISOString();
  // .neq("autor_id", usuarioId) no basta sola: en SQL, NULL != x nunca da
  // verdadero, así que un aviso generado por el sistema (autor_id null, ver
  // crearAvisoAutomatico) quedaría invisible para todos si se usa un .neq
  // simple — hay que incluir explícitamente el caso "sin autor".
  //
  // Un aviso "Personal" (destinatarios_ids con contenido) le llega SOLO a
  // esos usuarios (ignora soloAdmin y el filtro de autor de abajo) — el
  // resto sigue el comportamiento normal de transmisión por rol
  // (destinatarios_ids vacío = "General").
  const dirigidoAMi = `destinatarios_ids.cs.{${usuarioId}}`;
  const broadcast = [`destinatarios_ids.eq.{}`, `or(autor_id.is.null,autor_id.neq.${usuarioId})`];
  if (!esAdmin) broadcast.push(`solo_admin.eq.false`);
  const query = supabase
    .from("avisos")
    .select("*")
    .or(`${dirigidoAMi},and(${broadcast.join(",")})`)
    .gte("creado_en", limiteVigencia)
    .order("creado_en", { ascending: true });
  const { data: avisos, error } = await query;
  if (error) throw error;
  const filas = (avisos ?? []) as AvisoRow[];
  if (!filas.length) return [];

  const { data: confirmaciones, error: errConf } = await supabase
    .from("avisos_confirmaciones")
    .select("aviso_id")
    .eq("usuario_id", usuarioId)
    .in(
      "aviso_id",
      filas.map((f) => f.id)
    );
  if (errConf) throw errConf;
  const yaConfirmados = new Set((confirmaciones ?? []).map((c) => c.aviso_id as string));

  return filas.filter((f) => !yaConfirmados.has(f.id)).map((f) => filaAAviso(f, null));
}

// Idempotente: confirmar el mismo aviso dos veces no truena ni duplica
// (unique(aviso_id, usuario_id) + upsert).
export async function confirmarAviso(avisoId: string, usuarioId: string, usuarioNombre: string): Promise<void> {
  const { error } = await supabase
    .from("avisos_confirmaciones")
    .upsert(
      { aviso_id: avisoId, usuario_id: usuarioId, usuario_nombre: usuarioNombre },
      { onConflict: "aviso_id,usuario_id", ignoreDuplicates: true }
    );
  if (error) throw error;
}

// Para la burbuja de "Avisos" en el menú lateral — a diferencia de
// contarSolicitudesPendientes/contarUsuariosPendientes, este conteo aplica
// a cualquier rol (todos pueden tener avisos sin confirmar), así que
// GET /api/notificaciones/pendientes lo calcula siempre, sin gatearlo por
// permiso.
export async function contarAvisosPendientes(usuarioId: string, esAdmin: boolean): Promise<number> {
  return (await listarAvisosPendientes(usuarioId, esAdmin)).length;
}
