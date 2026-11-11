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
