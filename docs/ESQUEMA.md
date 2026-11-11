# Esquema y seguridad

Documento de referencia de la base de datos del Sprint 1. Todo lo aquí descrito
está implementado en `supabase/migrations/0001_esquema_sprint1.sql`,
`0002_rls_sprint1.sql`, `0004_endurecimiento_sprint1.sql` y
`0005_revision_sprint1.sql`.

## Relaciones

```
auth.users
   │ 1 a 1
   ▼
perfiles ──< proyecto_miembros >── proyectos ──< empleados ──< asistencia
   │                                    ▲                         │
   │ creado_por                         └─────────────────────────┘
   └──────────────────────────────────────┘

rol_permisos  (independiente: rol × módulo × acción)
```

- Un usuario tiene un perfil y puede pertenecer a varios proyectos.
- Un proyecto tiene varios miembros, varios empleados y varias asistencias.
- Un empleado pertenece a un solo proyecto.
- La asistencia pertenece al empleado y al proyecto a la vez, y la llave
  foránea compuesta obliga a que coincidan.

## Tablas

### perfiles

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | uuid, PK | Igual al id de `auth.users`; borrado en cascada |
| email | text | Sincronizado desde Auth |
| nombre | text | Puede ser nulo |
| rol | `rol_usuario` | `admin`, `permiso_medio`, `residente` |
| activo | boolean | Deshabilitar corta el acceso sin borrar |
| creado_en | timestamptz | |
| actualizado_en | timestamptz | Trigger |

### proyectos

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | uuid, PK | |
| nombre | text | Obligatorio, no vacío |
| ubicacion | text | |
| fecha_inicio | date | Por defecto hoy |
| fecha_fin | date | Nula si la obra sigue abierta |
| estado | `estado_proyecto` | `planeado`, `en_ejecucion`, `pausado`, `terminado` |
| creado_por | uuid | Perfil que la dio de alta |
| creado_en, actualizado_en | timestamptz | |

Restricción: `fecha_fin >= fecha_inicio`.

### proyecto_miembros

| Columna | Tipo | Notas |
| --- | --- | --- |
| proyecto_id | uuid | PK compuesta |
| usuario_id | uuid | PK compuesta |
| creado_en | timestamptz | |

Es la base del aislamiento: sin fila aquí, un usuario no administrador no ve la
obra ni sus datos.

### empleados

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | uuid, PK | |
| proyecto_id | uuid | Obligatorio, no se puede borrar la obra con personal |
| nombre | text | Obligatorio |
| puesto | text | |
| sueldo | numeric(12,2) | Según el periodo |
| periodo_pago | `periodo_pago` | `mensual`, `quincenal`, `semanal`, `diario`, `por_hora` |
| fecha_ingreso | date | |
| fecha_baja | date | Se llena al dar de baja |
| activo | boolean | Baja lógica |
| creado_en, actualizado_en | timestamptz | |

Restricciones: `sueldo >= 0`, `fecha_baja >= fecha_ingreso` y
`unique (id, proyecto_id)`, que habilita la llave compuesta de asistencia.

### asistencia

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | uuid, PK | |
| empleado_id | uuid | Parte de la llave compuesta |
| proyecto_id | uuid | Parte de la llave compuesta |
| fecha | date | Por defecto hoy |
| hora_entrada | time | |
| hora_salida | time | |
| registrado_por | uuid | Último usuario que capturó |
| creado_en, actualizado_en | timestamptz | |

Restricciones:

- `unique (empleado_id, fecha)`: una fila por persona y día.
- `hora_salida > hora_entrada` cuando ambas existen.
- Llave foránea `(empleado_id, proyecto_id)` hacia `empleados (id, proyecto_id)`.

### asistencia_historial

| Columna | Tipo | Notas |
| --- | --- | --- |
| id | bigint, PK | Identidad |
| asistencia_id | uuid | Referencia lógica, sin llave foránea para sobrevivir bajas |
| empleado_id, proyecto_id | uuid | Contexto del registro |
| operacion | text | `alta`, `cambio` o `baja` |
| datos_anteriores, datos_nuevos | jsonb | Copia completa antes y después |
| usuario_id | uuid | Quien ejecutó el cambio |
| creado_en | timestamptz | |

La escribe el trigger `auditar_asistencia`; nadie puede modificarla por API. La
consulta únicamente administración.

### rol_permisos

| Columna | Tipo | Notas |
| --- | --- | --- |
| rol | `rol_usuario` | PK compuesta |
| modulo | `modulo_sistema` | PK compuesta |
| accion | `accion_sistema` | PK compuesta |
| permitido | boolean | |

Se siembran las 150 combinaciones (3 roles × 10 módulos × 5 acciones). El
administrador se valida aparte en `puede()`, así que su fila no es lo que le da
poder.

## Funciones de apoyo

| Función | Tipo | Uso |
| --- | --- | --- |
| `rol_actual()` | consulta | Rol del usuario autenticado, solo si está activo |
| `es_admin()` | consulta | Atajo de `rol_actual() = 'admin'` |
| `puede(modulo, accion)` | consulta | Lee la matriz; el admin siempre puede |
| `tiene_acceso_proyecto(uuid)` | consulta | Admin o miembro, y la cuenta debe estar activa |
| `mis_permisos()` | consulta | Permisos efectivos para pintar la interfaz |
| `mi_perfil()` | consulta | Perfil propio, sin depender de RLS |
| `empleados_de_proyecto(uuid)` | consulta | Directorio sin sueldos para asistencia |
| `conteo_personal_por_proyecto()` | consulta | Conteos para el resumen |
| `proteger_perfil()` | trigger | Bloquea cambios de rol, estado y correo fuera de regla |
| `sellar_asistencia()` | trigger | Sella fecha y hora del servidor para residentes; fuerza el autor para todos |
| `auditar_asistencia()` | trigger | Escribe el historial de altas, cambios y bajas |

