-- =============================================================================
-- espacioSM Obra · Sprint 1 · Esquema base
-- Archivo: supabase/migrations/0001_esquema_sprint1.sql
--
-- Ejecutar en Supabase: Dashboard > SQL Editor > New query > pegar > Run.
-- Orden obligatorio: 0001, 0002, 0003.
--
-- Alcance: perfiles (roles), proyectos, miembros de proyecto, empleados,
-- asistencia y matriz de permisos por rol/módulo/acción.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------

create type public.rol_usuario as enum ('admin', 'permiso_medio', 'residente');

create type public.estado_proyecto as enum (
  'planeado',
  'en_ejecucion',
  'pausado',
  'terminado'
);

create type public.periodo_pago as enum (
  'mensual',
  'quincenal',
  'semanal',
  'diario',
  'por_hora'
);

create type public.modulo_sistema as enum (
  'proyectos',
  'personal',
  'asistencia',
  'materiales',
  'generadores',
  'estimaciones',
  'solicitudes',
  'pagos',
  'bitacora',
  'reportes'
);

create type public.accion_sistema as enum (
  'ver',
  'crear',
  'editar',
  'aprobar',
  'eliminar'
);

-- -----------------------------------------------------------------------------
-- 2. Utilidades
-- -----------------------------------------------------------------------------

-- Sella la fecha de modificación en cada UPDATE.
create function public.marcar_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Perfiles (espejo de auth.users)
--
-- Supabase Auth guarda correo y contraseña. Aquí solo viven los datos de
-- negocio: nombre, rol y si la cuenta está habilitada.
-- -----------------------------------------------------------------------------

create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text,
  rol public.rol_usuario not null default 'residente',
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos de negocio de cada usuario. El alta la crea un trigger desde auth.users.';
comment on column public.perfiles.rol is
  'admin = control total; permiso_medio = operación según matriz; residente = captura en campo.';

create trigger perfiles_actualizado
before update on public.perfiles
for each row execute function public.marcar_actualizado();

-- Alta automática del perfil cuando se crea un usuario en Supabase Auth.
-- El rol inicial siempre es residente; un admin lo cambia después desde la app.
create function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.perfiles (id, email, nombre)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.crear_perfil_nuevo_usuario();

-- Mantiene el correo sincronizado si se cambia desde Supabase Auth.
create function public.sincronizar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.perfiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.sincronizar_email_usuario();

-- -----------------------------------------------------------------------------
-- 4. Proyectos y su equipo
-- -----------------------------------------------------------------------------

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  ubicacion text,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  estado public.estado_proyecto not null default 'planeado',
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint proyectos_fechas_coherentes
    check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

comment on table public.proyectos is
  'Obras activas. Un residente solo ve los proyectos donde está dado de alta como miembro.';

create trigger proyectos_actualizado
before update on public.proyectos
for each row execute function public.marcar_actualizado();

-- Asignación de usuarios a proyectos. Es la base del aislamiento por obra:
-- sin fila aquí, un usuario que no sea admin no ve el proyecto ni sus datos.
create table public.proyecto_miembros (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (proyecto_id, usuario_id)
);

comment on table public.proyecto_miembros is
  'Equipo asignado a cada obra. Lo administra el rol admin.';

-- -----------------------------------------------------------------------------
-- 5. Empleados
-- -----------------------------------------------------------------------------

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete restrict,
  nombre text not null check (length(trim(nombre)) > 0),
  puesto text,
  sueldo numeric(12, 2) not null default 0 check (sueldo >= 0),
  periodo_pago public.periodo_pago not null default 'diario',
  fecha_ingreso date not null default current_date,
  fecha_baja date,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint empleados_fechas_coherentes
    check (fecha_baja is null or fecha_baja >= fecha_ingreso),
  -- Permite que asistencia valide que el empleado pertenece al mismo proyecto.
  constraint empleados_id_proyecto_unico unique (id, proyecto_id)
);

