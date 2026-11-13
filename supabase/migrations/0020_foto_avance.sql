-- =============================================================================
-- espacioSM Obra · Foto de evidencia en avances
-- Archivo: supabase/migrations/0020_foto_avance.sql
--
-- Ejecutar después de 0019.
--
-- Guarda la ruta de la foto de evidencia en cada avance. El archivo se sube
-- al bucket privado definido en 0021.
-- =============================================================================

alter table public.generador_avances
  add column if not exists foto_path text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;
