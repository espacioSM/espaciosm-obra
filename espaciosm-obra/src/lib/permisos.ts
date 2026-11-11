import type { Accion, Modulo, Permisos } from './tipos'

/** Consulta la matriz de permisos ya cargada en sesión. */
export function puede(permisos: Permisos, modulo: Modulo, accion: Accion): boolean {
  return permisos[modulo]?.[accion] === true
}
