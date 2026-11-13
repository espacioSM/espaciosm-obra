-- =============================================================================
-- espacioSM Obra · Instalación completa para un proyecto nuevo
-- Archivo: supabase/instalacion_completa.sql
--
-- Ejecutar UNA sola vez en un proyecto Supabase vacío. Incluye 0001 a 0035.
-- Después de ejecutarlo, crea la cuenta admin en Authentication y promuévela
-- con el bloque de promoción que está al final de este archivo.
-- =============================================================================

-- ############################################################################
-- INICIO 0001_esquema_sprint1.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0002_rls_sprint1.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Sprint 1 · Seguridad a nivel de fila (RLS)
-- Archivo: supabase/migrations/0002_rls_sprint1.sql
--
-- Se ejecuta después de 0001. Sin políticas, RLS bloquea todo: cada bloque de
-- aquí abre exactamente lo necesario.
--
-- Regla general:
--   admin         -> todo.
--   permiso_medio -> lo que diga rol_permisos, limitado a sus proyectos.
--   residente     -> captura y consulta dentro de sus proyectos.
-- =============================================================================

alter table public.perfiles enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_miembros enable row level security;
alter table public.empleados enable row level security;
alter table public.asistencia enable row level security;
alter table public.rol_permisos enable row level security;

-- El rol anónimo no toca ninguna tabla: sin sesión no hay datos.
revoke all on public.perfiles from anon;
revoke all on public.proyectos from anon;
revoke all on public.proyecto_miembros from anon;
revoke all on public.empleados from anon;
revoke all on public.asistencia from anon;
revoke all on public.rol_permisos from anon;

grant select, insert, update, delete on public.perfiles to authenticated;
grant select, insert, update, delete on public.proyectos to authenticated;
grant select, insert, update, delete on public.proyecto_miembros to authenticated;
grant select, insert, update, delete on public.empleados to authenticated;
grant select, insert, update, delete on public.asistencia to authenticated;
grant select on public.rol_permisos to authenticated;
grant insert, update, delete on public.rol_permisos to authenticated;

-- -----------------------------------------------------------------------------
-- perfiles
-- -----------------------------------------------------------------------------

-- Cada usuario ve su propio perfil; el admin ve y administra todos.
create policy perfiles_select on public.perfiles
for select to authenticated
using (id = auth.uid() or public.es_admin());

-- Un usuario puede corregir su nombre, pero no su rol ni desactivarse.
create policy perfiles_update_propio on public.perfiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and activo
  and rol = public.rol_actual()
);

create policy perfiles_update_admin on public.perfiles
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

-- Sin política de INSERT: los perfiles los crea el trigger desde auth.users.
-- Sin política de DELETE: las cuentas se eliminan desde Supabase Auth.

-- -----------------------------------------------------------------------------
-- proyectos
-- -----------------------------------------------------------------------------

create policy proyectos_select on public.proyectos
for select to authenticated
using (public.tiene_acceso_proyecto(id));

create policy proyectos_insert on public.proyectos
for insert to authenticated
with check (
  public.puede('proyectos', 'crear')
  and creado_por = auth.uid()
);

create policy proyectos_update on public.proyectos
for update to authenticated
using (
  public.es_admin()
  or (public.tiene_acceso_proyecto(id) and public.puede('proyectos', 'editar'))
)
with check (
  public.es_admin()
  or (public.tiene_acceso_proyecto(id) and public.puede('proyectos', 'editar'))
);

-- Borrar obra es irreversible y arrastra historial: solo admin.
create policy proyectos_delete on public.proyectos
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- proyecto_miembros
-- -----------------------------------------------------------------------------

create policy proyecto_miembros_select on public.proyecto_miembros
for select to authenticated
using (
  usuario_id = auth.uid()
  or public.es_admin()
  or public.tiene_acceso_proyecto(proyecto_id)
);

create policy proyecto_miembros_insert on public.proyecto_miembros
for insert to authenticated
with check (public.es_admin());

create policy proyecto_miembros_update on public.proyecto_miembros
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy proyecto_miembros_delete on public.proyecto_miembros
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- empleados
-- -----------------------------------------------------------------------------

