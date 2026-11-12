import { Link } from 'react-router-dom'
import { useDatos } from '../lib/useDatos'
import { cargarResumen, listarResidentesEnObra } from '../datos/consultas'
import { useSesion } from '../sesion/SesionProvider'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { InsigniaEstado } from '../componentes/Insignias'
import { formatearFecha, formatearHora, hoyISO } from '../lib/formato'
import { puede } from '../lib/permisos'

export function Resumen() {
  const { perfil, permisos } = useSesion()
  const { datos, cargando, error, recargar } = useDatos(cargarResumen, [])
  const residentesConsulta = useDatos(() => listarResidentesEnObra(hoyISO()), [])
  const residentes = residentesConsulta.datos ?? []
  const residentesEnObra = residentes.filter((residente) => !residente.hora_salida).length

  const proyectos = datos?.proyectos ?? []
  const obrasActivas = proyectos.filter(
    (proyecto) => proyecto.estado === 'en_ejecucion' || proyecto.estado === 'planeado',
  ).length
  const empleadosActivos = datos?.empleadosActivos ?? 0
  const asistenciasHoy = datos?.asistenciasHoy ?? 0
  const sinSalida = datos?.sinSalida ?? 0
  const cobertura =
    empleadosActivos > 0 ? Math.round((asistenciasHoy / empleadosActivos) * 100) : 0

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Resumen de obra</h1>
          <p className="subtitulo">
            Corte al {formatearFecha(hoyISO())}. Solo se muestran las obras, el personal y la
            asistencia a los que tienes acceso.
          </p>
        </div>

        <div className="acciones">
          {puede(permisos, 'asistencia', 'ver') ? (
            <Link className="boton boton--primario" to="/asistencia">
              Registrar asistencia
            </Link>
          ) : null}
          {puede(permisos, 'personal', 'ver') ? (
            <Link className="boton" to="/personal">
              Ver personal
            </Link>
          ) : null}
        </div>
      </div>

      {error ? (
        <Aviso tipo="error">
          {error}{' '}
          <button type="button" className="boton boton--tenue" onClick={recargar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}

      <section className="rejilla-kpi" aria-label="Indicadores de la obra">
        <article className="tarjeta tarjeta--plana">
          <p className="kpi__etiqueta">Obras activas</p>
          <p className="kpi__valor">{obrasActivas}</p>
          <p className="kpi__nota">Planeadas o en ejecución</p>
        </article>
        <article className="tarjeta tarjeta--plana">
          <p className="kpi__etiqueta">Personal activo</p>
          <p className="kpi__valor">{empleadosActivos}</p>
          <p className="kpi__nota">Empleados dados de alta en tus obras</p>
        </article>
        <article className="tarjeta tarjeta--plana">
          <p className="kpi__etiqueta">Asistencias de hoy</p>
          <p className="kpi__valor">{asistenciasHoy}</p>
          <p className="kpi__nota">Registros capturados el día de hoy</p>
        </article>
        <article className="tarjeta tarjeta--plana">
          <p className="kpi__etiqueta">Sin hora de salida</p>
          <p className="kpi__valor">{sinSalida}</p>
          <p className="kpi__nota">Registros de hoy que aún no cierran</p>
        </article>
      </section>

      {perfil && perfil.rol !== 'residente' && residentes.length > 0 ? (
        <section className="tarjeta tarjeta--plana" aria-labelledby="titulo-residentes">
          <div className="seccion__cabecera">
            <div>
              <h2 className="seccion__titulo" id="titulo-residentes">
                Residentes en obra hoy
              </h2>
              <p className="seccion__nota">
                Entradas y salidas que ya registraron los residentes.
              </p>
            </div>
            <button
              type="button"
              className="boton boton--tenue"
              onClick={residentesConsulta.recargar}
            >
              Actualizar
            </button>
          </div>

          {residentesEnObra > 0 ? (
            <Aviso tipo="info">
              {residentesEnObra} residente{residentesEnObra === 1 ? '' : 's'} en obra
              ahora mismo.
            </Aviso>
          ) : null}

          <ul className="lista-simple">
            {residentes.map((residente) => (
              <li key={`${residente.usuario_id}-${residente.proyecto_id}`}>
                <span>
                  <span className="celda-principal">
                    {residente.nombre ?? residente.email}
                  </span>
                  <span className="celda-nota">{residente.proyecto_nombre}</span>
                </span>
                <span className="filtros">
                  <span className="meta-dato">
                    <span className="meta-etiqueta">Entrada</span>
                    {formatearHora(residente.hora_entrada)}
                  </span>
                  <span className="meta-dato">
                    <span className="meta-etiqueta">Salida</span>
                    {residente.hora_salida
                      ? formatearHora(residente.hora_salida)
                      : 'En obra'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {cargando && !datos ? (
        <Cargando />
      ) : (
        <div className="rejilla-dos">
          <section className="tarjeta tarjeta--plana" aria-labelledby="titulo-obras">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo" id="titulo-obras">
                Obras
              </h2>
              <Link className="boton boton--tenue" to="/proyectos">
                Ver todas
              </Link>
            </div>

            {proyectos.length === 0 ? (
              <Vacio titulo="Aún no hay obras visibles">
                {perfil?.rol === 'admin'
                  ? 'Crea la primera obra en Proyectos y asigna al equipo que la verá.'
                  : 'Pide al administrador que te asigne a una obra para consultar su avance.'}
              </Vacio>
            ) : (
              <ul className="lista-obras">
                {proyectos.slice(0, 8).map((proyecto) => (
                  <li className="obra-fila" key={proyecto.id}>
                    <div className="obra-fila__datos">
                      <span className="celda-principal">{proyecto.nombre}</span>
                      <span className="celda-nota">
                        {proyecto.ubicacion ?? 'Sin ubicación registrada'}
                      </span>
                    </div>
                    <div className="obra-fila__meta">
                      <InsigniaEstado estado={proyecto.estado} />
                      <span className="meta-dato">
                        <span className="meta-etiqueta">Inicio</span>
                        {formatearFecha(proyecto.fecha_inicio)}
                      </span>
                      <span className="meta-dato">
                        <span className="meta-etiqueta">Personal</span>
                        {datos?.personalPorProyecto[proyecto.id] ?? 0}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="tarjeta tarjeta--plana" aria-labelledby="titulo-asistencia">
            <div className="seccion__cabecera">
              <h2 className="seccion__titulo" id="titulo-asistencia">
                Cobertura de asistencia
              </h2>
            </div>

            <p className="kpi__valor">{cobertura}%</p>
            <div
              className="medidor"
              role="img"
              aria-label={`Asistencia de hoy: ${cobertura} por ciento del personal activo`}
            >
              <div className="medidor__relleno" style={{ width: `${Math.min(cobertura, 100)}%` }} />
            </div>
            <p className="kpi__nota">
              {asistenciasHoy} registros de {empleadosActivos} empleados activos. Un 100% indica
              que todo el personal tiene cuando menos su entrada capturada.
            </p>

            <div className="acciones" style={{ marginTop: 20 }}>
              <Link className="boton" to="/asistencia">
                Abrir asistencia
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
