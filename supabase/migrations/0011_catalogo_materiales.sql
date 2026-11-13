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
