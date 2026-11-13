-- =============================================================================
-- espacioSM Obra · Baja parcial de material
-- Archivo: supabase/migrations/0016_baja_cantidad.sql
--
-- Ejecutar después de 0015.
--
-- La baja ya no desactiva el material. Se registra una salida por la cantidad
-- dada de baja, con motivo, y queda en el historial como movimiento de baja.
-- =============================================================================

alter table public.bajas_material
  add column if not exists cantidad numeric(12, 2);

alter table public.bajas_material
  drop constraint if exists bajas_material_cantidad_positiva;

alter table public.bajas_material
  add constraint bajas_material_cantidad_positiva
  check (cantidad is null or cantidad > 0);

alter table public.material_movimientos
  add column if not exists es_baja boolean not null default false;

alter table public.material_movimientos
  add column if not exists baja_id uuid references public.bajas_material (id) on delete set null;

create unique index if not exists material_movimientos_baja_idx
  on public.material_movimientos (baja_id)
  where baja_id is not null;

-- Reactiva materiales que la versión anterior desactivó al aprobar una baja.
update public.materiales m
set activo = true
where exists (
  select 1
  from public.bajas_material b
  where b.material_id = m.id
    and b.estado = 'aprobada'
);

drop function if exists public.solicitar_baja_material(uuid, text);

create or replace function public.solicitar_baja_material(
  p_material_id uuid,
  p_motivo text,
  p_cantidad numeric
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proyecto uuid;
  v_activo boolean;
  v_stock numeric(12, 2);
  v_id uuid;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    raise exception 'La cantidad de baja debe ser mayor que cero'
      using errcode = '23514';
  end if;

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
    raise exception 'El material está inactivo' using errcode = '23514';
  end if;

  select coalesce(sum(
    case when mm.tipo = 'entrada' then mm.cantidad else -mm.cantidad end
  ), 0)
    into v_stock
  from public.material_movimientos mm
  where mm.material_id = p_material_id;

  if p_cantidad > v_stock + 0.005 then
    raise exception 'La cantidad de baja supera el inventario disponible'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.bajas_material b
    where b.material_id = p_material_id and b.estado = 'pendiente'
  ) then
    raise exception 'Ya existe una solicitud pendiente para este material'
      using errcode = '23505';
  end if;

  insert into public.bajas_material (material_id, proyecto_id, motivo, cantidad)
  values (p_material_id, v_proyecto, nullif(btrim(p_motivo), ''), round(p_cantidad, 2))
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.listar_bajas_material(uuid);

create function public.listar_bajas_material(p_proyecto_id uuid)
returns table (
  id uuid,
  material_id uuid,
  material_nombre text,
  proyecto_id uuid,
  solicitado_por uuid,
  solicitante_nombre text,
  solicitante_email text,
  motivo text,
  cantidad numeric,
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
    b.cantidad,
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
  v_cantidad numeric(12, 2);
  v_stock numeric(12, 2);
  v_costo numeric(12, 2);
  v_motivo text;
begin
  if not public.puede('materiales', 'editar') then
    raise exception 'Tu rol no puede responder bajas de material'
      using errcode = '42501';
  end if;

  if p_estado not in ('aprobada', 'rechazada') then
    raise exception 'Estado de baja no válido' using errcode = '23514';
  end if;

  select b.material_id, b.proyecto_id, b.estado, b.cantidad, b.motivo
    into v_material, v_proyecto, v_estado, v_cantidad, v_motivo
  from public.bajas_material b
  where b.id = p_baja_id;

  if v_proyecto is null or not public.tiene_acceso_proyecto(v_proyecto) then
    raise exception 'Sin acceso a la solicitud' using errcode = '42501';
  end if;

  if v_estado <> 'pendiente' then
    raise exception 'La solicitud ya fue respondida' using errcode = '23514';
  end if;

  if p_estado = 'aprobada' then
    select coalesce(sum(
      case when mm.tipo = 'entrada' then mm.cantidad else -mm.cantidad end
    ), 0)
      into v_stock
    from public.material_movimientos mm
    where mm.material_id = v_material;

    if coalesce(v_cantidad, 0) > v_stock + 0.005 then
      raise exception 'La cantidad de baja supera el inventario disponible'
        using errcode = '23514';
    end if;

    select coalesce(m.ultimo_precio, m.costo_unitario, 0)
      into v_costo
    from public.materiales m
    where m.id = v_material;

    insert into public.material_movimientos
      (material_id, proyecto_id, tipo, fecha, cantidad, costo_unitario,
       descripcion, nota, registrado_por, es_baja, baja_id)
    values
      (v_material, v_proyecto, 'salida', current_date, v_cantidad, v_costo,
       'Baja de material', nullif(btrim(concat_ws(' · ', v_motivo, p_respuesta)), ''),
       auth.uid(), true, p_baja_id);
  end if;

  update public.bajas_material
  set estado = p_estado,
      respuesta = nullif(btrim(p_respuesta), ''),
      respondido_por = auth.uid(),
      respondido_en = now()
  where id = p_baja_id;
end;
$$;

revoke all on function public.solicitar_baja_material(uuid, text, numeric) from public, anon;
revoke all on function public.listar_bajas_material(uuid) from public, anon;
revoke all on function public.responder_baja_material(uuid, public.estado_baja_material, text)
  from public, anon;

grant execute on function public.solicitar_baja_material(uuid, text, numeric) to authenticated;
grant execute on function public.listar_bajas_material(uuid) to authenticated;
grant execute on function public.responder_baja_material(uuid, public.estado_baja_material, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as bajas from public.bajas_material;
