import type { ReactNode } from 'react'
import type { EstadoProyecto } from '../lib/tipos'
import { tituloEstado } from '../lib/formato'

export function InsigniaEstado({ estado }: { estado: EstadoProyecto }) {
  return <span className={`insignia insignia--${estado}`}>{tituloEstado[estado]}</span>
}

export function Insignia({
  children,
  tono = 'tenue',
}: {
  children: ReactNode
  tono?: 'tenue' | 'alerta' | 'en_ejecucion'
}) {
  return <span className={`insignia insignia--${tono}`}>{children}</span>
}
