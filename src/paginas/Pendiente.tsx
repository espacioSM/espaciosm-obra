import { Link, Navigate, useParams } from 'react-router-dom'
import { PENDIENTES } from '../navegacion'
import { Insignia } from '../componentes/Insignias'
import { Aviso } from '../componentes/Aviso'

export function Pendiente() {
  const { modulo } = useParams<{ modulo: string }>()
  const info = modulo ? PENDIENTES[modulo] : undefined

  if (!info) return <Navigate to="/" replace />

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <Insignia tono="tenue">Sprint {info.sprint}</Insignia>
          <h1 className="titulo" style={{ marginTop: 12 }}>
            {info.titulo}
          </h1>
          <p className="subtitulo">{info.detalle}</p>
        </div>
        <div className="acciones">
          <Link className="boton" to="/">
            Volver al resumen
          </Link>
        </div>
      </div>

      <section className="tarjeta">
        <div className="seccion__cabecera">
          <h2 className="seccion__titulo">Qué incluirá el módulo</h2>
        </div>
        <ul className="lista-simple">
          {info.incluye.map((punto) => (
            <li key={punto}>
              <span>{punto}</span>
            </li>
          ))}
        </ul>
      </section>

      <Aviso tipo="info">
        Este módulo corresponde al Sprint {info.sprint} y todavía no está operando. Mientras
        tanto, las obras, el personal, la asistencia y los roles ya funcionan con la base de
        datos real.
      </Aviso>
    </div>
  )
}