comment on column public.empleados.sueldo is
  'Importe en pesos según periodo_pago. No incluye prestaciones.';
comment on column public.empleados.activo is
  'Baja lógica: conserva historial de asistencia. No se recomienda borrar empleados.';

create index empleados_proyecto_idx on public.empleados (proyecto_id);
create index empleados_activos_idx on public.empleados (proyecto_id) where activo;

create trigger empleados_actualizado
before update on public.empleados
for each row execute function public.marcar_actualizado();

-- -----------------------------------------------------------------------------
-- 6. Asistencia
-- -----------------------------------------------------------------------------

create table public.asistencia (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null,
  proyecto_id uuid not null references public.proyectos (id) on delete restrict,
  fecha date not null default current_date,
  hora_entrada time,
  hora_salida time,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  -- El empleado debe existir y pertenecer al proyecto indicado.
  constraint asistencia_empleado_proyecto_fk
    foreign key (empleado_id, proyecto_id)
    references public.empleados (id, proyecto_id)
    on delete restrict,
  constraint asistencia_una_por_dia unique (empleado_id, fecha),
  constraint asistencia_horas_coherentes
    check (
      hora_entrada is null
      or hora_salida is null
      or hora_salida > hora_entrada
    )
);

comment on table public.asistencia is
  'Un registro por empleado y día. La ausencia se representa con la falta de fila.';
comment on column public.asistencia.registrado_por is
  'Último usuario que capturó o corrigió el registro.';

create index asistencia_proyecto_fecha_idx on public.asistencia (proyecto_id, fecha);
create index asistencia_empleado_idx on public.asistencia (empleado_id, proyecto_id);

create trigger asistencia_actualizado
before update on public.asistencia
for each row execute function public.marcar_actualizado();

-- -----------------------------------------------------------------------------
-- 7. Matriz de permisos
--
-- El rol admin siempre puede todo (se valida en la función puede()).
-- Los otros roles se configuran con filas en esta tabla: así se ajusta el
-- alcance del rol intermedio con un UPDATE, sin tocar código ni redesplegar.
-- -----------------------------------------------------------------------------

create table public.rol_permisos (
  rol public.rol_usuario not null,
  modulo public.modulo_sistema not null,
  accion public.accion_sistema not null,
  permitido boolean not null default false,
  primary key (rol, modulo, accion)
);

comment on table public.rol_permisos is
  'Matriz rol x módulo x acción. Cambiarla aquí cambia el comportamiento de toda la app.';

-- Semilla: todas las combinaciones en falso.
insert into public.rol_permisos (rol, modulo, accion, permitido)
select r.rol, m.modulo, a.accion, false
from unnest(enum_range(null::public.rol_usuario)) as r (rol)
cross join unnest(enum_range(null::public.modulo_sistema)) as m (modulo)
cross join unnest(enum_range(null::public.accion_sistema)) as a (accion);

-- admin: todo permitido (queda explícito para que la matriz sea legible).
update public.rol_permisos set permitido = true where rol = 'admin';

-- permiso_medio: lectura total y operación diaria; aprueba solicitudes.
update public.rol_permisos
set permitido = true
where rol = 'permiso_medio'
  and accion = 'ver';

update public.rol_permisos
set permitido = true
where rol = 'permiso_medio'
  and accion in ('crear', 'editar')
  and modulo in (
    'personal', 'asistencia', 'materiales', 'generadores',
    'bitacora', 'solicitudes', 'reportes'
  );

update public.rol_permisos
set permitido = true
where rol = 'permiso_medio'
  and accion = 'aprobar'
  and modulo = 'solicitudes';

-- residente: captura en campo y consulta de su obra. No incluye 'personal':
-- el residente ve nombres para pasar lista, pero no sueldos.
update public.rol_permisos
set permitido = true
where rol = 'residente'
  and accion = 'ver'
  and modulo in (
    'proyectos', 'asistencia', 'materiales',
    'generadores', 'bitacora', 'solicitudes', 'reportes'
  );

