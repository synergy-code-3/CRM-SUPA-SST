-- Borrado de eventos de Captura de Datos: lo hace directamente un admin (sin solicitud ni historial). Idempotente.
-- Si en tu base existe la tabla cap_solicitudes_borrado de una versión anterior, ya no se usa y se puede ignorar.

-- Borrar un evento que alguna vez se reabrió fallaba por la FK de reaperturas (sin ON DELETE); sin esto el borrado falla.
alter table cap_eventos_reaperturas drop constraint if exists cap_eventos_reaperturas_evento_id_fkey;
alter table cap_eventos_reaperturas
  add constraint cap_eventos_reaperturas_evento_id_fkey foreign key (evento_id) references cap_eventos (id) on delete cascade;