create policy empleados_select on public.empleados
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_insert on public.empleados
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('personal', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_update on public.empleados
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('personal', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

create policy empleados_delete on public.empleados
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- asistencia
-- -----------------------------------------------------------------------------

create policy asistencia_select on public.asistencia
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- El residente registra a su nombre (registrado_por = auth.uid()).
create policy asistencia_insert on public.asistencia
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

-- Permite completar la hora de salida o corregir el registro.
create policy asistencia_update on public.asistencia
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('asistencia', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- Un registro de asistencia no se borra: se corrige. Solo el admin puede.
create policy asistencia_delete on public.asistencia
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- rol_permisos
-- -----------------------------------------------------------------------------

-- La app lee la matriz (para pintar la interfaz). Solo admin la modifica,
-- y en la práctica se ajusta con migraciones SQL versionadas.
create policy rol_permisos_select on public.rol_permisos
for select to authenticated
using (true);

create policy rol_permisos_insert on public.rol_permisos
for insert to authenticated
with check (public.es_admin());

create policy rol_permisos_update on public.rol_permisos
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

create policy rol_permisos_delete on public.rol_permisos
for delete to authenticated
using (public.es_admin());

-- ############################################################################
-- INICIO 0003_ajustes_post_instalacion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Sprint 1 · Ajustes posteriores a la instalación
-- Archivo: supabase/migrations/0003_ajustes_post_instalacion.sql
--
-- Este archivo NO es una migración automática: se ejecuta a mano, una vez,
-- después de crear tus usuarios en Supabase Auth.
--
-- Pasos:
--   1. Crea las cuentas en Authentication > Users (correo y contraseña).
--   2. Ejecuta el bloque A para reparar perfiles faltantes.
--   3. Ejecuta el bloque B con el correo del primer administrador.
--   4. Verifica con el bloque C.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. Reparación: crear perfiles para usuarios de Auth que se hayan quedado
--    sin perfil (por ejemplo, si se crearon antes de correr 0001).
--    Es seguro ejecutarlo siempre: no duplica filas.
-- -----------------------------------------------------------------------------

insert into public.perfiles (id, email, nombre)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
left join public.perfiles p on p.id = u.id
where p.id is null;

-- -----------------------------------------------------------------------------
-- B. Nombrar al primer administrador
--    Cambia el correo por el de la cuenta que ya creaste en Authentication.
-- -----------------------------------------------------------------------------

update public.perfiles
set rol = 'admin', activo = true
where lower(email) = lower('admin-de-obra@ejemplo.mx');  -- <-- EDITAR: correo real del administrador

-- Si no sabes qué correos existen todavía:
-- select id, email, rol, activo from public.perfiles order by creado_en;

-- -----------------------------------------------------------------------------
-- C. Verificación
-- -----------------------------------------------------------------------------

-- Debe haber exactamente el mismo número en ambas columnas.
select
  (select count(*) from auth.users) as usuarios_auth,
  (select count(*) from public.perfiles) as perfiles;

-- Debe aparecer al menos un admin activo.
select email, rol, activo
from public.perfiles
order by rol, email;

-- Debe devolver 150 filas (3 roles x 10 módulos x 5 acciones).
select count(*) as filas_matriz from public.rol_permisos;

-- -----------------------------------------------------------------------------
-- D. Datos de ejemplo (opcional)
--    Descomenta solo si quieres ver la interfaz con información de prueba.
--    No lo ejecutes en la base real con obras en curso.
-- -----------------------------------------------------------------------------

/*
insert into public.proyectos (nombre, ubicacion, fecha_inicio, estado)
values ('Casa Habitación Lomas', 'Lomas de Chapultepec, CDMX', current_date - 45, 'en_ejecucion')
returning id;

insert into public.empleados (proyecto_id, nombre, puesto, sueldo, periodo_pago)
select p.id, e.nombre, e.puesto, e.sueldo, 'diario'::public.periodo_pago
from public.proyectos p
cross join (values
  ('Jorge Ramírez', 'Maestro de obra', 850.00),
  ('Luis Trejo', 'Oficial albañil', 620.00),
  ('Marco Salas', 'Ayudante general', 420.00)
) as e (nombre, puesto, sueldo)
where p.nombre = 'Casa Habitación Lomas';
*/

-- ############################################################################
-- INICIO 0004_endurecimiento_sprint1.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Sprint 1 · Endurecimiento
-- Archivo: supabase/migrations/0004_endurecimiento_sprint1.sql
--
-- Ejecutar después de 0003. Corrige hallazgos de la revisión de seguridad:
--   1. Una cuenta deshabilitada ya no conserva acceso a sus obras.
--   2. El rol, el estado y el correo del perfil no se pueden cambiar por API
--      fuera de las reglas, y un admin no puede quitarse a sí mismo el acceso.
--   3. La asistencia de los residentes se sella con hora y fecha del servidor,
--      no se puede reescribir y queda auditada en asistencia_historial.
--   4. Los DELETE respetan la columna "eliminar" de la matriz de permisos.
--   5. Las funciones quedan cerradas para anon y PUBLIC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Acceso solo para cuentas activas
--
-- rol_actual() devuelve null si el perfil está inactivo o no existe. Hasta
-- ahora, tiene_acceso_proyecto() solo miraba la membresía, así que una cuenta
-- deshabilitada seguía viendo sus obras.
-- -----------------------------------------------------------------------------

create or replace function public.tiene_acceso_proyecto(p_proyecto_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    public.rol_actual() is not null
    and (
      public.es_admin()
      or exists (
        select 1
        from public.proyecto_miembros m
        where m.proyecto_id = p_proyecto_id
          and m.usuario_id = auth.uid()
      )
    );
$$;

-- La matriz también manda en la lectura de proyectos.
drop policy if exists proyectos_select on public.proyectos;

create policy proyectos_select on public.proyectos
for select to authenticated
using (
  public.tiene_acceso_proyecto(id)
  and public.puede('proyectos', 'ver')
);

-- -----------------------------------------------------------------------------
-- 2. La columna "eliminar" deja de ser decorativa
-- -----------------------------------------------------------------------------

drop policy if exists proyectos_delete on public.proyectos;

create policy proyectos_delete on public.proyectos
for delete to authenticated
using (
  public.puede('proyectos', 'eliminar')
  and public.tiene_acceso_proyecto(id)
);

drop policy if exists empleados_delete on public.empleados;

create policy empleados_delete on public.empleados
for delete to authenticated
using (public.puede('personal', 'eliminar') and public.tiene_acceso_proyecto(proyecto_id));

drop policy if exists asistencia_delete on public.asistencia;

create policy asistencia_delete on public.asistencia
for delete to authenticated
using (public.puede('asistencia', 'eliminar') and public.tiene_acceso_proyecto(proyecto_id));

-- -----------------------------------------------------------------------------
-- 3. Protección del perfil
--
-- La política RLS permitía tocar cualquier columna del propio perfil, y un
-- admin podía deshabilitarse o cambiarse el rol por API. Este trigger cierra
-- ambas cosas. Los procesos internos (SQL Editor, service_role, GoTrue) no
-- tienen auth.uid() y siguen pasando, que es lo que necesita el trigger de
-- sincronización de correo.
-- -----------------------------------------------------------------------------

create or replace function public.proteger_perfil()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- La sincronización de correo desde auth.users corre como proceso interno.
  if current_setting('app.sincronizando_email', true) = 'on' then
    return new;
  end if;

  -- El correo es espejo de auth.users: solo lo actualiza el trigger de
  -- sincronización.
  new.email := old.email;

  if not public.es_admin() then
    if new.rol is distinct from old.rol
       or new.activo is distinct from old.activo then
      raise exception 'Solo administración puede cambiar el rol o el estado de una cuenta'
        using errcode = '42501';
    end if;
  elsif old.id = auth.uid()
        and (
          new.rol is distinct from old.rol
          or new.activo is distinct from old.activo
        ) then
    raise exception 'No puedes cambiar tu propio rol ni deshabilitar tu cuenta'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger on public.perfiles;

create trigger perfiles_proteger
before update on public.perfiles
for each row execute function public.proteger_perfil();

-- La sincronización de correo se marca como proceso interno para que el
-- trigger de protección la deje pasar incluso si el JWT del usuario sigue
-- presente en la transacción de GoTrue.
create or replace function public.sincronizar_email_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.sincronizando_email', 'on', true);
  update public.perfiles set email = new.email where id = new.id;
  perform set_config('app.sincronizando_email', 'off', true);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Asistencia: sellado en servidor e historial
-- -----------------------------------------------------------------------------

create table if not exists public.asistencia_historial (
  id bigint generated always as identity primary key,
  asistencia_id uuid not null,
  empleado_id uuid not null,
  proyecto_id uuid not null,
  operacion text not null check (operacion in ('alta', 'cambio', 'baja')),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  usuario_id uuid,
  creado_en timestamptz not null default now()
);

comment on table public.asistencia_historial is
  'Bitácora inmutable de altas, cambios y bajas de asistencia. La escribe un trigger.';

create index if not exists asistencia_historial_proyecto_idx
  on public.asistencia_historial (proyecto_id, creado_en desc);

create index if not exists asistencia_historial_asistencia_idx
  on public.asistencia_historial (asistencia_id);

alter table public.asistencia_historial enable row level security;

revoke all on public.asistencia_historial from anon;
grant select on public.asistencia_historial to authenticated;

drop policy if exists asistencia_historial_select on public.asistencia_historial;

create policy asistencia_historial_select on public.asistencia_historial
for select to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- Sella la asistencia que captura un residente:
--   * la fecha y la hora de entrada las pone el servidor (zona de la obra);
--   * no puede cambiar empleado, obra, fecha ni hora de entrada;
--   * no puede reabrir ni reescribir una jornada cerrada;
--   * registrado_por siempre es quien hace la operación.
-- Admin y permiso medio conservan la captura manual para corregir días
-- anteriores, pero tampoco pueden fechar en el futuro.
create or replace function public.sellar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gestor boolean;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_ahora time := (now() at time zone 'America/Mexico_City')::time;
begin
  -- SQL Editor, service_role y procesos internos: sin JWT de usuario.
  if auth.uid() is null then
    return new;
  end if;

  v_gestor := public.rol_actual() in ('admin', 'permiso_medio');

  if tg_op = 'INSERT' then
    if not v_gestor then
      new.fecha := v_hoy;
      new.hora_entrada := v_ahora;
      new.hora_salida := null;
      new.registrado_por := auth.uid();
    end if;
  else
    if not v_gestor then
      if new.empleado_id is distinct from old.empleado_id
         or new.proyecto_id is distinct from old.proyecto_id
         or new.fecha is distinct from old.fecha then
        raise exception 'No puedes cambiar el empleado, la obra ni la fecha del registro'
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

      new.registrado_por := auth.uid();

      if new.hora_salida is not null then
        new.hora_salida := v_ahora;
      end if;
    end if;
  end if;

  if new.fecha > v_hoy then
    raise exception 'La fecha de asistencia no puede ser futura'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists asistencia_sellar on public.asistencia;

create trigger asistencia_sellar
before insert or update on public.asistencia
for each row execute function public.sellar_asistencia();

-- Historial: se escribe después de cada cambio, con el antes y el después.
create or replace function public.auditar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_empleado uuid;
  v_proyecto uuid;
  v_operacion text;
  v_antes jsonb;
  v_despues jsonb;
begin
  if tg_op = 'DELETE' then
    v_id := old.id;
    v_empleado := old.empleado_id;
    v_proyecto := old.proyecto_id;
    v_operacion := 'baja';
    v_antes := to_jsonb(old);
    v_despues := null;
  else
    v_id := new.id;
    v_empleado := new.empleado_id;
    v_proyecto := new.proyecto_id;
    v_operacion := case when tg_op = 'INSERT' then 'alta' else 'cambio' end;
    v_antes := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
    v_despues := to_jsonb(new);
  end if;

  insert into public.asistencia_historial (
    asistencia_id,
    empleado_id,
    proyecto_id,
    operacion,
    datos_anteriores,
    datos_nuevos,
    usuario_id
  ) values (
    v_id,
    v_empleado,
    v_proyecto,
    v_operacion,
    v_antes,
    v_despues,
    auth.uid()
  );

  return null;
end;
$$;

drop trigger if exists asistencia_auditar on public.asistencia;

create trigger asistencia_auditar
after insert or update or delete on public.asistencia
for each row execute function public.auditar_asistencia();

-- -----------------------------------------------------------------------------
-- 5. Cierre de permisos de ejecución
--
-- Supabase concede EXECUTE a anon y authenticated por defecto en el esquema
-- public. revoke ... from public no quita esa concesión explícita: hay que
-- nombrar a anon. Las funciones de trigger no se pueden invocar directamente,
-- pero también se cierran.
-- -----------------------------------------------------------------------------

revoke all on function public.rol_actual() from public, anon;
revoke all on function public.es_admin() from public, anon;
revoke all on function public.puede(public.modulo_sistema, public.accion_sistema) from public, anon;
revoke all on function public.tiene_acceso_proyecto(uuid) from public, anon;
revoke all on function public.mis_permisos() from public, anon;
revoke all on function public.mi_perfil() from public, anon;
revoke all on function public.empleados_de_proyecto(uuid) from public, anon;
revoke all on function public.conteo_personal_por_proyecto() from public, anon;

grant execute on function public.rol_actual() to authenticated;
grant execute on function public.es_admin() to authenticated;
grant execute on function public.puede(public.modulo_sistema, public.accion_sistema) to authenticated;
grant execute on function public.tiene_acceso_proyecto(uuid) to authenticated;
grant execute on function public.mis_permisos() to authenticated;
grant execute on function public.mi_perfil() to authenticated;
grant execute on function public.empleados_de_proyecto(uuid) to authenticated;
grant execute on function public.conteo_personal_por_proyecto() to authenticated;

revoke all on function public.marcar_actualizado() from public, anon;
revoke all on function public.crear_perfil_nuevo_usuario() from public, anon;
revoke all on function public.sincronizar_email_usuario() from public, anon;
revoke all on function public.proteger_perfil() from public, anon;
revoke all on function public.sellar_asistencia() from public, anon;
revoke all on function public.auditar_asistencia() from public, anon;

grant execute on function public.marcar_actualizado() to authenticated;
grant execute on function public.proteger_perfil() to authenticated;
grant execute on function public.sellar_asistencia() to authenticated;
grant execute on function public.auditar_asistencia() to authenticated;

-- GoTrue usa su propio rol al crear usuarios; si existe, se le permite ejecutar
-- el trigger de alta de perfil. No se otorga a anon.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    begin
      execute 'grant execute on function public.crear_perfil_nuevo_usuario() to supabase_auth_admin';
      execute 'grant execute on function public.sincronizar_email_usuario() to supabase_auth_admin';
    exception when insufficient_privilege then
      raise warning 'No se pudo otorgar EXECUTE a supabase_auth_admin: %', sqlerrm;
    end;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Verificación
-- -----------------------------------------------------------------------------

-- No debe devolver filas.
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'PUBLIC');

-- Debe listar las políticas nuevas.
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('proyectos', 'empleados', 'asistencia', 'asistencia_historial')
order by tablename, policyname;

-- ############################################################################
-- INICIO 0005_revision_sprint1.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Sprint 1 · Ajustes de la revisión
-- Archivo: supabase/migrations/0005_revision_sprint1.sql
--
-- Ejecutar después de 0004. Cierra tres detalles:
--   1. El historial de asistencia es inmutable también a nivel de privilegios
--      y solo lo consulta administración.
--   2. registrado_por siempre es quien hace la operación, también para la
--      oficina que corrige días anteriores.
--   3. Una cuenta inactiva tampoco ve sus propias filas de proyecto_miembros.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Historial: solo lectura, solo administración
-- -----------------------------------------------------------------------------

revoke all on public.asistencia_historial from public, anon, authenticated;
grant select on public.asistencia_historial to authenticated;

drop policy if exists asistencia_historial_select on public.asistencia_historial;

create policy asistencia_historial_select on public.asistencia_historial
for select to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- 2. Autor de la asistencia
-- -----------------------------------------------------------------------------

create or replace function public.sellar_asistencia()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_gestor boolean;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_ahora time := (now() at time zone 'America/Mexico_City')::time;
begin
  if auth.uid() is null then
    return new;
  end if;

  v_gestor := public.rol_actual() in ('admin', 'permiso_medio');

  if tg_op = 'INSERT' then
    if not v_gestor then
      new.fecha := v_hoy;
      new.hora_entrada := v_ahora;
      new.hora_salida := null;
    end if;
  else
    if not v_gestor then
      if new.empleado_id is distinct from old.empleado_id
         or new.proyecto_id is distinct from old.proyecto_id
         or new.fecha is distinct from old.fecha then
        raise exception 'No puedes cambiar el empleado, la obra ni la fecha del registro'
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
  end if;

  -- Vale para todos los roles: el autor es quien tiene la sesión.
  new.registrado_por := auth.uid();

  if new.fecha > v_hoy then
    raise exception 'La fecha de asistencia no puede ser futura'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Miembros de proyecto: la cuenta inactiva tampoco ve sus filas
-- -----------------------------------------------------------------------------

drop policy if exists proyecto_miembros_select on public.proyecto_miembros;

create policy proyecto_miembros_select on public.proyecto_miembros
for select to authenticated
using (
  public.rol_actual() is not null
  and (
    usuario_id = auth.uid()
    or public.es_admin()
    or public.tiene_acceso_proyecto(proyecto_id)
  )
);

-- ############################################################################
-- INICIO 0006_cuadrillas_jornada_residentes.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0007_materiales.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0008_generadores.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0009_estimaciones.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Estimaciones
-- Archivo: supabase/migrations/0009_estimaciones.sql
--
-- Ejecutar después de 0008.
--
-- Una estimación es un corte por periodo. Al crearla, toma los avances de los
-- generadores dentro del periodo y descuenta lo ya estimado, para no duplicar
-- cantidades entre cortes.
-- =============================================================================

do $$
begin
  create type public.estado_estimacion as enum (
    'borrador', 'enviada', 'autorizada', 'pagada'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.estimaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  numero text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  retencion_porcentaje numeric(5, 2) not null default 0,
  estado public.estado_estimacion not null default 'borrador',
  notas text,
  creado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint estimaciones_numero_no_vacio check (btrim(numero) <> ''),
  constraint estimaciones_fechas_coherentes check (fecha_fin >= fecha_inicio),
  constraint estimaciones_retencion_valida
    check (retencion_porcentaje >= 0 and retencion_porcentaje <= 100),
  constraint estimaciones_proyecto_numero unique (proyecto_id, numero)
);

create index if not exists estimaciones_proyecto_fecha_idx
  on public.estimaciones (proyecto_id, fecha_fin desc);

create table if not exists public.estimacion_partidas (
  id uuid primary key default gen_random_uuid(),
  estimacion_id uuid not null references public.estimaciones (id) on delete cascade,
  generador_id uuid not null references public.generadores (id) on delete restrict,
  clave text,
  descripcion text not null,
  unidad text not null,
  cantidad numeric(12, 2) not null,
  precio_unitario numeric(12, 2) not null,
  importe numeric(14, 2) generated always as
    (round(cantidad * precio_unitario, 2)) stored,
  creado_en timestamptz not null default now(),
  constraint estimacion_partidas_cantidad_positiva check (cantidad > 0),
  constraint estimacion_partidas_precio_no_negativo check (precio_unitario >= 0),
  constraint estimacion_partidas_una_por_generador
    unique (estimacion_id, generador_id)
);

create index if not exists estimacion_partidas_estimacion_idx
  on public.estimacion_partidas (estimacion_id);

drop trigger if exists estimaciones_actualizado on public.estimaciones;
create trigger estimaciones_actualizado
before update on public.estimaciones
for each row execute function public.marcar_actualizado();

alter table public.estimaciones enable row level security;
alter table public.estimacion_partidas enable row level security;

revoke all on public.estimaciones from anon;
revoke all on public.estimacion_partidas from anon;
grant select, insert, update, delete on public.estimaciones to authenticated;
grant select on public.estimacion_partidas to authenticated;
revoke insert, update, delete on public.estimacion_partidas from authenticated;

drop policy if exists estimaciones_select on public.estimaciones;
create policy estimaciones_select on public.estimaciones
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_insert on public.estimaciones;
create policy estimaciones_insert on public.estimaciones
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('estimaciones', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_update on public.estimaciones;
create policy estimaciones_update on public.estimaciones
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('estimaciones', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('estimaciones', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists estimaciones_delete on public.estimaciones;
create policy estimaciones_delete on public.estimaciones
for delete to authenticated
using (public.es_admin());

drop policy if exists estimacion_partidas_select on public.estimacion_partidas;
create policy estimacion_partidas_select on public.estimacion_partidas
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
  )
);

-- Crea la estimación y sus partidas en una sola operación. Solo administración.
create or replace function public.crear_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_avances numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede crear estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.proyectos where id = p_proyecto_id
  ) then
    raise exception 'La obra no existe' using errcode = '23503';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje, notas)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion, p_notas)
  returning id into v_estimacion;

  for v_generador in
    select g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin;

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := v_avances - v_estimado;

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  from public, anon;
grant execute on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.estimaciones) as estimaciones,
  (select count(*) from public.estimacion_partidas) as partidas;

