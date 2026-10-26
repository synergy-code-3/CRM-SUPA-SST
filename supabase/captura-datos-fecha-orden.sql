-- Captura de Datos: fecha del evento y orden de captura. Idempotente; correr a mano en el SQL Editor de Supabase
-- ANTES de desplegar el código (crear eventos escribe la columna `fecha`).

-- 1) Fecha del evento (los anteriores quedan sin fecha).
alter table cap_eventos add column if not exists fecha date;

-- 2) tomar_hoja_libre: la siguiente hoja sigue el orden de la pantalla (Completos, Apartados, Interesados; dentro de cada uno, por id).
--    Misma lógica que captura-datos-ajustes.sql (devuelve primero la hoja vigente de la persona), solo cambia el ORDER BY.
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
    order by case estatus when 'Completo' then 1 when 'Apartado' then 2 else 3 end, id limit 1
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
    order by case estatus when 'Completo' then 1 when 'Apartado' then 2 else 3 end, id limit 1
    for update skip locked
  )
  returning * into fila;
  return fila;
end;
$$;

revoke execute on function tomar_hoja_libre(uuid, uuid) from public, anon, authenticated;
grant execute on function tomar_hoja_libre(uuid, uuid) to service_role;
