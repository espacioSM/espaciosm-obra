import { useEffect, useState } from 'react'
import { urlEvidencia } from '../lib/evidencias'

export function FotoEvidencia({ ruta }: { ruta: string | null }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let vigente = true
    setUrl(null)
    setError(false)

    if (!ruta) return

    void urlEvidencia(ruta).then((resultado) => {
      if (!vigente) return
      if (resultado) setUrl(resultado)
      else setError(true)
    })

    return () => {
      vigente = false
    }
  }, [ruta])

  if (!ruta) return <span className="seccion__nota">—</span>
  if (error) return <span className="seccion__nota">No disponible</span>
  if (!url) return <span className="seccion__nota">Cargando…</span>

  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img className="foto-miniatura" src={url} alt="Evidencia de bitácora" />
    </a>
  )
}