-- ############################################################################
-- INICIO 0010_solicitudes.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0011_catalogo_materiales.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Catálogo de materiales de construcción
-- Archivo: supabase/migrations/0011_catalogo_materiales.sql
--
-- Ejecutar después de 0010.
--
-- Catálogo global de referencia (Home Depot México). No consulta precios en
-- vivo: guarda el precio de referencia y el enlace al proveedor. Cada obra
-- importa los materiales que necesita y el precio se llena automáticamente.
-- =============================================================================

create table if not exists public.catalogo_materiales (
  codigo text primary key,
  categoria text not null,
  nombre text not null,
  especificacion text,
  unidad text not null,
  presentacion text,
  precio_referencia numeric(12, 2),
  url text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint catalogo_codigo_no_vacio check (btrim(codigo) <> ''),
  constraint catalogo_nombre_no_vacio check (btrim(nombre) <> ''),
  constraint catalogo_precio_no_negativo check (precio_referencia is null or precio_referencia >= 0)
);

drop trigger if exists catalogo_materiales_actualizado on public.catalogo_materiales;
create trigger catalogo_materiales_actualizado
before update on public.catalogo_materiales
for each row execute function public.marcar_actualizado();

alter table public.catalogo_materiales enable row level security;

revoke all on public.catalogo_materiales from anon;
grant select, insert, update on public.catalogo_materiales to authenticated;

drop policy if exists catalogo_materiales_select on public.catalogo_materiales;
create policy catalogo_materiales_select on public.catalogo_materiales
for select to authenticated
using (activo);

drop policy if exists catalogo_materiales_insert on public.catalogo_materiales;
create policy catalogo_materiales_insert on public.catalogo_materiales
for insert to authenticated
with check (public.es_admin());

drop policy if exists catalogo_materiales_update on public.catalogo_materiales;
create policy catalogo_materiales_update on public.catalogo_materiales
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

alter table public.materiales
  add column if not exists catalogo_id text references public.catalogo_materiales (codigo) on delete set null;

alter table public.materiales
  add column if not exists especificacion text;

alter table public.materiales
  add column if not exists presentacion text;

alter table public.materiales
  drop constraint if exists materiales_proyecto_nombre_unidad;

create unique index if not exists materiales_proyecto_nombre_unidad_manual_idx
  on public.materiales (proyecto_id, nombre, unidad)
  where catalogo_id is null;

create unique index if not exists materiales_proyecto_catalogo_idx
  on public.materiales (proyecto_id, catalogo_id)
  where catalogo_id is not null;

insert into public.catalogo_materiales
  (codigo, categoria, nombre, especificacion, unidad, presentacion, precio_referencia, url)
