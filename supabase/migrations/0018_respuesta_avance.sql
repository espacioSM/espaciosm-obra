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
