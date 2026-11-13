-- =============================================================================
-- espacioSM Obra · Programa de obra
-- Archivo: supabase/migrations/0035_programa_obra.sql
--
-- Ejecutar después de 0034.
--
-- Cada actividad se liga a un generador, usa su cantidad y un rendimiento
-- (unidad por día). La duración se calcula en la app con días de lunes a
-- sábado. Las dependencias son fin-inicio.
-- =============================================================================

alter table public.generadores
  add column if not exists rendimiento numeric(12, 2) not null default 0;

do $$
begin
  alter table public.generadores
    add constraint generadores_rendimiento_no_negativo
    check (rendimiento >= 0);
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.programa_actividades (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  generador_id uuid references public.generadores (id) on delete set null,
  nombre text not null,
  cantidad numeric(14, 2) not null default 0,
  unidad text not null default 'pieza',
  rendimiento numeric(12, 2) not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  depende_de_id uuid references public.programa_actividades (id) on delete set null,
  orden integer not null default 0,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint programa_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint programa_cantidad_no_negativa check (cantidad >= 0),
  constraint programa_rendimiento_positivo check (rendimiento > 0),
  constraint programa_fechas_coherentes check (fecha_fin >= fecha_inicio),
  constraint programa_no_depende_de_si_misma check (depende_de_id is null or depende_de_id <> id)
);

create index if not exists programa_proyecto_orden_idx
  on public.programa_actividades (proyecto_id, orden, fecha_inicio);

drop trigger if exists programa_actividades_actualizado on public.programa_actividades;
create trigger programa_actividades_actualizado
before update on public.programa_actividades
for each row execute function public.marcar_actualizado();

alter table public.programa_actividades enable row level security;

revoke all on public.programa_actividades from anon;
grant select, insert, update, delete on public.programa_actividades to authenticated;

drop policy if exists programa_actividades_select on public.programa_actividades;
create policy programa_actividades_select on public.programa_actividades
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('generadores', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists programa_actividades_insert on public.programa_actividades;
create policy programa_actividades_insert on public.programa_actividades
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists programa_actividades_update on public.programa_actividades;
create policy programa_actividades_update on public.programa_actividades
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists programa_actividades_delete on public.programa_actividades;
create policy programa_actividades_delete on public.programa_actividades
for delete to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as actividades from public.programa_actividades;