values
  ('CIM-001', 'cimentacion_y_concreto', 'Cemento gris CPC 30R', 'Saco 25 kg', 'saco', '25 kg', 142, 'https://www.homedepot.com.mx/es-es/b/materiales-de-construccion/basicos-de-construccion/cemento'),
  ('CIM-002', 'cimentacion_y_concreto', 'Mortero gris', 'Saco 50 kg', 'saco', '50 kg', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('CIM-003', 'cimentacion_y_concreto', 'Arena para construcción', 'Arena a granel', 'm3', 'Carga 6 m3', 4386, 'https://www.homedepot.com.mx/es-es/b/materiales-de-construccion/basicos-de-construccion/arenas-y-grava'),
  ('CIM-004', 'cimentacion_y_concreto', 'Grava para concreto', 'Grava a granel', 'm3', 'Carga 6 m3', 4534, 'https://www.homedepot.com.mx/es-es/b/materiales-de-construccion/basicos-de-construccion/arenas-y-grava'),
  ('CIM-005', 'cimentacion_y_concreto', 'Concreto premezclado en saco', 'Mezcla seca para concreto', 'saco', '25 kg', 144, 'https://www.homedepot.com.mx/es-es/b/materiales-de-construccion/basicos-de-construccion/cemento'),
  ('CIM-006', 'cimentacion_y_concreto', 'Aditivo para concreto', 'Aditivo según función', 'litro', 'Envase comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('EST-001', 'acero_y_refuerzo', 'Varilla corrugada 3/8 pulgada', 'Grado 42, 12 m', 'pieza', '12 m', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('EST-002', 'acero_y_refuerzo', 'Varilla corrugada 1/2 pulgada', 'Grado 42, 12 m', 'pieza', '12 m', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('EST-003', 'acero_y_refuerzo', 'Varilla corrugada 3/4 pulgada', 'Grado 42, 12 m', 'pieza', '12 m', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('EST-004', 'acero_y_refuerzo', 'Alambrón', 'Diámetro 1/4 pulgada', 'kg', 'Venta por kilogramo', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('EST-005', 'acero_y_refuerzo', 'Alambre recocido', 'Calibre 16', 'kg', 'Rollo comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('EST-006', 'acero_y_refuerzo', 'Malla electrosoldada', 'Malla para refuerzo de concreto', 'm2', 'Rollo o panel', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('EST-007', 'acero_y_refuerzo', 'Castillo prefabricado', 'Acero prefabricado', 'pieza', '6 m', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('ALB-001', 'albanileria', 'Block de concreto', '15 x 20 x 40 cm, 2 huecos', 'pieza', 'Pieza', 21.4, 'https://www.homedepot.com.mx/s/block'),
  ('ALB-002', 'albanileria', 'Block de concreto', '12 x 20 x 40 cm, 2 huecos', 'pieza', 'Pieza', 15, 'https://www.homedepot.com.mx/s/block'),
  ('ALB-003', 'albanileria', 'Tabique de barro', 'Pieza de barro para mampostería', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('ALB-004', 'albanileria', 'Yeso para construcción', 'Saco 40 kg', 'saco', '40 kg', null, 'https://pro.homedepot.com.mx/pro/basicos'),
  ('ALB-005', 'albanileria', 'Cal hidratada', 'Cal para construcción', 'saco', 'Saco comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('CIM-007', 'cimbra_y_madera', 'Triplay para cimbra', 'Tablero de madera', 'hoja', '1.22 x 2.44 m', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('CIM-008', 'cimbra_y_madera', 'Polín de madera', 'Madera para cimbra', 'pieza', 'Medida comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('CIM-009', 'cimbra_y_madera', 'Tabla de madera', 'Madera de pino', 'pieza', 'Medida comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('CIM-010', 'cimbra_y_madera', 'Clavos para madera', 'Acero', 'kg', 'Caja o kilogramo', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('ACA-001', 'acabados', 'Estuco', 'Interior o exterior, 25 kg', 'saco', '25 kg', 199, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('ACA-002', 'acabados', 'Pasta fina', 'Para acabado de muros', 'saco', '20 kg', 335, 'https://www.homedepot.com.mx/b/materiales-de-construccion/basicos-de-construccion'),
  ('ACA-003', 'acabados', 'Adhesivo cerámico', 'Pegazulejo', 'saco', '20 kg', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('ACA-004', 'acabados', 'Boquilla para juntas', 'Junteador para loseta', 'kg', 'Bolsa comercial', null, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('ACA-005', 'acabados', 'Impermeabilizante acrílico', 'Impermeabilizante fibratado', 'cubeta', '19 L', 1999, 'https://www.homedepot.com.mx/b/materiales-de-construccion'),
  ('ACA-006', 'acabados', 'Pintura vinílica', 'Interior y exterior', 'cubeta', '19 L', null, 'https://www.homedepot.com.mx/b/pintura'),
  ('ACA-007', 'acabados', 'Sellador vinílico', 'Sellador para muros', 'litro', 'Envase comercial', null, 'https://www.homedepot.com.mx/b/pintura'),
  ('ACA-008', 'acabados', 'Loseta cerámica', 'Piso cerámico', 'm2', 'Caja comercial', null, 'https://www.homedepot.com.mx/b/pisos'),
  ('HID-001', 'instalacion_hidrosanitaria', 'Tubo PVC sanitario', 'Diámetro según proyecto', 'pieza', 'Tramo comercial', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-002', 'instalacion_hidrosanitaria', 'Tubo PVC hidráulico', 'Presión según proyecto', 'pieza', 'Tramo comercial', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-003', 'instalacion_hidrosanitaria', 'Tubo CPVC', 'Agua fría y caliente', 'pieza', 'Tramo comercial', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-004', 'instalacion_hidrosanitaria', 'Conexiones PVC', 'Codos, tees, coples y reducciones', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-005', 'instalacion_hidrosanitaria', 'Cemento para PVC', 'Adhesivo para tubería', 'litro', 'Envase comercial', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-006', 'instalacion_hidrosanitaria', 'Válvula de esfera', 'Diámetro según instalación', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('HID-007', 'instalacion_hidrosanitaria', 'Tinaco', 'Polietileno tricapa', 'pieza', '1100 L', null, 'https://www.homedepot.com.mx/b/plomeria'),
  ('ELE-001', 'instalacion_electrica', 'Cable THW-LS', 'Calibres según cálculo', 'metro', 'Rollo comercial', null, 'https://www.homedepot.com.mx/b/electrico'),
  ('ELE-002', 'instalacion_electrica', 'Tubo conduit PVC', 'Diámetro según proyecto', 'pieza', 'Tramo comercial', null, 'https://www.homedepot.com.mx/b/electrico'),
  ('ELE-003', 'instalacion_electrica', 'Cajas eléctricas', 'Chalupa y registro', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/electrico'),
  ('ELE-004', 'instalacion_electrica', 'Centro de carga', 'Número de circuitos según proyecto', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/electrico'),
  ('ELE-005', 'instalacion_electrica', 'Apagadores y contactos', 'Accesorios eléctricos', 'pieza', 'Pieza', null, 'https://www.homedepot.com.mx/b/electrico')
on conflict (codigo) do update set
  categoria = excluded.categoria,
  nombre = excluded.nombre,
  especificacion = excluded.especificacion,
  unidad = excluded.unidad,
  presentacion = excluded.presentacion,
  precio_referencia = excluded.precio_referencia,
  url = excluded.url,
  activo = true;

select count(*) as materiales_catalogo from public.catalogo_materiales;

-- ############################################################################
-- INICIO 0012_catalogo_ultimo_precio.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Catálogo que aprende y último precio
-- Archivo: supabase/migrations/0012_catalogo_ultimo_precio.sql
--
-- Ejecutar después de 0011.
--
--   1. Cada material nuevo se registra en el catálogo global.
--   2. El último precio capturado en un movimiento queda guardado.
--   3. El catálogo solo lo consultan administración y permiso medio.
-- =============================================================================

alter table public.catalogo_materiales
  add column if not exists origen text not null default 'base';

alter table public.catalogo_materiales
  add column if not exists creado_por uuid references public.perfiles (id);

alter table public.catalogo_materiales
  add column if not exists ultimo_precio numeric(12, 2);

alter table public.catalogo_materiales
  add column if not exists ultimo_precio_en timestamptz;

alter table public.materiales
  add column if not exists ultimo_precio numeric(12, 2);

alter table public.materiales
  add column if not exists ultimo_precio_en timestamptz;

create unique index if not exists catalogo_materiales_nombre_unidad_spec_idx
  on public.catalogo_materiales (
    lower(nombre),
    lower(unidad),
    lower(coalesce(especificacion, ''))
  );

-- Solo administración y permiso medio consultan el catálogo global.
drop policy if exists catalogo_materiales_select on public.catalogo_materiales;
create policy catalogo_materiales_select on public.catalogo_materiales
for select to authenticated
using (
  activo
  and (
    public.es_admin()
    or public.rol_actual() = 'permiso_medio'
  )
);

drop policy if exists catalogo_materiales_insert on public.catalogo_materiales;
create policy catalogo_materiales_insert on public.catalogo_materiales
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'crear')
  )
);

drop policy if exists catalogo_materiales_update on public.catalogo_materiales;
create policy catalogo_materiales_update on public.catalogo_materiales
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'editar')
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('materiales', 'editar')
  )
);

-- Aprende de cada material nuevo y lo liga al catálogo global.
create or replace function public.aprender_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_codigo text;
  v_unidad text := coalesce(nullif(btrim(new.unidad), ''), 'pieza');
begin
  if btrim(new.nombre) = '' then
    return new;
  end if;

  if new.catalogo_id is not null then
    if coalesce(new.costo_unitario, 0) > 0 then
      update public.catalogo_materiales
      set ultimo_precio = new.costo_unitario,
          ultimo_precio_en = now()
      where codigo = new.catalogo_id;
    end if;

    new.ultimo_precio := coalesce(nullif(new.costo_unitario, 0), new.ultimo_precio);
    if new.ultimo_precio is not null then
      new.ultimo_precio_en := now();
    end if;

    return new;
  end if;

  select c.codigo into v_codigo
  from public.catalogo_materiales c
  where lower(c.nombre) = lower(btrim(new.nombre))
    and lower(c.unidad) = lower(v_unidad)
    and lower(coalesce(c.especificacion, '')) = lower(coalesce(new.especificacion, ''))
  limit 1;

  if v_codigo is null then
    v_codigo := 'PROP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

    insert into public.catalogo_materiales
      (codigo, categoria, nombre, especificacion, unidad, presentacion,
       precio_referencia, ultimo_precio, ultimo_precio_en, origen, creado_por)
    values
      (v_codigo, 'propio', btrim(new.nombre), new.especificacion, v_unidad,
       new.presentacion, nullif(new.costo_unitario, 0),
       nullif(new.costo_unitario, 0),
       case when coalesce(new.costo_unitario, 0) > 0 then now() else null end,
       'propio', auth.uid());
  else
    if coalesce(new.costo_unitario, 0) > 0 then
      update public.catalogo_materiales
      set ultimo_precio = new.costo_unitario,
          ultimo_precio_en = now()
      where codigo = v_codigo;
    end if;
  end if;

  new.catalogo_id := v_codigo;
  new.ultimo_precio := nullif(new.costo_unitario, 0);
  if new.ultimo_precio is not null then
    new.ultimo_precio_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists materiales_aprender on public.materiales;
create trigger materiales_aprender
before insert on public.materiales
for each row execute function public.aprender_material();

-- Guarda el último precio real capturado en una entrada o salida.
create or replace function public.actualizar_ultimo_precio_material()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(new.costo_unitario, 0) <= 0 then
    return new;
  end if;

  update public.materiales
  set ultimo_precio = new.costo_unitario,
      ultimo_precio_en = now()
  where id = new.material_id;

  update public.catalogo_materiales c
  set ultimo_precio = new.costo_unitario,
      ultimo_precio_en = now()
  from public.materiales m
  where m.id = new.material_id
    and c.codigo = m.catalogo_id;

  return new;
end;
$$;

drop trigger if exists material_movimientos_precio on public.material_movimientos;
create trigger material_movimientos_precio
after insert or update of costo_unitario on public.material_movimientos
for each row execute function public.actualizar_ultimo_precio_material();

revoke all on function public.aprender_material() from public, anon;
revoke all on function public.actualizar_ultimo_precio_material() from public, anon;
grant execute on function public.aprender_material() to authenticated;
grant execute on function public.actualizar_ultimo_precio_material() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.catalogo_materiales) as catalogo,
  (select count(*) from public.catalogo_materiales where origen = 'propio') as propios;

-- ############################################################################
-- INICIO 0013_materiales_solo_gestion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Materiales solo para administración y permiso medio
-- Archivo: supabase/migrations/0013_materiales_solo_gestion.sql
--
-- Ejecutar después de 0012.
--
-- El residente puede consultar materiales de su obra, pero no crear materiales
-- ni registrar entradas o salidas. La captura queda para administración y
-- permiso medio.
-- =============================================================================

update public.rol_permisos
set permitido = false
where rol = 'residente'
  and modulo = 'materiales'
  and accion in ('crear', 'editar');

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.rol_permisos
   where rol = 'residente' and modulo = 'materiales' and permitido) as permisos_materiales_residente;

-- ############################################################################
-- INICIO 0014_movimiento_descripcion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Descripción del material en movimientos
-- Archivo: supabase/migrations/0014_movimiento_descripcion.sql
--
-- Ejecutar después de 0013.
--
-- Agrega una descripción propia del material en cada entrada o salida,
-- independiente de la nota.
-- =============================================================================

alter table public.material_movimientos
  add column if not exists descripcion text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as movimientos from public.material_movimientos;

-- ############################################################################
-- INICIO 0015_bajas_material.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0016_baja_cantidad.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0017_avances_tramo.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Avances por tramo y validación
-- Archivo: supabase/migrations/0017_avances_tramo.sql
--
-- Ejecutar después de 0016.
--
-- Agrega ubicación estructurada, dimensiones y estatus al avance del generador.
-- El residente captura y envía; administración o permiso medio valida o rechaza.
-- Solo los avances validados entran a estimación.
-- =============================================================================

do $$
begin
  create type public.estado_avance_generador as enum (
    'borrador', 'enviado', 'validado', 'rechazado'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.generador_avances
  add column if not exists nivel text;

alter table public.generador_avances
  add column if not exists eje text;

alter table public.generador_avances
  add column if not exists tramo text;

alter table public.generador_avances
  add column if not exists frente text;

alter table public.generador_avances
  add column if not exists largo numeric(12, 3);

alter table public.generador_avances
  add column if not exists ancho numeric(12, 3);

alter table public.generador_avances
  add column if not exists alto numeric(12, 3);

alter table public.generador_avances
  add column if not exists piezas numeric(12, 3) default 1;

alter table public.generador_avances
  add column if not exists estado public.estado_avance_generador
  not null default 'borrador';

alter table public.generador_avances
  add column if not exists validado_por uuid references public.perfiles (id);

alter table public.generador_avances
  add column if not exists validado_en timestamptz;

alter table public.generador_avances
  add column if not exists observaciones text;

-- Los avances que ya existían se consideran validados para no romper cálculos.
update public.generador_avances
set estado = 'validado'
where estado = 'borrador';

alter table public.generador_avances
  drop constraint if exists generador_avances_dimensiones_no_negativas;

alter table public.generador_avances
  add constraint generador_avances_dimensiones_no_negativas
  check (
    (largo is null or largo >= 0)
    and (ancho is null or ancho >= 0)
    and (alto is null or alto >= 0)
    and (piezas is null or piezas >= 0)
  );

create index if not exists generador_avances_estado_idx
  on public.generador_avances (proyecto_id, estado, fecha desc);

-- El residente captura avances; los conceptos siguen siendo de oficina.
update public.rol_permisos
set permitido = true
where rol = 'residente'
  and modulo = 'generadores'
  and accion in ('ver', 'crear', 'editar');

drop policy if exists generadores_insert on public.generadores;
create policy generadores_insert on public.generadores
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists generadores_update on public.generadores;
create policy generadores_update on public.generadores
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

drop policy if exists generador_avances_insert on public.generador_avances;
create policy generador_avances_insert on public.generador_avances
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('generadores', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
    and (
      public.rol_actual() <> 'residente'
      or estado in ('borrador', 'enviado')
    )
  )
);

drop policy if exists generador_avances_update on public.generador_avances;
create policy generador_avances_update on public.generador_avances
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
    and estado in ('borrador', 'rechazado')
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
    and estado in ('borrador', 'rechazado', 'enviado')
  )
);

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
  if tg_op = 'UPDATE' and old.estado = 'validado' then
    raise exception 'El avance ya está validado y no se puede modificar'
      using errcode = '42501';
  end if;

  select g.proyecto_id, g.cantidad
    into v_proyecto, v_cantidad
  from public.generadores g
  where g.id = new.generador_id;

  if v_proyecto is null then
    raise exception 'El generador no existe' using errcode = '23503';
  end if;

  select coalesce(sum(a.cantidad), 0)
    into v_ejecutado
  from public.generador_avances a
  where a.generador_id = new.generador_id
    and a.id <> new.id
    and a.estado in ('enviado', 'validado');

  if v_ejecutado + new.cantidad > v_cantidad + 0.005 then
    raise exception 'El avance excede la cantidad contratada del generador'
      using errcode = '23514';
  end if;

  new.proyecto_id := v_proyecto;

  if auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  if new.estado = 'validado' and (tg_op = 'INSERT' or old.estado <> 'validado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  if new.estado = 'rechazado' and (tg_op = 'INSERT' or old.estado <> 'rechazado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  return new;
end;
$$;

-- Solo avances validados entran a la estimación.
create or replace function public.crear_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_avances numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede crear estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.proyectos where id = p_proyecto_id
  ) then
    raise exception 'La obra no existe' using errcode = '23503';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje, notas)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion, p_notas)
  returning id into v_estimacion;

  for v_generador in
    select g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := v_avances - v_estimado;

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  from public, anon;
grant execute on function public.crear_estimacion(uuid, text, date, date, numeric, text)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select
  (select count(*) from public.generador_avances where estado = 'validado') as validados,
  (select count(*) from public.generador_avances where estado = 'enviado') as enviados;