Las de consulta son `security definer`, `stable` y con
`search_path = public, pg_temp`. Solo `authenticated` puede ejecutarlas. Las de
trigger no se pueden invocar directamente y también están cerradas para `anon`
y `PUBLIC`.

## Políticas RLS

Resumen de lo permitido. El administrador siempre entra por `es_admin()`.

| Tabla | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| perfiles | propio perfil o admin | nadie (lo crea el trigger) | propio nombre; admin todo, sin cambiar el rol propio ni desactivarse | nadie |
| proyectos | miembro activo con `proyectos.ver` | `proyectos.crear` con `creado_por = auth.uid()` | admin, o `proyectos.editar` siendo miembro | `proyectos.eliminar` siendo miembro |
| proyecto_miembros | propio, miembro del proyecto o admin | solo admin | solo admin | solo admin |
| empleados | admin, o `personal.ver` siendo miembro | `personal.crear` siendo miembro | `personal.editar` siendo miembro | `personal.eliminar` siendo miembro |
| asistencia | admin, o `asistencia.ver` siendo miembro | `asistencia.crear`, miembro y `registrado_por = auth.uid()` | `asistencia.editar` siendo miembro | `asistencia.eliminar` siendo miembro |
| asistencia_historial | admin | nadie (solo el trigger) | nadie | nadie |
| rol_permisos | cualquier autenticado | solo admin | solo admin | solo admin |

Notas:

- `perfiles` no tiene política de `insert` ni de `delete`. El alta la hace el
  trigger desde `auth.users`; la baja se hace en Supabase Auth.
- El trigger `proteger_perfil` impide que un usuario cambie su rol o se
  deshabilite, y que un administrador haga eso consigo mismo. También fuerza que
  el correo solo se actualice desde Auth.
- Una cuenta inactiva no obtiene rol (`rol_actual()` devuelve nulo), así que
  `tiene_acceso_proyecto()` falla y ninguna política la deja pasar.
- El residente no tiene `personal.ver`, por lo que la tabla `empleados` le
  devuelve cero filas. Los nombres para la asistencia llegan por la función
  `empleados_de_proyecto`.
- Los `DELETE` leen la columna `eliminar` de la matriz. Si se concede a un rol,
  ese rol puede borrar por API; la interfaz no ofrece esas acciones.

## Consultas administrativas frecuentes

Ejecutar en **SQL Editor**. Cambiar los correos y nombres antes de correr.

### Nombrar o cambiar un administrador

```sql
update public.perfiles
set rol = 'admin', activo = true
where email = 'segundo.admin@espaciosm.art';
```

### Ver todas las cuentas y su rol

```sql
select p.email, p.nombre, p.rol, p.activo, p.creado_en
from public.perfiles p
order by p.rol, p.email;
```

### Asignar una persona a una obra

```sql
insert into public.proyecto_miembros (proyecto_id, usuario_id)
select pr.id, pe.id
from public.proyectos pr, public.perfiles pe
where pr.nombre = 'Casa Habitación Lomas'
  and pe.email = 'residente1@espaciosm.art'
on conflict do nothing;
```

### Quitar a una persona de una obra

```sql
delete from public.proyecto_miembros
where proyecto_id = (select id from public.proyectos where nombre = 'Casa Habitación Lomas')
  and usuario_id = (select id from public.perfiles where email = 'residente1@espaciosm.art');
```

### Cambiar la matriz de permisos

```sql
-- Ejemplo: permitir que permiso medio apruebe estimaciones
update public.rol_permisos
set permitido = true
where rol = 'permiso_medio'
  and modulo = 'estimaciones'
  and accion = 'aprobar';
```

### Revisar qué políticas existen

```sql
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

### Revisar permisos de ejecución de funciones

No debe aparecer `anon` ni `PUBLIC`:

```sql
select routine_name, grantee
from information_schema.routine_privileges
where routine_schema = 'public'
  and grantee in ('anon', 'PUBLIC');
```

### Consultar el historial de asistencia

```sql
select
  h.creado_en,
  h.operacion,
  e.nombre as empleado,
  h.datos_anteriores,
  h.datos_nuevos,
  h.usuario_id
from public.asistencia_historial h
join public.empleados e on e.id = h.empleado_id
order by h.creado_en desc
limit 50;
```

### Reparar perfiles faltantes

```sql
insert into public.perfiles (id, email, nombre)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
left join public.perfiles p on p.id = u.id
where p.id is null;
```

### Respaldo rápido por tabla

Desde **Table Editor** se puede exportar cada tabla a CSV. Para un respaldo
completo se necesita `pg_dump` con la cadena de conexión de
**Project Settings > Database**. El plan gratuito no programa respaldos.

## Reglas para las siguientes migraciones

1. Un archivo nuevo por cambio, numerado: `0006_materiales.sql`.
2. Nunca editar un archivo ya ejecutado en producción.
3. Toda tabla nueva activa RLS en el mismo archivo y define sus políticas antes
   de cargar datos.
4. Toda función `security definer` valida rol o pertenencia por su cuenta.
5. Toda función nueva se revoca de `PUBLIC` y `anon`, y se concede solo a
   `authenticated` (o al rol interno que la necesite).
6. Los cambios se prueban primero en un proyecto de Supabase de prueba.
7. `service_role` no se usa en la aplicación ni en GitHub Actions.
