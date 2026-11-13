import { useEffect, useState } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  listarActividadesPrograma,
  listarAvancesGenerador,
  listarGeneradores,
  listarProyectos,
} from '../datos/consultas'
import type { Generador, ProgramaActividad } from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'

function fechaLocal(iso: string): Date {
  return new Date(`${iso}T12:00:00`)
}

function isoLocal(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const dia = String(fecha.getDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

function esHabil(fecha: Date): boolean {
  return fecha.getDay() !== 0
}

function siguienteHabil(fecha: Date): Date {
  const copia = new Date(fecha)
  while (!esHabil(copia)) copia.setDate(copia.getDate() + 1)
  return copia
}

function sumarHabiles(inicio: Date, dias: number): Date {
  const fecha = siguienteHabil(new Date(inicio))
  let restantes = Math.max(1, dias) - 1
  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1)
    if (esHabil(fecha)) restantes -= 1
  }
  return fecha
}

function diasHabiles(inicio: string, fin: string): number {
  const desde = fechaLocal(inicio)
  const hasta = fechaLocal(fin)
  if (hasta < desde) return 0
  let dias = 0
  const cursor = new Date(desde)
  while (cursor <= hasta) {
    if (esHabil(cursor)) dias += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

function avanceProgramado(actividad: ProgramaActividad, fecha: string): number {
  if (fecha < actividad.fecha_inicio) return 0
  if (fecha >= actividad.fecha_fin) return 100
  const total = diasHabiles(actividad.fecha_inicio, actividad.fecha_fin)
  if (total === 0) return 100
  const transcurridos = diasHabiles(actividad.fecha_inicio, fecha)
  return Math.min(100, (transcurridos / total) * 100)
}

export function Avance() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(async () => {
    if (proyectoId === '') {
      return { actividades: [], avances: [], generadores: [] }
    }
    const [actividades, avances, generadores] = await Promise.all([
      listarActividadesPrograma(proyectoId),
      listarAvancesGenerador(proyectoId),
      listarGeneradores(proyectoId),
    ])
    return { actividades, avances, generadores }
  }, [proyectoId])

  const actividades = consulta.datos?.actividades ?? []
  const avances = consulta.datos?.avances ?? []
  const generadores = consulta.datos?.generadores ?? []

  const puedeVer = permisos.generadores?.ver === true

  const ejecutadoPorGenerador = new Map<string, number>()
  const primerAvancePorGenerador = new Map<string, string>()
  for (const avance of avances) {
    if (avance.estado !== 'validado') continue
    ejecutadoPorGenerador.set(
      avance.generador_id,
      (ejecutadoPorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
    )
    const actual = primerAvancePorGenerador.get(avance.generador_id)
    if (!actual || avance.fecha < actual) {
      primerAvancePorGenerador.set(avance.generador_id, avance.fecha)
    }
  }

  const hoy = hoyISO()
  const filas = actividades.map((actividad) => {
    const ejecutado = Math.min(
      Number(actividad.cantidad),
      ejecutadoPorGenerador.get(actividad.generador_id ?? '') ?? 0,
    )
    const real = Number(actividad.cantidad) > 0 ? (ejecutado / Number(actividad.cantidad)) * 100 : 0
    const programado = avanceProgramado(actividad, hoy)
    const desviacion = real - programado
    const inicioReal =
      primerAvancePorGenerador.get(actividad.generador_id ?? '') ?? actividad.fecha_inicio
    const diasTranscurridos = Math.max(1, diasHabiles(inicioReal, hoy))
    const ritmo = ejecutado / diasTranscurridos
    const restante = Math.max(0, Number(actividad.cantidad) - ejecutado)
    const diasRestantes = ritmo > 0 ? Math.ceil(restante / ritmo) : null
    const finProyectado =
      diasRestantes === null ? null : isoLocal(sumarHabiles(fechaLocal(hoy), diasRestantes))
    const atraso =
      finProyectado !== null && finProyectado > actividad.fecha_fin
        ? diasHabiles(actividad.fecha_fin, finProyectado)
        : 0
    const estado =
      real <= 0.01
        ? 'Sin avance'
        : desviacion < -10 || atraso > 0
          ? 'Atrasado'
          : desviacion < -3
            ? 'En riesgo'
            : 'En tiempo'

    return {
      actividad,
      ejecutado,
      real,
      programado,
      desviacion,
      finProyectado,
      atraso,
      estado,
    }
  })

  const totalCantidad = filas.reduce(
    (total, fila) => total + Number(fila.actividad.cantidad),
    0,
  )
  const avanceRealGlobal =
    totalCantidad > 0
      ? filas.reduce(
          (total, fila) => total + Number(fila.actividad.cantidad) * fila.real,
          0,
        ) / totalCantidad
      : 0
  const avanceProgramadoGlobal =
    totalCantidad > 0
      ? filas.reduce(
          (total, fila) =>
            total + Number(fila.actividad.cantidad) * fila.programado,
          0,
        ) / totalCantidad
      : 0
  const desviacionGlobal = avanceRealGlobal - avanceProgramadoGlobal
  const enRiesgo = filas.filter(
    (fila) =>
      fila.estado === 'En riesgo' ||
      fila.estado === 'Atrasado' ||
      (fila.estado === 'Sin avance' && fila.programado > 0),
  )

  const fechaMin = actividades.reduce(
    (minima, actividad) =>
      minima === '' || actividad.fecha_inicio < minima
        ? actividad.fecha_inicio
        : minima,
    '',
  )
  const fechaMax = actividades.reduce(
    (maxima, actividad) =>
      maxima === '' || actividad.fecha_fin > maxima ? actividad.fecha_fin : maxima,
    '',
  )

  const muestras: string[] = []
  if (fechaMin !== '' && fechaMax !== '') {
    let cursor = fechaLocal(fechaMin)
    const fin = fechaLocal(fechaMax)
    while (cursor <= fin) {
      if (esHabil(cursor)) muestras.push(isoLocal(cursor))
      cursor.setDate(cursor.getDate() + (muestras.length > 120 ? 3 : 1))
    }
    if (muestras[muestras.length - 1] !== fechaMax) muestras.push(fechaMax)
  }

  const puntosProgramado = muestras.map((fecha, indice) => {
    const porcentaje =
      totalCantidad > 0
        ? filas.reduce(
            (total, fila) =>
              total +
              Number(fila.actividad.cantidad) *
                avanceProgramado(fila.actividad, fecha),
            0,
          ) / totalCantidad
        : 0
    return { fecha, indice, porcentaje }
  })
  const puntosReal = muestras.map((fecha, indice) => {
    const porcentaje =
      totalCantidad > 0
        ? filas.reduce((total, fila) => {
            const ejecutado = avances
              .filter(
                (avance) =>
                  avance.estado === 'validado' &&
                  avance.generador_id === fila.actividad.generador_id &&
                  avance.fecha <= fecha,
              )
              .reduce((suma, avance) => suma + Number(avance.cantidad), 0)
            return total + Math.min(Number(fila.actividad.cantidad), ejecutado)
          }, 0) / totalCantidad
        : 0
    return { fecha, indice, porcentaje }
  })

  const ancho = 720
  const alto = 240
  const margen = { izquierda: 42, derecha: 16, arriba: 18, abajo: 28 }
  const anchoUtil = ancho - margen.izquierda - margen.derecha
  const altoUtil = alto - margen.arriba - margen.abajo
  const x = (indice: number) =>
    margen.izquierda + (muestras.length <= 1 ? 0 : (indice / (muestras.length - 1)) * anchoUtil)
  const y = (porcentaje: number) =>
    margen.arriba + altoUtil - (Math.max(0, Math.min(100, porcentaje)) / 100) * altoUtil
  const linea = (puntos: { indice: number; porcentaje: number }[]) =>
    puntos.map((punto) => `${x(punto.indice)},${y(punto.porcentaje)}`).join(' ')

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Avance de obra</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar el avance.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Avance real contra programa</h1>
          <p className="subtitulo">
            Comparación al {formatearFecha(hoy)} · desviaciones y riesgo de plazo.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="avance-proyecto">
                  Obra
                </label>
                <select
                  id="avance-proyecto"
                  className="campo__control"
                  value={proyectoId}
                  onChange={(evento) => setProyectoId(evento.target.value)}
                >
                  {proyectos.map((proyecto) => (
                    <option key={proyecto.id} value={proyecto.id}>
                      {proyecto.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <span className="seccion__nota">
                El avance real usa únicamente avances validados.
              </span>
            </div>
          </section>

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : (
            <>
              <section className="rejilla-kpi">
                <article className="kpi">
                  <p className="kpi__etiqueta">Programado</p>
                  <p className="kpi__valor">{avanceProgramadoGlobal.toFixed(1)}%</p>
                  <p className="kpi__nota">Al día de hoy</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Real validado</p>
                  <p className="kpi__valor">{avanceRealGlobal.toFixed(1)}%</p>
                  <p className="kpi__nota">Avances aprobados</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Desviación</p>
                  <p className="kpi__valor">
                    {desviacionGlobal >= 0 ? '+' : ''}
                    {desviacionGlobal.toFixed(1)}%
                  </p>
                  <p className="kpi__nota">Real menos programado</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Actividades en riesgo</p>
                  <p className="kpi__valor">{enRiesgo.length}</p>
                  <p className="kpi__nota">Atrasadas o en riesgo</p>
                </article>
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Curva de avance</h2>
                    <p className="seccion__nota">
                      Avance acumulado programado contra el real validado.
                    </p>
                  </div>
                </div>

                {muestras.length === 0 ? (
                  <Vacio titulo="Sin programa">
                    Agrega actividades en Programa para generar la curva.
                  </Vacio>
                ) : (
                  <div className="avance-grafica">
                    <svg
                      viewBox={`0 0 ${ancho} ${alto}`}
                      role="img"
                      aria-label="Curva de avance programado contra real"
                    >
                      {[0, 25, 50, 75, 100].map((valor) => (
                        <g key={valor}>
                          <line
                            x1={margen.izquierda}
                            x2={ancho - margen.derecha}
                            y1={y(valor)}
                            y2={y(valor)}
                            className="avance-grafica__linea"
                          />
                          <text
                            x={margen.izquierda - 6}
                            y={y(valor) + 4}
                            textAnchor="end"
                            className="avance-grafica__texto"
                          >
                            {valor}%
                          </text>
                        </g>
                      ))}
                      <polyline
                        points={linea(puntosProgramado)}
                        className="avance-grafica__programado"
                      />
                      <polyline
                        points={linea(puntosReal)}
                        className="avance-grafica__real"
                      />
                      <text
                        x={margen.izquierda}
                        y={alto - 6}
                        className="avance-grafica__texto"
                      >
                        {formatearFecha(fechaMin)}
                      </text>
                      <text
                        x={ancho - margen.derecha}
                        y={alto - 6}
                        textAnchor="end"
                        className="avance-grafica__texto"
                      >
                        {formatearFecha(fechaMax)}
                      </text>
                    </svg>
                    <div className="avance-leyenda">
                      <span>
                        <i className="avance-leyenda__programado" /> Programado
                      </span>
                      <span>
                        <i className="avance-leyenda__real" /> Real validado
                      </span>
                    </div>
                  </div>
                )}
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Detalle por actividad</h2>
                    <p className="seccion__nota">
                      El fin proyectado usa el ritmo real de los avances validados.
                    </p>
                  </div>
                </div>

                {filas.length === 0 ? (
                  <Vacio titulo="Sin actividades">El programa está vacío.</Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Actividad</th>
                          <th scope="col">Programado</th>
                          <th scope="col">Real</th>
                          <th scope="col">Desviación</th>
                          <th scope="col">Fin plan</th>
                          <th scope="col">Fin proyectado</th>
                          <th scope="col">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map((fila) => (
                          <tr key={fila.actividad.id}>
                            <td>
                              <span className="celda-principal">
                                {fila.actividad.nombre}
                              </span>
                              <span className="celda-nota">
                                {formatearMoneda(
                                  Number(fila.actividad.cantidad) *
                                    Number(
                                      generadores.find(
                                        (generador: Generador) =>
                                          generador.id === fila.actividad.generador_id,
                                      )?.precio_unitario ?? 0,
                                    ),
                                )}
                              </span>
                            </td>
                            <td>{fila.programado.toFixed(1)}%</td>
                            <td>{fila.real.toFixed(1)}%</td>
                            <td>
                              {fila.desviacion >= 0 ? '+' : ''}
                              {fila.desviacion.toFixed(1)}%
                            </td>
                            <td>{formatearFecha(fila.actividad.fecha_fin)}</td>
                            <td>
                              {fila.finProyectado
                                ? formatearFecha(fila.finProyectado)
                                : 'Sin ritmo'}
                            </td>
                            <td>
                              <Insignia
                                tono={
                                  fila.estado === 'En tiempo'
                                    ? 'en_ejecucion'
                                    : fila.estado === 'Sin avance'
                                      ? 'tenue'
                                      : 'alerta'
                                }
                              >
                                {fila.estado}
                              </Insignia>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Riesgos de plazo</h2>
                    <p className="seccion__nota">
                      Actividades con desviación negativa o término proyectado fuera de
                      programa.
                    </p>
                  </div>
                </div>

                {enRiesgo.length === 0 ? (
                  <p className="seccion__nota">Sin riesgos detectados al día de hoy.</p>
                ) : (
                  <div className="programa-lista">
                    {enRiesgo.map((fila) => (
                      <article className="programa-actividad" key={fila.actividad.id}>
                        <div className="programa-actividad__cabecera">
                          <div>
                            <span className="celda-principal">
                              {fila.actividad.nombre}
                            </span>
                            <span className="celda-nota">
                              {fila.estado} · desviación {fila.desviacion.toFixed(1)}% ·{' '}
                              {fila.atraso > 0
                                ? `${fila.atraso} día(s) de atraso proyectado`
                                : 'sin atraso proyectado'}
                            </span>
                          </div>
                        </div>
                        <div className="programa-actividad__datos">
                          <span>
                            <strong>Fin plan:</strong>{' '}
                            {formatearFecha(fila.actividad.fecha_fin)}
                          </span>
                          <span>
                            <strong>Fin proyectado:</strong>{' '}
                            {fila.finProyectado
                              ? formatearFecha(fila.finProyectado)
                              : 'Sin ritmo suficiente'}
                          </span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