-- ############################################################################
-- INICIO 0018_respuesta_avance.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Respuesta del residente a un avance rechazado
-- Archivo: supabase/migrations/0018_respuesta_avance.sql
--
-- Ejecutar después de 0017.
--
-- Guarda la respuesta del residente cuando corrige y reenvía un avance que
-- administración o permiso medio rechazaron.
-- =============================================================================

alter table public.generador_avances
  add column if not exists respuesta_residente text;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;

-- ############################################################################
-- INICIO 0019_corregir_rechazado.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Conservar autor y permitir corregir avances rechazados
-- Archivo: supabase/migrations/0019_corregir_rechazado.sql
--
-- Ejecutar después de 0018.
--
--   1. El autor original del avance ya no se sobrescribe al validar o rechazar.
--   2. Un residente de la obra puede corregir un avance rechazado y reenviarlo.
-- =============================================================================

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
  if tg_op = 'UPDATE' and old.estado = 'validado' then
    raise exception 'El avance ya está validado y no se puede modificar'
      using errcode = '42501';
  end if;

  select g.proyecto_id, g.cantidad
    into v_proyecto, v_cantidad
  from public.generadores g
  where g.id = new.generador_id;

  if v_proyecto is null then
    raise exception 'El generador no existe' using errcode = '23503';
  end if;

  select coalesce(sum(a.cantidad), 0)
    into v_ejecutado
  from public.generador_avances a
  where a.generador_id = new.generador_id
    and a.id <> new.id
    and a.estado in ('enviado', 'validado');

  if v_ejecutado + new.cantidad > v_cantidad + 0.005 then
    raise exception 'El avance excede la cantidad contratada del generador'
      using errcode = '23514';
  end if;

  new.proyecto_id := v_proyecto;

  if tg_op = 'INSERT' and auth.uid() is not null then
    new.registrado_por := auth.uid();
  end if;

  if new.estado = 'validado' and (tg_op = 'INSERT' or old.estado <> 'validado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  if new.estado = 'rechazado' and (tg_op = 'INSERT' or old.estado <> 'rechazado') then
    new.validado_por := auth.uid();
    new.validado_en := now();
  end if;

  return new;
end;
$$;

drop policy if exists generador_avances_update on public.generador_avances;
create policy generador_avances_update on public.generador_avances
for update to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and estado in ('borrador', 'rechazado')
  )
)
with check (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('generadores', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and estado in ('borrador', 'rechazado', 'enviado')
  )
);

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances;

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

-- ############################################################################
-- INICIO 0022_estimacion_carrito.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Cierre de estimación con selección de partidas
-- Archivo: supabase/migrations/0022_estimacion_carrito.sql
--
-- Ejecutar después de 0021.
--
-- Permite previsualizar las partidas disponibles de un periodo y crear la
-- estimación solo con las partidas seleccionadas.
-- =============================================================================