update public.rol_permisos
set permitido = true
where rol = 'residente'
  and accion = 'crear'
  and modulo in ('asistencia', 'materiales', 'bitacora', 'solicitudes', 'reportes');

update public.rol_permisos
set permitido = true
where rol = 'residente'
  and accion = 'editar'
  and modulo in ('asistencia', 'bitacora');

-- -----------------------------------------------------------------------------
-- 8. Consultas de apoyo para la app
-- -----------------------------------------------------------------------------

-- Rol del usuario autenticado. SECURITY DEFINER para leer perfiles sin
-- quedar atrapado en su propia política RLS.
create function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.rol
  from public.perfiles p
  where p.id = auth.uid()
    and p.activo;
$$;

create function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.rol_actual() = 'admin', false);
$$;

-- ¿El usuario puede ejecutar esta acción en este módulo?
create function public.puede(
  p_modulo public.modulo_sistema,
  p_accion public.accion_sistema
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(public.rol_actual() = 'admin', false)
    or exists (
      select 1
      from public.rol_permisos rp
      where rp.rol = public.rol_actual()
        and rp.modulo = p_modulo
        and rp.accion = p_accion
        and rp.permitido
    );
$$;

-- ¿El usuario pertenece al proyecto? El admin siempre tiene acceso.
create function public.tiene_acceso_proyecto(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(public.es_admin(), false)
    or exists (
      select 1
      from public.proyecto_miembros m
      where m.proyecto_id = p_proyecto_id
        and m.usuario_id = auth.uid()
    );
$$;

-- Permisos efectivos del usuario, en formato { "modulo": { "accion": true } }.
-- La interfaz los usa para ocultar lo que el usuario no puede hacer; la
-- decisión final siempre la toma RLS en la base.
create function public.mis_permisos()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(p.modulo, p.acciones), '{}'::jsonb)
  from (
    select
      rp.modulo::text as modulo,
      jsonb_object_agg(rp.accion::text, rp.permitido) as acciones
    from public.rol_permisos rp
    where rp.rol = public.rol_actual()
    group by rp.modulo
  ) p;
$$;

-- Perfil del usuario autenticado en una sola llamada.
create function public.mi_perfil()
returns table (
  id uuid,
  email text,
  nombre text,
  rol public.rol_usuario,
  activo boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id, p.email, p.nombre, p.rol, p.activo
  from public.perfiles p
  where p.id = auth.uid();
$$;

-- Directorio mínimo del personal de una obra, sin sueldos ni datos laborales.
-- Lo usa la pantalla de asistencia: el residente necesita nombres para pasar
-- lista, pero no debe poder leer la tabla empleados completa.
create function public.empleados_de_proyecto(p_proyecto_id uuid)
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

  return query
    select e.id, e.nombre, e.puesto, e.activo
    from public.empleados e
    where e.proyecto_id = p_proyecto_id
    order by e.nombre;
end;
$$;

-- Conteo de personal activo por obra, para el resumen. Evita exponer la tabla
-- de empleados a los residentes.
create function public.conteo_personal_por_proyecto()
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
  group by e.proyecto_id;
$$;

-- Los helpers son de uso interno de RLS y de la app autenticada.
revoke all on function public.rol_actual() from public;
revoke all on function public.es_admin() from public;
revoke all on function public.puede(public.modulo_sistema, public.accion_sistema) from public;
revoke all on function public.tiene_acceso_proyecto(uuid) from public;
revoke all on function public.mis_permisos() from public;
revoke all on function public.mi_perfil() from public;
revoke all on function public.empleados_de_proyecto(uuid) from public;
revoke all on function public.conteo_personal_por_proyecto() from public;

grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede(public.modulo_sistema, public.accion_sistema) to authenticated;
grant execute on function public.tiene_acceso_proyecto(uuid) to authenticated;
grant execute on function public.mis_permisos() to authenticated;
grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.empleados_de_proyecto(uuid) to authenticated;
grant execute on function public.conteo_personal_por_proyecto() to authenticated;
