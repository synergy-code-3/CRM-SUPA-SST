-- Índices OPCIONALES para Captura de Datos (salieron de la revisión ecc:database-reviewer). Idempotente.
-- NO SE HAN EJECUTADO NI PROBADO: correr a mano en el SQL Editor de Supabase solo si el volumen de datos lo justifica.
-- El código funciona sin esto; son mejoras de rendimiento. La cascada de reaperturas, tomar_hoja_libre y sus permisos
-- ya viven en schema.sql y en captura-datos-fecha-orden.sql (no se repiten aquí para no pisarlas por error).

-- 1) Buscar un folio ya confirmado en CUALQUIER evento (buscarFolioDuplicado) hacía recorrido completo de la tabla:
--    el único índice con folio es (evento_id, folio).
create index if not exists idx_cap_hojas_folio_confirmada on cap_hojas (folio)
  where estado = 'confirmada' and folio is not null and folio <> '';

-- 2) Índices de las tablas hijas (el borrado en cascada y las consultas por evento/hoja recorrían todo).
create index if not exists idx_cap_hojas_historial_hoja on cap_hojas_historial (hoja_id);
create index if not exists idx_cap_reaperturas_evento on cap_eventos_reaperturas (evento_id);
create index if not exists idx_cap_asignaciones_usuario on cap_evento_asignaciones (usuario_id);