create or replace function public.previsualizar_estimacion(
  p_proyecto_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  generador_id uuid,
  clave text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  importe numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede previsualizar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  return query
    select
      g.id,
      g.clave,
      g.descripcion,
      g.unidad,
      round(coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0), 2) as cantidad,
      g.precio_unitario,
      round(
        (coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0)) * g.precio_unitario,
        2
      ) as importe
    from public.generadores g
    left join (
      select av.generador_id, sum(av.cantidad) as cantidad
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
      group by av.generador_id
    ) a on a.generador_id = g.id
    left join (
      select ep.generador_id, sum(ep.cantidad) as cantidad
      from public.estimacion_partidas ep
      join public.estimaciones est on est.id = ep.estimacion_id
      where est.proyecto_id = p_proyecto_id
      group by ep.generador_id
    ) e on e.generador_id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
      and coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0) > 0.005
    order by g.clave nulls last, g.descripcion;
end;
$$;

create or replace function public.crear_estimacion_seleccion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_avances numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
begin
  if not public.es_admin() then
    raise exception 'Solo administración puede crear estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.proyectos where id = p_proyecto_id
  ) then
    raise exception 'La obra no existe' using errcode = '23503';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje, notas)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion, p_notas)
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(coalesce(p_generador_ids, array[]::uuid[])) as sel(id)
      on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := v_avances - v_estimado;

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.previsualizar_estimacion(uuid, date, date)
  from public, anon;
revoke all on function public.crear_estimacion_seleccion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;

grant execute on function public.previsualizar_estimacion(uuid, date, date)
  to authenticated;
grant execute on function public.crear_estimacion_seleccion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;

-- ############################################################################
-- INICIO 0023_tres_fotos.sql
-- ############################################################################

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

-- ############################################################################
-- INICIO 0024_pagos.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Pagos
-- Archivo: supabase/migrations/0024_pagos.sql
--
-- Ejecutar después de 0023.
--
-- Registro de pagos por obra. Administración captura y corrige; permiso medio
-- consulta; residente no tiene acceso.
-- =============================================================================

