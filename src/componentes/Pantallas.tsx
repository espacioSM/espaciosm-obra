import { useSesion } from '../sesion/SesionProvider'

export function PantallaCargando() {
  return (
    <div className="pantalla-centrada">
      <div className="cargando" role="status" aria-live="polite">
        Verificando sesión…
      </div>
    </div>
  )
}

export function PantallaBloqueo({
  titulo,
  mensaje,
  detalle,
}: {
  titulo: string
  mensaje: string
  detalle?: string
}) {
  const { cerrarSesion } = useSesion()

  return (
    <div className="pantalla-centrada">
      <div className="pantalla-caja">
        <h1>{titulo}</h1>
        <p>{mensaje}</p>
        {detalle ? <p>{detalle}</p> : null}
        <div className="acciones" style={{ marginTop: 20 }}>
          <button type="button" className="boton" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  )
}

export function PantallaConfiguracion() {
  const faltantes: string[] = []
  if (!import.meta.env.VITE_SUPABASE_URL) faltantes.push('VITE_SUPABASE_URL')
  if (!import.meta.env.VITE_SUPABASE_ANON_KEY) faltantes.push('VITE_SUPABASE_ANON_KEY')

  return (
    <div className="pantalla-centrada">
      <div className="pantalla-caja">
        <h1>Falta conectar Supabase</h1>
        <p>
          La aplicación está instalada, pero no encuentra la dirección y la llave pública de su
          base de datos. Sin eso no puede iniciar sesión ni leer información.
        </p>
        <p>
          Agrega estas variables al archivo <code>.env</code> en la raíz del proyecto:
        </p>
        <ul>
          {faltantes.map((variable) => (
            <li key={variable}>
              <code>{variable}</code>
            </li>
          ))}
        </ul>
        <p>
          Los valores están en Supabase, en <strong>Project Settings &gt; API</strong>. Después de
          guardarlos, vuelve a compilar la aplicación.
        </p>
        <p>
          Si ya los configuraste en GitHub, revisa que los secretos del repositorio tengan
          exactamente esos nombres y vuelve a ejecutar el despliegue.
        </p>
      </div>
    </div>
  )
}
