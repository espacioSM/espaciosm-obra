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
