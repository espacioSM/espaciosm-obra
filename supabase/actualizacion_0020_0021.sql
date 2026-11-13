-- =============================================================================
-- espacioSM Obra · Fotos de evidencia
-- Archivo: supabase/actualizacion_0020_0021.sql
--
-- Ejecutar una vez en el proyecto actual. Incluye 0020 y 0021.
-- =============================================================================

-- ############################################################################
-- INICIO 0020_foto_avance.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0021_storage_evidencias.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Bucket privado de evidencias
-- Archivo: supabase/migrations/0021_storage_evidencias.sql
--
-- Ejecutar después de 0020.
--
-- Bucket privado para fotos de avance. La ruta es:
--   <proyecto_id>/<generador_id>/<archivo>.jpg
-- Solo los miembros de la obra pueden subir y leer sus evidencias.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidencias',
  'evidencias',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists evidencias_insert on storage.objects;
create policy evidencias_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'evidencias'
  and array_length(storage.foldername(name), 1) >= 2
  and public.tiene_acceso_proyecto(((storage.foldername(name))[1])::uuid)
);

drop policy if exists evidencias_select on storage.objects;
create policy evidencias_select on storage.objects
for select to authenticated
using (
  bucket_id = 'evidencias'
  and array_length(storage.foldername(name), 1) >= 2
  and public.tiene_acceso_proyecto(((storage.foldername(name))[1])::uuid)
);

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select id, name, public
from storage.buckets
where id = 'evidencias';
