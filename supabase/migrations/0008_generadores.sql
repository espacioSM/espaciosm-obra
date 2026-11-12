-- =============================================================================
-- espacioSM Obra · Generadores de obra
-- Archivo: supabase/migrations/0008_generadores.sql
--
-- Ejecutar después de 0007.
--
-- Un generador es un concepto contratado: clave, descripción, unidad, cantidad
-- y precio unitario. Los avances acumulados dan la cantidad ejecutada y el
-- importe ejecutado; sirven de base para las estimaciones.
-- =============================================================================

create table if not exists public.generadores (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  clave text,
  descripcion text not null,
  unidad text not null default 'pieza',
  cantidad numeric(12, 2) not null,
  precio_unitario numeric(12, 2) not null default 0,
  activo boolean not null default true,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint generadores_descripcion_no_vacia check (btrim(descripcion) <> ''),
  constraint generadores_unidad_no_vacia check (btrim(unidad) <> ''),
  constraint generadores_cantidad_positiva check (cantidad > 0),
  constraint generadores_precio_no_negativo check (precio_unitario >= 0),
  constraint generadores_proyecto_clave unique (proyecto_id, clave)
);

create index if not exists generadores_proyecto_idx
  on public.generadores (proyecto_id);

create table if not exists public.generador_avances (
  id uuid primary key default gen_random_uuid(),
  generador_id uuid not null references public.generadores (id) on delete restrict,
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  fecha date not null default current_date,
  cantidad numeric(12, 2) not null,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint generador_avances_cantidad_positiva check (cantidad > 0)
);

create index if not exists generador_avances_proyecto_fecha_idx
  on public.generador_avances (proyecto_id, fecha desc);

create index if not exists generador_avances_generador_idx
  on public.generador_avances (generador_id);

drop trigger if exists generadores_actualizado on public.generadores;
create trigger generadores_actualizado
before update on public.generadores
for each row execute function public.marcar_actualizado();

drop trigger if exists generador_avances_actualizado on public.generador_avances;
create trigger generador_avances_actualizado
before update on public.generador_avances
for each row execute function public.marcar_actualizado();

create or replace function public.fijar_generador_avance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
  v_cantidad numeric(12, 2);
  v_ejecutado numeric(12, 2);
begin
  select g.proyecto_id, g.cantidad
    into v_proyecto, v_cantidad
  from public.generadores g
  where g.id = new.generador_id
    and g.activo;

  if v_proyecto is null then
    raise exception 'El generador no existe o está inactivo'
      using errcode = '23503';
  end if;

  select coalesce(sum(a.cantidad), 0)
    into v_ejecutado
  from public.generador_avances a
  where a.generador_id = new.generador_id
    and a.id <> new.id;

  if v_ejecutado + new.cantidad > v_cantidad + 0.005 then
    raise exception 'El avance excede la cantidad contratada del generador'
      using errcode = '23514';
  end if;

  new.proyecto_id := v_proyecto;

  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists generador_avances_proyecto on public.generador_avances;
create trigger generador_avances_proyecto
before insert or update on public.generador_avances
for each row execute function public.fijar_generador_avance();

alter table public.generadores enable row level security;
alter table public.generador_avances enable row level security;

revoke all on public.generadores from anon;
revoke all on public.generador_avances from anon;
grant select, insert, update, delete on public.generadores to authenticated;
grant select, insert, update, delete on public.generador_avances to authenticated;

drop policy if exists generadores_select on public.generadores;
create policy generadores_select on public.generadores
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('generadores', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generadores_insert on public.generadores;
create policy generadores_insert on public.generadores
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generadores_update on public.generadores;
create policy generadores_update on public.generadores
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generadores_delete on public.generadores;
create policy generadores_delete on public.generadores
for delete to authenticated
using (public.es_admin());

drop policy if exists generador_avances_select on public.generador_avances;
create policy generador_avances_select on public.generador_avances
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('generadores', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generador_avances_insert on public.generador_avances;
create policy generador_avances_insert on public.generador_avances
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists generador_avances_update on public.generador_avances;
create policy generador_avances_update on public.generador_avances
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generador_avances_delete on public.generador_avances;
create policy generador_avances_delete on public.generador_avances
for delete to authenticated
using (public.es_admin());

revoke all on function public.fijar_generador_avance() from public, anon;
grant execute on function public.fijar_generador_avance() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.generadores) as generadores,
  (select count(*) from public.generador_avances) as avances;
