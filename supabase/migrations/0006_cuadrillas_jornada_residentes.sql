-- =============================================================================
-- espacioSM Obra · Cuadrillas y jornada del residente
-- Archivo: supabase/migrations/0006_cuadrillas_jornada_residentes.sql
--
-- Ejecutar después de 0005.
--
-- Cambios:
--   1. Cada empleado guarda quién lo dio de alta (creado_por).
--   2. El residente administra solo su cuadrilla; permiso medio queda en consulta.
--   3. La asistencia de trabajadores también queda limitada a la cuadrilla.
--   4. Nueva tabla asistencia_residentes para la entrada/salida del residente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Autor de cada empleado
-- -----------------------------------------------------------------------------

alter table public.empleados
  add column if not exists creado_por uuid references public.perfiles (id) default auth.uid();

create index if not exists empleados_creado_por_idx
  on public.empleados (creado_por);

-- -----------------------------------------------------------------------------
-- 2. Matriz: residente administra su cuadrilla; permiso medio solo consulta
-- -----------------------------------------------------------------------------

update public.rol_permisos
set permitido = true
where rol = 'residente'
  and modulo = 'personal'
  and accion in ('ver', 'crear', 'editar');

update public.rol_permisos
set permitido = false
where rol = 'permiso_medio'
  and modulo = 'personal'
  and accion in ('crear', 'editar');

-- -----------------------------------------------------------------------------
-- 3. Empleados: aislamiento por cuadrilla
-- -----------------------------------------------------------------------------

drop policy if exists empleados_select on public.empleados;

create policy empleados_select on public.empleados
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or creado_por = auth.uid()
    )
  )
);

drop policy if exists empleados_insert on public.empleados;

create policy empleados_insert on public.empleados
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('personal', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or creado_por = auth.uid()
    )
  )
);

drop policy if exists empleados_update on public.empleados;

create policy empleados_update on public.empleados
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or creado_por = auth.uid()
    )
  )
)
with check (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or creado_por = auth.uid()
    )
  )
);

-- -----------------------------------------------------------------------------
-- 4. Asistencia de trabajadores: solo la cuadrilla del residente
-- -----------------------------------------------------------------------------

drop policy if exists asistencia_select on public.asistencia;

create policy asistencia_select on public.asistencia
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or exists (
        select 1
        from public.empleados e
        where e.id = empleado_id
          and e.creado_por = auth.uid()
      )
    )
  )
);

drop policy if exists asistencia_insert on public.asistencia;

create policy asistencia_insert on public.asistencia
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
    and (
      public.rol_actual() <> 'residente'
      or exists (
        select 1
        from public.empleados e
        where e.id = empleado_id
          and e.creado_por = auth.uid()
      )
    )
  )
);

drop policy if exists asistencia_update on public.asistencia;

create policy asistencia_update on public.asistencia
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or exists (
        select 1
        from public.empleados e
        where e.id = empleado_id
          and e.creado_por = auth.uid()
      )
    )
  )
)
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or exists (
        select 1
        from public.empleados e
        where e.id = empleado_id
          and e.creado_por = auth.uid()
      )
    )
  )
);

-- -----------------------------------------------------------------------------
-- 5. Funciones de directorio y conteo por cuadrilla
-- -----------------------------------------------------------------------------

