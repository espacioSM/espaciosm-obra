-- =============================================================================
-- espacioSM Obra · Solicitudes de recursos
-- Archivo: supabase/migrations/0010_solicitudes.sql
--
-- Ejecutar después de 0009.
--
-- El residente solicita material, personal o equipo. Administración y permiso
-- medio responden con aprobación, rechazo o atención.
-- =============================================================================

do $$
begin
  create type public.tipo_solicitud as enum ('material', 'personal', 'equipo', 'otro');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.prioridad_solicitud as enum ('baja', 'media', 'alta');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.estado_solicitud as enum (
    'pendiente', 'aprobada', 'rechazada', 'atendida'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.solicitudes_recursos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  solicitado_por uuid not null references public.perfiles (id) default auth.uid(),
  tipo public.tipo_solicitud not null default 'material',
  descripcion text not null,
  cantidad numeric(12, 2),
  unidad text,
  prioridad public.prioridad_solicitud not null default 'media',
  fecha_requerida date,
  notas text,
  estado public.estado_solicitud not null default 'pendiente',
  respuesta text,
  respondido_por uuid references public.perfiles (id),
  respondido_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint solicitudes_descripcion_no_vacia check (btrim(descripcion) <> ''),
  constraint solicitudes_cantidad_positiva check (cantidad is null or cantidad > 0)
);

create index if not exists solicitudes_proyecto_estado_idx
  on public.solicitudes_recursos (proyecto_id, estado, creado_en desc);

create index if not exists solicitudes_solicitante_idx
  on public.solicitudes_recursos (solicitado_por);

drop trigger if exists solicitudes_actualizado on public.solicitudes_recursos;
create trigger solicitudes_actualizado
before update on public.solicitudes_recursos
for each row execute function public.marcar_actualizado();

create or replace function public.sellar_solicitud()
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
    if new.solicitado_por is distinct from old.solicitado_por
       or new.proyecto_id is distinct from old.proyecto_id then
      raise exception 'No puedes cambiar el solicitante ni la obra'
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

drop trigger if exists solicitudes_sellar on public.solicitudes_recursos;
create trigger solicitudes_sellar
before insert or update on public.solicitudes_recursos
for each row execute function public.sellar_solicitud();

alter table public.solicitudes_recursos enable row level security;

revoke all on public.solicitudes_recursos from anon;
grant select, insert, update, delete on public.solicitudes_recursos to authenticated;

drop policy if exists solicitudes_select on public.solicitudes_recursos;
create policy solicitudes_select on public.solicitudes_recursos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('solicitudes', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or solicitado_por = auth.uid()
    )
  )
);

drop policy if exists solicitudes_insert on public.solicitudes_recursos;
create policy solicitudes_insert on public.solicitudes_recursos
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('solicitudes', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and solicitado_por = auth.uid()
  )
);

drop policy if exists solicitudes_update on public.solicitudes_recursos;
create policy solicitudes_update on public.solicitudes_recursos
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('solicitudes', 'aprobar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('solicitudes', 'aprobar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists solicitudes_delete on public.solicitudes_recursos;
create policy solicitudes_delete on public.solicitudes_recursos
for delete to authenticated
using (public.es_admin());

-- Lista con nombre del solicitante, sin exponer perfiles completos.
create or replace function public.listar_solicitudes(p_proyecto_id uuid)
returns table (
  id uuid,
  proyecto_id uuid,
  solicitado_por uuid,
  solicitante_nombre text,
  solicitante_email text,
  tipo public.tipo_solicitud,
  descripcion text,
  cantidad numeric,
  unidad text,
  prioridad public.prioridad_solicitud,
  fecha_requerida date,
  notas text,
  estado public.estado_solicitud,
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
    s.id,
    s.proyecto_id,
    s.solicitado_por,
    p.nombre,
    p.email,
    s.tipo,
    s.descripcion,
    s.cantidad,
    s.unidad,
    s.prioridad,
    s.fecha_requerida,
    s.notas,
    s.estado,
    s.respuesta,
    s.creado_en,
    s.respondido_en
  from public.solicitudes_recursos s
  join public.perfiles p on p.id = s.solicitado_por
  where s.proyecto_id = p_proyecto_id
    and public.tiene_acceso_proyecto(p_proyecto_id)
    and public.puede('solicitudes', 'ver')
    and (
      public.rol_actual() <> 'residente'
      or s.solicitado_por = auth.uid()
    )
  order by
    case s.estado when 'pendiente' then 0 else 1 end,
    s.creado_en desc;
$$;

create or replace function public.responder_solicitud(
  p_solicitud_id uuid,
  p_estado public.estado_solicitud,
  p_respuesta text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
begin
  if not public.puede('solicitudes', 'aprobar') then
    raise exception 'Tu rol no puede responder solicitudes'
      using errcode = '42501';
  end if;

  if p_estado not in ('aprobada', 'rechazada', 'atendida') then
    raise exception 'Estado de respuesta no válido' using errcode = '23514';
  end if;

  select s.proyecto_id into v_proyecto
  from public.solicitudes_recursos s
  where s.id = p_solicitud_id;

  if v_proyecto is null or not public.tiene_acceso_proyecto(v_proyecto) then
    raise exception 'Sin acceso a la solicitud' using errcode = '42501';
  end if;

  update public.solicitudes_recursos
  set estado = p_estado,
      respuesta = nullif(btrim(p_respuesta), ''),
      respondido_por = auth.uid(),
      respondido_en = now()
  where id = p_solicitud_id;
end;
$$;

revoke all on function public.listar_solicitudes(uuid) from public, anon;
revoke all on function public.responder_solicitud(uuid, public.estado_solicitud, text)
  from public, anon;
revoke all on function public.sellar_solicitud() from public, anon;
grant execute on function public.listar_solicitudes(uuid) to authenticated;
grant execute on function public.responder_solicitud(uuid, public.estado_solicitud, text)
  to authenticated;
grant execute on function public.sellar_solicitud() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as solicitudes from public.solicitudes_recursos;
