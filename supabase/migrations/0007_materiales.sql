-- =============================================================================
-- espacioSM Obra · Materiales
-- Archivo: supabase/migrations/0007_materiales.sql
--
-- Ejecutar después de 0006.
--
-- Catálogo de materiales por obra y movimientos de entrada/salida. El stock
-- se calcula como entradas menos salidas; no se guarda duplicado.
-- =============================================================================

do $$
begin
  create type public.tipo_movimiento_material as enum ('entrada', 'salida');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.materiales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  nombre text not null,
  unidad text not null default 'pieza',
  costo_unitario numeric(12, 2) not null default 0,
  stock_minimo numeric(12, 2) not null default 0,
  activo boolean not null default true,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint materiales_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint materiales_unidad_no_vacia check (btrim(unidad) <> ''),
  constraint materiales_costo_no_negativo check (costo_unitario >= 0),
  constraint materiales_minimo_no_negativo check (stock_minimo >= 0),
  constraint materiales_proyecto_nombre_unidad unique (proyecto_id, nombre, unidad)
);

create index if not exists materiales_proyecto_idx
  on public.materiales (proyecto_id);

create table if not exists public.material_movimientos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales (id) on delete restrict,
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  tipo public.tipo_movimiento_material not null,
  fecha date not null default current_date,
  cantidad numeric(12, 2) not null,
  costo_unitario numeric(12, 2) not null default 0,
  proveedor text,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint material_movimientos_cantidad_positiva check (cantidad > 0),
  constraint material_movimientos_costo_no_negativo check (costo_unitario >= 0)
);

create index if not exists material_movimientos_proyecto_fecha_idx
  on public.material_movimientos (proyecto_id, fecha desc);

create index if not exists material_movimientos_material_idx
  on public.material_movimientos (material_id);

drop trigger if exists materiales_actualizado on public.materiales;
create trigger materiales_actualizado
before update on public.materiales
for each row execute function public.marcar_actualizado();

drop trigger if exists material_movimientos_actualizado on public.material_movimientos;
create trigger material_movimientos_actualizado
before update on public.material_movimientos
for each row execute function public.marcar_actualizado();

-- El proyecto del movimiento siempre se toma del material. Así no puede
-- quedar un movimiento ligado a una obra distinta del catálogo.
create or replace function public.fijar_proyecto_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
begin
  select m.proyecto_id into v_proyecto
  from public.materiales m
  where m.id = new.material_id
    and m.activo;

  if v_proyecto is null then
    raise exception 'El material no existe o está inactivo'
      using errcode = '23503';
  end if;

  new.proyecto_id := v_proyecto;

  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists material_movimientos_proyecto on public.material_movimientos;
create trigger material_movimientos_proyecto
before insert or update on public.material_movimientos
for each row execute function public.fijar_proyecto_material();

alter table public.materiales enable row level security;
alter table public.material_movimientos enable row level security;

revoke all on public.materiales from anon;
revoke all on public.material_movimientos from anon;
grant select, insert, update, delete on public.materiales to authenticated;
grant select, insert, update, delete on public.material_movimientos to authenticated;

drop policy if exists materiales_select on public.materiales;
create policy materiales_select on public.materiales
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('materiales', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists materiales_insert on public.materiales;
create policy materiales_insert on public.materiales
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('materiales', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists materiales_update on public.materiales;
create policy materiales_update on public.materiales
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('materiales', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('materiales', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists materiales_delete on public.materiales;
create policy materiales_delete on public.materiales
for delete to authenticated
using (public.es_admin());

drop policy if exists material_movimientos_select on public.material_movimientos;
create policy material_movimientos_select on public.material_movimientos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('materiales', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists material_movimientos_insert on public.material_movimientos;
create policy material_movimientos_insert on public.material_movimientos
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('materiales', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists material_movimientos_update on public.material_movimientos;
create policy material_movimientos_update on public.material_movimientos
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('materiales', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('materiales', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists material_movimientos_delete on public.material_movimientos;
create policy material_movimientos_delete on public.material_movimientos
for delete to authenticated
using (public.es_admin());

revoke all on function public.fijar_proyecto_material() from public, anon;
grant execute on function public.fijar_proyecto_material() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.materiales) as materiales,
  (select count(*) from public.material_movimientos) as movimientos;