create or replace function public.empleados_de_proyecto(p_proyecto_id uuid)
returns table (
  id uuid,
  nombre text,
  puesto text,
  activo boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin acceso a la obra' using errcode = '42501';
  end if;

  if not (
    public.puede('asistencia', 'ver')
    or public.puede('personal', 'ver')
  ) then
    raise exception 'Sin permiso para consultar personal' using errcode = '42501';
  end if;

  if public.rol_actual() = 'residente' then
    return query
      select e.id, e.nombre, e.puesto, e.activo
      from public.empleados e
      where e.proyecto_id = p_proyecto_id
        and e.creado_por = auth.uid()
      order by e.nombre;
  else
    return query
      select e.id, e.nombre, e.puesto, e.activo
      from public.empleados e
      where e.proyecto_id = p_proyecto_id
      order by e.nombre;
  end if;
end;
$$;

create or replace function public.conteo_personal_por_proyecto()
returns table (proyecto_id uuid, activos integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.proyecto_id, count(*)::integer as activos
  from public.empleados e
  where e.activo
    and public.tiene_acceso_proyecto(e.proyecto_id)
    and (
      public.puede('asistencia', 'ver')
      or public.puede('personal', 'ver')
    )
    and (
      public.rol_actual() <> 'residente'
      or e.creado_por = auth.uid()
    )
  group by e.proyecto_id;
$$;

-- -----------------------------------------------------------------------------
-- 6. Jornada del residente
-- -----------------------------------------------------------------------------

create table if not exists public.asistencia_residentes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  proyecto_id uuid not null references public.proyectos (id) on delete restrict,
  fecha date not null default current_date,
  hora_entrada time,
  hora_salida time,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint asistencia_residentes_una_por_dia unique (usuario_id, fecha),
  constraint asistencia_residentes_horas_coherentes
    check (
      hora_entrada is null
      or hora_salida is null
      or hora_salida > hora_entrada
    )
);

create index if not exists asistencia_residentes_proyecto_fecha_idx
  on public.asistencia_residentes (proyecto_id, fecha);

create trigger asistencia_residentes_actualizado
before update on public.asistencia_residentes
for each row execute function public.marcar_actualizado();

alter table public.asistencia_residentes enable row level security;

revoke all on public.asistencia_residentes from anon;
grant select, insert, update, delete on public.asistencia_residentes to authenticated;

create policy asistencia_residentes_select on public.asistencia_residentes
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy asistencia_residentes_insert on public.asistencia_residentes
for insert to authenticated
with check (
  usuario_id = auth.uid()
  and public.tiene_acceso_proyecto(proyecto_id)
);

create policy asistencia_residentes_update on public.asistencia_residentes
for update to authenticated
using (
  public.es_admin()
  or usuario_id = auth.uid()
)
with check (
  public.es_admin()
  or usuario_id = auth.uid()
);

create policy asistencia_residentes_delete on public.asistencia_residentes
for delete to authenticated
using (public.es_admin());

create or replace function public.sellar_asistencia_residente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_ahora time := (now() at time zone 'America/Mexico_City')::time;
begin
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.usuario_id := auth.uid();
    new.fecha := v_hoy;
    new.hora_entrada := v_ahora;
    new.hora_salida := null;
  else
    if new.usuario_id is distinct from old.usuario_id
       or new.fecha is distinct from old.fecha then
      raise exception 'No puedes cambiar el residente ni la fecha'
        using errcode = '42501';
    end if;

    if new.hora_entrada is distinct from old.hora_entrada then
      raise exception 'La hora de entrada no se modifica'
        using errcode = '42501';
    end if;

    if old.hora_salida is not null
       and new.hora_salida is distinct from old.hora_salida then
      raise exception 'La jornada ya está cerrada'
        using errcode = '42501';
    end if;

    if new.hora_salida is not null then
      new.hora_salida := v_ahora;
    end if;
  end if;

  new.registrado_por := auth.uid();

  if new.fecha > v_hoy then
    raise exception 'La fecha no puede ser futura' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists asistencia_residentes_sellar on public.asistencia_residentes;

create trigger asistencia_residentes_sellar
before insert or update on public.asistencia_residentes
for each row execute function public.sellar_asistencia_residente();

-- -----------------------------------------------------------------------------
-- 7. Consulta de residentes en obra para administración y permiso medio
-- -----------------------------------------------------------------------------

create or replace function public.residentes_en_obra(p_fecha date)
returns table (
  usuario_id uuid,
  nombre text,
  email text,
  proyecto_id uuid,
  proyecto_nombre text,
  hora_entrada time,
  hora_salida time
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.usuario_id,
    p.nombre,
    p.email,
    a.proyecto_id,
    pr.nombre,
    a.hora_entrada,
    a.hora_salida
  from public.asistencia_residentes a
  join public.perfiles p on p.id = a.usuario_id
  join public.proyectos pr on pr.id = a.proyecto_id
  where a.fecha = p_fecha
    and (
      public.es_admin()
      or (
        public.rol_actual() = 'permiso_medio'
        and public.tiene_acceso_proyecto(a.proyecto_id)
      )
      or a.usuario_id = auth.uid()
    )
  order by a.hora_entrada desc nulls last;
$$;

revoke all on function public.empleados_de_proyecto(uuid) from public, anon;
revoke all on function public.conteo_personal_por_proyecto() from public, anon;
revoke all on function public.residentes_en_obra(date) from public, anon;
revoke all on function public.sellar_asistencia_residente() from public, anon;

grant execute on function public.empleados_de_proyecto(uuid) to authenticated;
grant execute on function public.conteo_personal_por_proyecto() to authenticated;
grant execute on function public.residentes_en_obra(date) to authenticated;
grant execute on function public.sellar_asistencia_residente() to authenticated;

-- -----------------------------------------------------------------------------
-- 8. Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.rol_permisos
   where rol = 'residente' and modulo = 'personal' and permitido) as permisos_personal_residente,
  (select count(*) from public.rol_permisos
   where rol = 'permiso_medio' and modulo = 'personal' and accion in ('crear','editar') and permitido) as permisos_escritura_oficina;