do $$
begin
  create type public.tipo_pago as enum (
    'personal', 'proveedor', 'contratista', 'otro'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.metodo_pago as enum (
    'efectivo', 'transferencia', 'cheque', 'otro'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  tipo public.tipo_pago not null default 'proveedor',
  beneficiario text not null,
  concepto text not null,
  monto numeric(14, 2) not null,
  fecha date not null default current_date,
  metodo public.metodo_pago not null default 'transferencia',
  referencia text,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint pagos_beneficiario_no_vacio check (btrim(beneficiario) <> ''),
  constraint pagos_concepto_no_vacio check (btrim(concepto) <> ''),
  constraint pagos_monto_positivo check (monto > 0)
);

create index if not exists pagos_proyecto_fecha_idx
  on public.pagos (proyecto_id, fecha desc);

drop trigger if exists pagos_actualizado on public.pagos;
create trigger pagos_actualizado
before update on public.pagos
for each row execute function public.marcar_actualizado();

alter table public.pagos enable row level security;

revoke all on public.pagos from anon;
grant select, insert, update, delete on public.pagos to authenticated;

drop policy if exists pagos_select on public.pagos;
create policy pagos_select on public.pagos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists pagos_insert on public.pagos;
create policy pagos_insert on public.pagos
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('pagos', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists pagos_update on public.pagos;
create policy pagos_update on public.pagos
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
)
with check (
  public.es_admin()
  or (
    public.puede('pagos', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists pagos_delete on public.pagos;
create policy pagos_delete on public.pagos
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as pagos from public.pagos;

-- ############################################################################
-- INICIO 0025_bitacora.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Bitácora
-- Archivo: supabase/migrations/0025_bitacora.sql
--
-- Ejecutar después de 0024.
--
-- Notas diarias por obra con hasta tres fotos. El residente y la oficina
-- escriben; los miembros de la obra consultan.
-- =============================================================================

create table if not exists public.bitacora (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  fecha date not null default current_date,
  titulo text not null,
  contenido text not null,
  foto_paths text[] not null default '{}',
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint bitacora_titulo_no_vacio check (btrim(titulo) <> ''),
  constraint bitacora_contenido_no_vacio check (btrim(contenido) <> ''),
  constraint bitacora_max_tres_fotos check (cardinality(foto_paths) <= 3)
);

create index if not exists bitacora_proyecto_fecha_idx
  on public.bitacora (proyecto_id, fecha desc, creado_en desc);

drop trigger if exists bitacora_actualizado on public.bitacora;
create trigger bitacora_actualizado
before update on public.bitacora
for each row execute function public.marcar_actualizado();

alter table public.bitacora enable row level security;

revoke all on public.bitacora from anon;
grant select, insert, update, delete on public.bitacora to authenticated;

drop policy if exists bitacora_select on public.bitacora;
create policy bitacora_select on public.bitacora
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('bitacora', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists bitacora_insert on public.bitacora;
create policy bitacora_insert on public.bitacora
for insert to authenticated
with check (
  public.es_admin()
  or (
    public.puede('bitacora', 'crear')
    and public.tiene_acceso_proyecto(proyecto_id)
    and registrado_por = auth.uid()
  )
);

drop policy if exists bitacora_update on public.bitacora;
create policy bitacora_update on public.bitacora
for update to authenticated
using (
  public.es_admin()
  or (
    public.puede('bitacora', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or registrado_por = auth.uid()
    )
  )
)
with check (
  public.es_admin()
  or (
    public.puede('bitacora', 'editar')
    and public.tiene_acceso_proyecto(proyecto_id)
    and (
      public.rol_actual() <> 'residente'
      or registrado_por = auth.uid()
    )
  )
);

drop policy if exists bitacora_delete on public.bitacora;
create policy bitacora_delete on public.bitacora
for delete to authenticated
using (public.es_admin());

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as entradas from public.bitacora;

-- ############################################################################
-- INICIO 0026_bitacora_comentarios.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Seguimiento auditable de bitácora
-- Archivo: supabase/migrations/0026_bitacora_comentarios.sql
--
-- Ejecutar después de 0025.
--
-- Las entradas de bitácora quedan bloqueadas después de guardarse. El
-- seguimiento se agrega con comentarios inmutables, con autor y fecha.
-- =============================================================================

create table if not exists public.bitacora_comentarios (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid not null references public.bitacora (id) on delete cascade,
  comentario text not null,
  autor_id uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint bitacora_comentario_no_vacio check (btrim(comentario) <> '')
);

create index if not exists bitacora_comentarios_entrada_idx
  on public.bitacora_comentarios (entrada_id, creado_en);

create or replace function public.sellar_comentario_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.autor_id := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists bitacora_comentarios_sellar on public.bitacora_comentarios;
create trigger bitacora_comentarios_sellar
before insert on public.bitacora_comentarios
for each row execute function public.sellar_comentario_bitacora();

-- La entrada original ya no se edita ni se borra desde la aplicación.
drop policy if exists bitacora_update on public.bitacora;
drop policy if exists bitacora_delete on public.bitacora;

alter table public.bitacora_comentarios enable row level security;

revoke all on public.bitacora_comentarios from anon;
grant select, insert, update, delete on public.bitacora_comentarios to authenticated;

drop policy if exists bitacora_comentarios_select on public.bitacora_comentarios;
create policy bitacora_comentarios_select on public.bitacora_comentarios
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.bitacora b
    where b.id = entrada_id
      and public.puede('bitacora', 'ver')
      and public.tiene_acceso_proyecto(b.proyecto_id)
  )
);

drop policy if exists bitacora_comentarios_insert on public.bitacora_comentarios;
create policy bitacora_comentarios_insert on public.bitacora_comentarios
for insert to authenticated
with check (
  autor_id = auth.uid()
  and (
    public.es_admin()
    or exists (
      select 1
      from public.bitacora b
      where b.id = entrada_id
        and public.puede('bitacora', 'ver')
        and public.tiene_acceso_proyecto(b.proyecto_id)
    )
  )
);

create or replace function public.listar_comentarios_bitacora(p_proyecto_id uuid)
returns table (
  id uuid,
  entrada_id uuid,
  comentario text,
  autor_id uuid,
  autor_nombre text,
  autor_email text,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.entrada_id,
    c.comentario,
    c.autor_id,
    p.nombre,
    p.email,
    c.creado_en
  from public.bitacora_comentarios c
  join public.bitacora b on b.id = c.entrada_id
  join public.perfiles p on p.id = c.autor_id
  where b.proyecto_id = p_proyecto_id
    and public.tiene_acceso_proyecto(p_proyecto_id)
    and public.puede('bitacora', 'ver')
  order by c.creado_en;
$$;

revoke all on function public.listar_comentarios_bitacora(uuid) from public, anon;
revoke all on function public.sellar_comentario_bitacora() from public, anon;
grant execute on function public.listar_comentarios_bitacora(uuid) to authenticated;
grant execute on function public.sellar_comentario_bitacora() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as comentarios from public.bitacora_comentarios;

-- ############################################################################
-- INICIO 0027_pago_estimacion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Pago ligado a estimación
-- Archivo: supabase/migrations/0027_pago_estimacion.sql
--
-- Ejecutar después de 0026.
--
-- Permite registrar un pago contra una estimación autorizada y marca la
-- estimación como pagada en la misma operación.
-- =============================================================================

alter table public.pagos
  add column if not exists estimacion_id uuid references public.estimaciones (id)
  on delete set null;

create index if not exists pagos_estimacion_idx
  on public.pagos (estimacion_id);

create or replace function public.marcar_estimacion_pagada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.estimacion_id is not null then
    update public.estimaciones
    set estado = 'pagada'
    where id = new.estimacion_id
      and estado = 'autorizada';
  end if;

  return new;
end;
$$;

drop trigger if exists pagos_estimacion_pagada on public.pagos;
create trigger pagos_estimacion_pagada
after insert or update of estimacion_id on public.pagos
for each row execute function public.marcar_estimacion_pagada();

revoke all on function public.marcar_estimacion_pagada() from public, anon;
grant execute on function public.marcar_estimacion_pagada() to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as pagos from public.pagos;

-- ############################################################################
-- INICIO 0028_solicitud_estimacion.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Solicitud de estimación por el residente
-- Archivo: supabase/migrations/0028_solicitud_estimacion.sql
--
-- Ejecutar después de 0027.
--
-- El residente solicita una estimación con sus propios avances validados.
-- Administración la recibe como enviada, la autoriza y después pasa a pagos.
-- =============================================================================

alter table public.estimaciones
  add column if not exists solicitado_por uuid references public.perfiles (id)
  default auth.uid();

update public.estimaciones
set solicitado_por = creado_por
where solicitado_por is null;

update public.rol_permisos
set permitido = true
where rol = 'residente'
  and modulo = 'estimaciones'
  and accion in ('ver', 'crear');

drop policy if exists estimaciones_select on public.estimaciones;
create policy estimaciones_select on public.estimaciones
for select to authenticated
using (
  public.es_admin()
  or (
    public.rol_actual() = 'permiso_medio'
    and public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
  or (
    public.rol_actual() = 'residente'
    and public.puede('estimaciones', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
    and solicitado_por = auth.uid()
  )
);

drop policy if exists estimaciones_insert on public.estimaciones;
create policy estimaciones_insert on public.estimaciones
for insert to authenticated
with check (public.es_admin());

drop policy if exists estimacion_partidas_select on public.estimacion_partidas;
create policy estimacion_partidas_select on public.estimacion_partidas
for select to authenticated
using (
  public.es_admin()
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.rol_actual() = 'permiso_medio'
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
  )
  or exists (
    select 1
    from public.estimaciones e
    where e.id = estimacion_id
      and public.rol_actual() = 'residente'
      and public.puede('estimaciones', 'ver')
      and public.tiene_acceso_proyecto(e.proyecto_id)
      and e.solicitado_por = auth.uid()
  )
);

create or replace function public.previsualizar_solicitud_estimacion(
  p_proyecto_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  generador_id uuid,
  clave text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  importe numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  return query
    select
      g.id,
      g.clave,
      g.descripcion,
      g.unidad,
      round(coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0), 2) as cantidad,
      g.precio_unitario,
      round(
        (coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0)) * g.precio_unitario,
        2
      ) as importe
    from public.generadores g
    left join (
      select av.generador_id, sum(av.cantidad) as cantidad
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
        and av.registrado_por = auth.uid()
      group by av.generador_id
    ) a on a.generador_id = g.id
    left join (
      select ep.generador_id, sum(ep.cantidad) as cantidad
      from public.estimacion_partidas ep
      join public.estimaciones est on est.id = ep.estimacion_id
      where est.proyecto_id = p_proyecto_id
      group by ep.generador_id
    ) e on e.generador_id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
      and coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0) > 0.005
    order by g.clave nulls last, g.descripcion;
end;
$$;

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_avances numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(coalesce(p_generador_ids, array[]::uuid[])) as sel(id)
      on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_avances
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := v_avances - v_estimado;

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  from public, anon;
revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;

grant execute on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  to authenticated;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;

-- ############################################################################
-- INICIO 0029_avances_por_estimar.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Avances aprobados listos para estimar
-- Archivo: supabase/migrations/0029_avances_por_estimar.sql
--
-- Ejecutar después de 0028.
--
-- La previsualización de la solicitud devuelve también las fechas de los
-- avances, para que el residente no tenga que buscar el periodo manualmente.
-- =============================================================================

drop function if exists public.previsualizar_solicitud_estimacion(uuid, date, date);

create function public.previsualizar_solicitud_estimacion(
  p_proyecto_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  generador_id uuid,
  clave text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  importe numeric,
  fecha_min date,
  fecha_max date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  return query
    select
      g.id,
      g.clave,
      g.descripcion,
      g.unidad,
      round(coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0), 2) as cantidad,
      g.precio_unitario,
      round(
        (coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0)) * g.precio_unitario,
        2
      ) as importe,
      a.fecha_min,
      a.fecha_max
    from public.generadores g
    left join (
      select
        av.generador_id,
        sum(av.cantidad) as cantidad,
        min(av.fecha) as fecha_min,
        max(av.fecha) as fecha_max
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
        and av.registrado_por = auth.uid()
      group by av.generador_id
    ) a on a.generador_id = g.id
    left join (
      select ep.generador_id, sum(ep.cantidad) as cantidad
      from public.estimacion_partidas ep
      join public.estimaciones est on est.id = ep.estimacion_id
      where est.proyecto_id = p_proyecto_id
      group by ep.generador_id
    ) e on e.generador_id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
      and coalesce(a.cantidad, 0) - coalesce(e.cantidad, 0) > 0.005
    order by g.clave nulls last, g.descripcion;
end;
$$;

revoke all on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  from public, anon;
grant execute on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances where estado = 'validado';

-- ############################################################################
-- INICIO 0030_disponible_residente.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Cantidad disponible correcta para solicitar estimación
-- Archivo: supabase/migrations/0030_disponible_residente.sql
--
-- Ejecutar después de 0029.
--
-- Corrige el cálculo cuando el generador ya tenía avances estimados: el
-- residente debe ver la cantidad nueva disponible, no su acumulado menos todo
-- lo estimado del generador.
-- =============================================================================

create or replace function public.previsualizar_solicitud_estimacion(
  p_proyecto_id uuid,
  p_fecha_inicio date,
  p_fecha_fin date
)
returns table (
  generador_id uuid,
  clave text,
  descripcion text,
  unidad text,
  cantidad numeric,
  precio_unitario numeric,
  importe numeric,
  fecha_min date,
  fecha_max date
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  return query
    select
      g.id,
      g.clave,
      g.descripcion,
      g.unidad,
      round(
        least(
          coalesce(propios.cantidad, 0),
          greatest(coalesce(todos.cantidad, 0) - coalesce(estimado.cantidad, 0), 0)
        ),
        2
      ) as cantidad,
      g.precio_unitario,
      round(
        least(
          coalesce(propios.cantidad, 0),
          greatest(coalesce(todos.cantidad, 0) - coalesce(estimado.cantidad, 0), 0)
        ) * g.precio_unitario,
        2
      ) as importe,
      propios.fecha_min,
      propios.fecha_max
    from public.generadores g
    left join (
      select
        av.generador_id,
        sum(av.cantidad) as cantidad,
        min(av.fecha) as fecha_min,
        max(av.fecha) as fecha_max
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
        and av.registrado_por = auth.uid()
      group by av.generador_id
    ) propios on propios.generador_id = g.id
    left join (
      select av.generador_id, sum(av.cantidad) as cantidad
      from public.generador_avances av
      where av.fecha >= p_fecha_inicio
        and av.fecha <= p_fecha_fin
        and av.estado = 'validado'
      group by av.generador_id
    ) todos on todos.generador_id = g.id
    left join (
      select ep.generador_id, sum(ep.cantidad) as cantidad
      from public.estimacion_partidas ep
      join public.estimaciones est on est.id = ep.estimacion_id
      where est.proyecto_id = p_proyecto_id
      group by ep.generador_id
    ) estimado on estimado.generador_id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
      and least(
        coalesce(propios.cantidad, 0),
        greatest(coalesce(todos.cantidad, 0) - coalesce(estimado.cantidad, 0), 0)
      ) > 0.005
    order by g.clave nulls last, g.descripcion;
end;
$$;

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_propios numeric(12, 2);
  v_todos numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, btrim(p_numero), p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(coalesce(p_generador_ids, array[]::uuid[])) as sel(id)
      on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_propios
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(a.cantidad), 0)
      into v_todos
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := least(v_propios, greatest(v_todos - v_estimado, 0));

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  from public, anon;
revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;
grant execute on function public.previsualizar_solicitud_estimacion(uuid, date, date)
  to authenticated;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances where estado = 'validado';

-- ############################################################################
-- INICIO 0031_folio_solicitud.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Folio automático de solicitud de estimación
-- Archivo: supabase/migrations/0031_folio_solicitud.sql
--
-- Ejecutar después de 0030.
--
-- Genera el folio SOL-AAAAMMDD en el servidor; si ya existe en la obra agrega
-- -02, -03, etc. El residente ya no captura el número.
-- =============================================================================

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_propios numeric(12, 2);
  v_todos numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
  v_base text;
  v_numero text;
  v_secuencia integer := 1;
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  v_base := 'SOL-' || to_char(
    (now() at time zone 'America/Mexico_City')::date,
    'YYYYMMDD'
  );
  v_numero := v_base;

  while exists (
    select 1
    from public.estimaciones e
    where e.proyecto_id = p_proyecto_id
      and e.numero = v_numero
  ) loop
    v_secuencia := v_secuencia + 1;
    v_numero := v_base || '-' || lpad(v_secuencia::text, 2, '0');
  end loop;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, v_numero, p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(coalesce(p_generador_ids, array[]::uuid[])) as sel(id)
      on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_propios
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(a.cantidad), 0)
      into v_todos
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := least(v_propios, greatest(v_todos - v_estimado, 0));

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );
    end if;
  end loop;

  return v_estimacion;
end;
$$;

revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;

-- ############################################################################
-- INICIO 0032_solicitud_no_vacia.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Bloquear solicitudes de estimación vacías
-- Archivo: supabase/migrations/0032_solicitud_no_vacia.sql
--
-- Ejecutar después de 0031.
--
-- Si no hay avances disponibles para las partidas seleccionadas, no se crea
-- la estimación. También elimina las solicitudes vacías generadas antes.
-- =============================================================================

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_propios numeric(12, 2);
  v_todos numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
  v_base text;
  v_numero text;
  v_secuencia integer := 1;
  v_partidas integer := 0;
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_fecha_fin < p_fecha_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if coalesce(array_length(p_generador_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una partida para solicitar la estimación'
      using errcode = '23514';
  end if;

  v_base := 'SOL-' || to_char(
    (now() at time zone 'America/Mexico_City')::date,
    'YYYYMMDD'
  );
  v_numero := v_base;

  while exists (
    select 1
    from public.estimaciones e
    where e.proyecto_id = p_proyecto_id
      and e.numero = v_numero
  ) loop
    v_secuencia := v_secuencia + 1;
    v_numero := v_base || '-' || lpad(v_secuencia::text, 2, '0');
  end loop;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, v_numero, p_fecha_inicio, p_fecha_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(p_generador_ids) as sel(id) on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_propios
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(a.cantidad), 0)
      into v_todos
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.fecha >= p_fecha_inicio
      and a.fecha <= p_fecha_fin
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := least(v_propios, greatest(v_todos - v_estimado, 0));

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );

      v_partidas := v_partidas + 1;
    end if;
  end loop;

  if v_partidas = 0 then
    delete from public.estimaciones where id = v_estimacion;
    raise exception 'No hay avances disponibles para las partidas seleccionadas'
      using errcode = '23514';
  end if;

  return v_estimacion;
