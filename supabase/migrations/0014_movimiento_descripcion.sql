-- =============================================================================
-- espacioSM Obra · Descripción del material en movimientos
-- Archivo: supabase/migrations/0014_movimiento_descripcion.sql
--
-- Ejecutar después de 0013.
--
-- Agrega una descripción propia del material en cada entrada o salida,
-- independiente de la nota.
-- =============================================================================

alter table public.material_movimientos
  add column if not exists descripcion text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as movimientos from public.material_movimientos;
