import type { ReactNode } from 'react'

export function Cargando({ texto = 'Cargando información…' }: { texto?: string }) {
  return (
    <div className="cargando" role="status" aria-live="polite">
      {texto}
    </div>
  )
}

export function Vacio({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="vacio">
      <strong>{titulo}</strong>
      {children}
    </div>
  )
}
