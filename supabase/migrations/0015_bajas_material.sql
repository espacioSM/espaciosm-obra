-- =============================================================================
-- espacioSM Obra · Bajas de material y corrección de inventario
-- Archivo: supabase/migrations/0015_bajas_material.sql
--
-- Ejecutar después de 0014.
--
-- El residente solicita la baja de un material; administración o permiso medio
-- la aprueba o rechaza. La edición directa de materiales y movimientos queda
-- para administración y permiso medio por las políticas existentes.
-- =============================================================================

do $$
begin
  create type public.estado_baja_material as enum ('pendiente', 'aprobada', 'rechazada');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.bajas_material (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiales (id) on delete cascade,
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  solicitado_por uuid not null references public.perfiles (id) default auth.uid(),
  motivo text,
  estado public.estado_baja_material not null default 'pendiente',
  respuesta text,
  respondido_por uuid references public.perfiles (id),
  respondido_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists bajas_material_pendiente_idx
  on public.bajas_material (material_id)
  where estado = 'pendiente';

-- Permite corregir movimientos de materiales ya dados de baja.
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
  where m.id = new.material_id;

  if v_proyecto is null then
    raise exception 'El material no existe' using errcode = '23503';
  end if;

  new.proyecto_id := v_proyecto;

  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  return new;
end;
$$;

create index if not exists bajas_material_proyecto_idx
  on public.bajas_material (proyecto_id, estado, creado_en desc);

drop trigger if exists bajas_material_actualizado on public.bajas_material;
create trigger bajas_material_actualizado
before update on public.bajas_material
for each row execute function public.marcar_actualizado();

create or replace function public.sellar_baja_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.solicitado_por := auth.uid();
    new.estado := 'pendiente';
    new.respuesta := null;
    new.respondido_por := null;
    new.respondido_en := null;
  else
    if new.material_id is distinct from old.material_id
       or new.proyecto_id is distinct from old.proyecto_id
       or new.solicitado_por is distinct from old.solicitado_por then
      raise exception 'No puedes cambiar el material, la obra ni el solicitante'
        using errcode = '42501';
    end if;

    if new.estado is distinct from old.estado then
      new.respondido_por := auth.uid();
      new.respondido_en := now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bajas_material_sellar on public.bajas_material;
create trigger bajas_material_sellar
before insert or update on public.bajas_material
for each row execute function public.sellar_baja_material();

alter table public.bajas_material enable row level security;

revoke all on public.bajas_material from anon;
revoke insert, update, delete on public.bajas_material from authenticated;
grant select on public.bajas_material to authenticated;

drop policy if exists bajas_material_select on public.bajas_material;
create policy bajas_material_select on public.bajas_material
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('materiales', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or solicitado_por = auth.uid()
    )
  )
);

create or replace function public.solicitar_baja_material(
  p_material_id uuid,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
  v_activo boolean;
  v_id uuid;
begin
  select m.proyecto_id, m.activo
    into v_proyecto, v_activo
  from public.materiales m
  where m.id = p_material_id;

  if v_proyecto is null then
    raise exception 'El material no existe' using errcode = '23503';
  end if;

  if not public.tiene_acceso_proyecto(v_proyecto) then
    raise exception 'Sin acceso a la obra' using errcode = '42501';
  end if;

  if not public.puede('materiales', 'ver') then
    raise exception 'Sin permiso para consultar materiales' using errcode = '42501';
  end if;

  if not coalesce(v_activo, false) then
    raise exception 'El material ya está dado de baja' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.bajas_material b
    where b.material_id = p_material_id and b.estado = 'pendiente'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este material'
      using errcode = '23505';
  end if;

  insert into public.bajas_material (material_id, proyecto_id, motivo)
  values (p_material_id, v_proyecto, nullif(btrim(p_motivo), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.listar_bajas_material(p_proyecto_id uuid)
returns table (
  id uuid,
  material_id uuid,
  material_nombre text,
  proyecto_id uuid,
  solicitado_por uuid,
  solicitante_nombre text,
  solicitante_email text,
  motivo text,
  estado public.estado_baja_material,
  respuesta text,
  creado_en timestamptz,
  respondido_en timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    b.id,
    b.material_id,
    m.nombre,
    b.proyecto_id,
    b.solicitado_por,
    p.nombre,
    p.email,
    b.motivo,
    b.estado,
    b.respuesta,
    b.creado_en,
    b.respondido_en
  from public.bajas_material b
  join public.materiales m on m.id = b.material_id
  join public.perfiles p on p.id = b.solicitado_por
  where b.proyecto_id = p_proyecto_id
    and public.tiene_acceso_proyecto(p_proyecto_id)
    and public.puede('materiales', 'ver')
    and (
      public.rol_actual() <> 'residente'
      or b.solicitado_por = auth.uid()
    )
  order by
    case b.estado when 'pendiente' then 0 else 1 end,
    b.creado_en desc;
$$;

create or replace function public.responder_baja_material(
  p_baja_id uuid,
  p_estado public.estado_baja_material,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_material uuid;
  v_proyecto uuid;
  v_estado public.estado_baja_material;
begin
  if not public.puede('materiales', 'editar') then
    raise exception 'Tu rol no puede responder bajas de material'
      using errcode = '42501';
  end if;

  if p_estado not in ('aprobada', 'rechazada') then
    raise exception 'Estado de baja no válido' using errcode = '23514';
  end if;

  select b.material_id, b.proyecto_id, b.estado
    into v_material, v_proyecto, v_estado
  from public.bajas_material b
  where b.id = p_baja_id;

  if v_proyecto is null or not public.tiene_acceso_proyecto(v_proyecto) then
    raise exception 'Sin acceso a la solicitud' using errcode = '42501';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'La solicitud ya fue respondida' using errcode = '23514';
  end if;

  update public.bajas_material
  set estado = p_estado,
      respuesta = nullif(btrim(p_respuesta), ''),
      respondido_por = auth.uid(),
      respondido_en = now()
  where id = p_baja_id;

  if p_estado = 'aprobada' then
    update public.materiales
    set activo = false
    where id = v_material;
  end if;
end;
$$;

revoke all on function public.solicitar_baja_material(uuid, text) from public, anon;
revoke all on function public.listar_bajas_material(uuid) from public, anon;
revoke all on function public.responder_baja_material(uuid, public.estado_baja_material, text)
  from public, anon;
revoke all on function public.sellar_baja_material() from public, anon;

grant execute on function public.solicitar_baja_material(uuid, text) to authenticated;
grant execute on function public.listar_bajas_material(uuid) to authenticated;
grant execute on function public.responder_baja_material(uuid, public.estado_baja_material, text)
  to authenticated;
grant execute on function public.sellar_baja_material() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as bajas from public.bajas_material;