end;
$$;

revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- Limpia solicitudes vacías creadas por la versión anterior.
delete from public.estimaciones e
where e.numero like 'SOL-%'
  and not exists (
    select 1
    from public.estimacion_partidas ep
    where ep.estimacion_id = e.id
  );

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as estimaciones from public.estimaciones;

-- ############################################################################
-- INICIO 0033_solicitud_sin_filtro_fecha.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Solicitud con avances reales, sin filtro de periodo
-- Archivo: supabase/migrations/0033_solicitud_sin_filtro_fecha.sql
--
-- Ejecutar después de 0032.
--
-- La solicitud toma todos los avances validados del residente para los
-- generadores seleccionados, calcula el periodo con sus fechas reales y evita
-- que un desfase de fechas deje la solicitud vacía.
-- =============================================================================

create or replace function public.solicitar_estimacion(
  p_proyecto_id uuid,
  p_numero text,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_retencion numeric,
  p_notas text,
  p_generador_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_estimacion uuid;
  v_generador record;
  v_propios numeric(12, 2);
  v_todos numeric(12, 2);
  v_estimado numeric(12, 2);
  v_cantidad numeric(12, 2);
  v_base text;
  v_numero text;
  v_secuencia integer := 1;
  v_partidas integer := 0;
  v_inicio date;
  v_fin date;
begin
  if public.rol_actual() <> 'residente'
     or not public.puede('estimaciones', 'crear')
     or not public.tiene_acceso_proyecto(p_proyecto_id) then
    raise exception 'Sin permiso para solicitar estimaciones'
      using errcode = '42501';
  end if;

  if p_retencion < 0 or p_retencion > 100 then
    raise exception 'La retención debe estar entre 0 y 100'
      using errcode = '23514';
  end if;

  if coalesce(array_length(p_generador_ids, 1), 0) = 0 then
    raise exception 'Selecciona al menos una partida para solicitar la estimación'
      using errcode = '23514';
  end if;

  select min(a.fecha), max(a.fecha)
    into v_inicio, v_fin
  from public.generador_avances a
  join public.generadores g on g.id = a.generador_id
  join unnest(p_generador_ids) as sel(id) on sel.id = g.id
  where g.proyecto_id = p_proyecto_id
    and g.activo
    and a.estado = 'validado'
    and a.registrado_por = auth.uid();

  if v_inicio is null or v_fin is null then
    raise exception 'No hay avances disponibles para las partidas seleccionadas'
      using errcode = '23514';
  end if;

  if v_fin < v_inicio then
    raise exception 'La fecha final debe ser posterior a la inicial'
      using errcode = '23514';
  end if;

  v_base := 'SOL-' || to_char(
    (now() at time zone 'America/Mexico_City')::date,
    'YYYYMMDD'
  );
  v_numero := v_base;

  while exists (
    select 1
    from public.estimaciones e
    where e.proyecto_id = p_proyecto_id
      and e.numero = v_numero
  ) loop
    v_secuencia := v_secuencia + 1;
    v_numero := v_base || '-' || lpad(v_secuencia::text, 2, '0');
  end loop;

  insert into public.estimaciones
    (proyecto_id, numero, fecha_inicio, fecha_fin, retencion_porcentaje,
     notas, estado, solicitado_por)
  values
    (p_proyecto_id, v_numero, v_inicio, v_fin, p_retencion,
     p_notas, 'enviada', auth.uid())
  returning id into v_estimacion;

  for v_generador in
    select distinct g.id, g.clave, g.descripcion, g.unidad, g.precio_unitario
    from public.generadores g
    join unnest(p_generador_ids) as sel(id) on sel.id = g.id
    where g.proyecto_id = p_proyecto_id
      and g.activo
  loop
    select coalesce(sum(a.cantidad), 0)
      into v_propios
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.estado = 'validado'
      and a.registrado_por = auth.uid();

    select coalesce(sum(a.cantidad), 0)
      into v_todos
    from public.generador_avances a
    where a.generador_id = v_generador.id
      and a.estado = 'validado';

    select coalesce(sum(ep.cantidad), 0)
      into v_estimado
    from public.estimacion_partidas ep
    join public.estimaciones e on e.id = ep.estimacion_id
    where ep.generador_id = v_generador.id
      and e.proyecto_id = p_proyecto_id;

    v_cantidad := least(v_propios, greatest(v_todos - v_estimado, 0));

    if v_cantidad > 0.005 then
      insert into public.estimacion_partidas
        (estimacion_id, generador_id, clave, descripcion, unidad, cantidad, precio_unitario)
      values
        (
          v_estimacion,
          v_generador.id,
          v_generador.clave,
          v_generador.descripcion,
          v_generador.unidad,
          round(v_cantidad, 2),
          v_generador.precio_unitario
        );

      v_partidas := v_partidas + 1;
    end if;
  end loop;

  if v_partidas = 0 then
    delete from public.estimaciones where id = v_estimacion;
    raise exception 'No hay avances disponibles para las partidas seleccionadas'
      using errcode = '23514';
  end if;

  return v_estimacion;
end;
$$;

revoke all on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) from public, anon;
grant execute on function public.solicitar_estimacion(
  uuid, text, date, date, numeric, text, uuid[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as avances from public.generador_avances where estado = 'validado';

-- ############################################################################
-- INICIO 0034_presupuesto_cobros.sql
-- ############################################################################

-- =============================================================================
-- espacioSM Obra · Presupuesto y cobros del cliente
-- Archivo: supabase/migrations/0034_presupuesto_cobros.sql
--
-- Ejecutar después de 0033.
--
-- Registra el monto contractual, el anticipo y los cobros al cliente:
-- anticipo, pago por estimación y liquidación.
-- =============================================================================

do $$
begin
  create type public.tipo_cobro as enum ('anticipo', 'estimacion', 'liquidacion', 'otro');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.presupuestos (
  proyecto_id uuid primary key references public.proyectos (id) on delete cascade,
  monto_contrato numeric(14, 2) not null default 0,
  anticipo_porcentaje numeric(5, 2) not null default 0,
  notas text,
  actualizado_por uuid references public.perfiles (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint presupuesto_monto_no_negativo check (monto_contrato >= 0),
  constraint presupuesto_anticipo_valido
    check (anticipo_porcentaje >= 0 and anticipo_porcentaje <= 100)
);

create table if not exists public.cobros_cliente (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  estimacion_id uuid references public.estimaciones (id) on delete set null,
  tipo public.tipo_cobro not null,
  monto numeric(14, 2) not null,
  fecha date not null default current_date,
  referencia text,
  nota text,
  registrado_por uuid references public.perfiles (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  constraint cobro_monto_positivo check (monto > 0)
);

create index if not exists cobros_cliente_proyecto_fecha_idx
  on public.cobros_cliente (proyecto_id, fecha desc);

drop trigger if exists presupuestos_actualizado on public.presupuestos;
create trigger presupuestos_actualizado
before update on public.presupuestos
for each row execute function public.marcar_actualizado();

alter table public.presupuestos enable row level security;
alter table public.cobros_cliente enable row level security;

revoke all on public.presupuestos from anon;
revoke all on public.cobros_cliente from anon;
grant select, insert, update on public.presupuestos to authenticated;
grant select, insert on public.cobros_cliente to authenticated;

drop policy if exists presupuestos_select on public.presupuestos;
create policy presupuestos_select on public.presupuestos
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists presupuestos_insert on public.presupuestos;
create policy presupuestos_insert on public.presupuestos
for insert to authenticated
with check (public.es_admin());

drop policy if exists presupuestos_update on public.presupuestos;
create policy presupuestos_update on public.presupuestos
for update to authenticated
using (public.es_admin())
with check (public.es_admin());

drop policy if exists cobros_cliente_select on public.cobros_cliente;
create policy cobros_cliente_select on public.cobros_cliente
for select to authenticated
using (
  public.es_admin()
  or (
    public.puede('pagos', 'ver')
    and public.tiene_acceso_proyecto(proyecto_id)
  )
);

drop policy if exists cobros_cliente_insert on public.cobros_cliente;
create policy cobros_cliente_insert on public.cobros_cliente
for insert to authenticated
with check (
  public.es_admin()
  and registrado_por = auth.uid()
  and public.tiene_acceso_proyecto(proyecto_id)
);

-- Los cobros son auditables: no se editan ni se borran desde la aplicación.
drop policy if exists cobros_cliente_update on public.cobros_cliente;
drop policy if exists cobros_cliente_delete on public.cobros_cliente;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------

select count(*) as presupuestos from public.presupuestos;
select count(*) as cobros from public.cobros_cliente;

-- ############################################################################
-- INICIO 0035_programa_obra.sql
-- ############################################################################

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

-- =============================================================================
-- PROMOCIÓN DEL ADMINISTRADOR
-- Ejecutar DESPUÉS de crear la cuenta en Authentication > Users.
-- Cambia el correo de ejemplo por el correo real.
-- =============================================================================

insert into public.perfiles (id, email, nombre)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
left join public.perfiles p on p.id = u.id
where p.id is null;

update public.perfiles
set rol = 'admin', activo = true
where lower(email) = lower('admin-de-obra@ejemplo.mx');  -- <-- EDITAR

select email, rol, activo from public.perfiles order by email;