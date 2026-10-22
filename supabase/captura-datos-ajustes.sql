-- Ajustes de base de datos para Captura de Datos que salieron de la revisión (ecc:database-reviewer).
-- NO SE HAN EJECUTADO NI PROBADO: revisar y correr a mano en el SQL Editor de Supabase (es idempotente).
-- El código de la app funciona sin esto; son mejoras de rendimiento, integridad y seguridad.

-- 1) Buscar un folio ya confirmado en CUALQUIER evento (buscarFolioDuplicado) hacía recorrido completo de la tabla:
--    el único índice con folio es (evento_id, folio).
create index if not exists idx_cap_hojas_folio_confirmada on cap_hojas (folio)
  where estado = 'confirmada' and folio is not null and folio <> '';

-- 2) Índices de las tablas hijas (el borrado en cascada y las consultas por evento/hoja recorrían todo).
create index if not exists idx_cap_hojas_historial_hoja on cap_hojas_historial (hoja_id);
create index if not exists idx_cap_reaperturas_evento on cap_eventos_reaperturas (evento_id);
create index if not exists idx_cap_asignaciones_usuario on cap_evento_asignaciones (usuario_id);

-- 3) Eliminar un evento que alguna vez se reabrió fallaba por la FK de reaperturas (sin ON DELETE).
--    El nombre de la restricción es el que Postgres genera por defecto; si el drop no encuentra nada, revisa el nombre real.
alter table cap_eventos_reaperturas drop constraint if exists cap_eventos_reaperturas_evento_id_fkey;
alter table cap_eventos_reaperturas
  add constraint cap_eventos_reaperturas_evento_id_fkey foreign key (evento_id) references cap_eventos (id) on delete cascade;

-- 4) tomar_hoja_libre: si la persona ya tiene una hoja vigente en el evento, se la devuelve (renovando el bloqueo)
--    en vez de bloquear otra cada vez que se pulsa "Tomar siguiente hoja".
create or replace function tomar_hoja_libre(p_evento uuid, p_usuario uuid)
returns cap_hojas
language plpgsql
as $$
declare
  fila cap_hojas;
begin
  update cap_hojas set bloqueada_hasta = now() + interval '10 minutes'
  where id = (
    select id from cap_hojas
    where evento_id = p_evento and estado in ('pendiente', 'leida')
      and bloqueada_por = p_usuario and bloqueada_hasta > now()
    order by id limit 1
    for update skip locked
  )
  returning * into fila;
  if fila.id is not null then
    return fila;
  end if;

  update cap_hojas set bloqueada_por = p_usuario, bloqueada_hasta = now() + interval '10 minutes'
  where id = (
    select id from cap_hojas
    where evento_id = p_evento and estado in ('pendiente', 'leida')
      and (bloqueada_hasta is null or bloqueada_hasta < now())
    order by id limit 1
    for update skip locked
  )
  returning * into fila;
  return fila;
end;
$$;

-- 5) Postgres da EXECUTE a PUBLIC por defecto: nadie salvo la secret key del servidor debe poder llamar a la función
--    (p_usuario es un parámetro libre). Verifica después que la app sigue tomando hojas.
revoke execute on function tomar_hoja_libre(uuid, uuid) from public, anon, authenticated;
grant execute on function tomar_hoja_libre(uuid, uuid) to service_role;
