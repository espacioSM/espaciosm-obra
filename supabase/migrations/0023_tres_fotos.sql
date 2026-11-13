-- =============================================================================
-- espacioSM Obra · Hasta tres fotos por avance
-- Archivo: supabase/migrations/0023_tres_fotos.sql
--
-- Ejecutar después de 0022.
--
-- Conserva foto_path como foto principal y agrega foto_paths para las tres
-- evidencias del avance.
-- =============================================================================

alter table public.generador_avances
  add column if not exists foto_paths text[] not null default '{}';

update public.generador_avances
set foto_paths = array[foto_path]
where foto_path is not null
  and cardinality(foto_paths) = 0;

alter table public.generador_avances
  drop constraint if exists generador_avances_max_tres_fotos;

alter table public.generador_avances
  add constraint generador_avances_max_tres_fotos
  check (cardinality(foto_paths) <= 3);

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;
