import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'
import { mensajeDeError } from './errores'

type Resultado<T> = {
  cargando: boolean
  datos: T | null
  error: string | null
  recargar: () => void
}

/**
 * Ejecuta una consulta cada vez que cambian sus dependencias y expone
 * carga, error y una función para volver a consultar.
 *
 * La consulta debe incluir en `dependencias` todos los valores que lee,
 * igual que un useEffect.
 */
export function useDatos<T>(
  consulta: () => Promise<T>,
  dependencias: DependencyList,
): Resultado<T> {
  const [datos, setDatos] = useState<T | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    setError(null)

    consulta()
      .then((resultado) => {
        if (vigente) setDatos(resultado)
      })
      .catch((fallo: unknown) => {
        if (vigente) {
          setDatos(null)
          setError(mensajeDeError(fallo))
        }
      })
      .finally(() => {
        if (vigente) setCargando(false)
      })

    return () => {
      vigente = false
    }
    // Las dependencias las define quien llama; `consulta` se recrea en cada
    // render y no debe formar parte de la lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencias, version])

  return { cargando, datos, error, recargar: () => setVersion((v) => v + 1) }
}
