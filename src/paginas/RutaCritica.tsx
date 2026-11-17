import { useEffect, useState } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { listarActividadesPrograma, listarProyectos } from '../datos/consultas'
import type { ProgramaActividad } from '../lib/tipos'
import { formatearFecha } from '../lib/formato'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'

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

function sumarHabiles(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha)
  let restantes = dias
  while (restantes > 0) {
    resultado.setDate(resultado.getDate() + 1)
    if (esHabil(resultado)) restantes -= 1
  }
  return resultado
}

function restarHabiles(fecha: Date, dias: number): Date {
  const resultado = new Date(fecha)
  let restantes = dias
  while (restantes > 0) {
    resultado.setDate(resultado.getDate() - 1)
    if (esHabil(resultado)) restantes -= 1
  }
  return resultado
}

function diasHabilesEntre(inicio: Date, fin: Date): number {
  if (fin < inicio) return 0
  let dias = 0
  const cursor = new Date(inicio)
  while (cursor <= fin) {
    if (esHabil(cursor)) dias += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

type Nodo = {
  actividad: ProgramaActividad
  duracion: number
  predecesor: string | null
  sucesores: string[]
  inicioTemprano: Date
  finTemprano: Date
  inicioTardio: Date
  finTardio: Date
  holgura: number
  critica: boolean
}

export function RutaCritica() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarActividadesPrograma(proyectoId)),
    [proyectoId],
  )
  const actividades = consulta.datos ?? []
  const puedeVer = permisos.generadores?.ver === true

  let errorCalculo = ''
  const nodos = new Map<string, Nodo>()

  for (const actividad of actividades) {
    const duracion = Math.max(1, diasHabilesEntre(
      fechaLocal(actividad.fecha_inicio),
      fechaLocal(actividad.fecha_fin),
    ))
    nodos.set(actividad.id, {
      actividad,
      duracion,
      predecesor: actividad.depende_de_id,
      sucesores: [],
      inicioTemprano: fechaLocal(actividad.fecha_inicio),
      finTemprano: fechaLocal(actividad.fecha_fin),
      inicioTardio: fechaLocal(actividad.fecha_fin),
      finTardio: fechaLocal(actividad.fecha_fin),
      holgura: 0,
      critica: false,
    })
  }

  for (const nodo of nodos.values()) {
    if (nodo.predecesor && nodos.has(nodo.predecesor)) {
      nodos.get(nodo.predecesor)?.sucesores.push(nodo.actividad.id)
    }
  }

  const calculando = new Set<string>()
  const calculados = new Set<string>()

  function calcularTemprano(id: string): Nodo {
    const nodo = nodos.get(id)
    if (!nodo) throw new Error('Actividad no encontrada.')
    if (calculados.has(id)) return nodo
    if (calculando.has(id)) {
      throw new Error('Hay una dependencia circular en el programa.')
    }
    calculando.add(id)

    let inicio = fechaLocal(nodo.actividad.fecha_inicio)
    if (nodo.predecesor && nodos.has(nodo.predecesor)) {
      const predecesor = calcularTemprano(nodo.predecesor)
      inicio = siguienteHabil(sumarHabiles(predecesor.finTemprano, 1))
    }
    nodo.inicioTemprano = inicio
    nodo.finTemprano = sumarHabiles(inicio, nodo.duracion - 1)
    calculando.delete(id)
    calculados.add(id)
    return nodo
  }

  try {
    for (const nodo of nodos.values()) calcularTemprano(nodo.actividad.id)
  } catch (fallo) {
    errorCalculo = fallo instanceof Error ? fallo.message : 'No se pudo calcular la ruta.'
  }

  const finProyecto = Array.from(nodos.values()).reduce(
    (maximo, nodo) =>
      nodo.finTemprano.getTime() > maximo.getTime() ? nodo.finTemprano : maximo,
    new Date(0),
  )

  const calculandoTardio = new Set<string>()
  const calculadosTardio = new Set<string>()

  function calcularTardio(id: string): Nodo {
    const nodo = nodos.get(id)
    if (!nodo) throw new Error('Actividad no encontrada.')
    if (calculadosTardio.has(id)) return nodo
    if (calculandoTardio.has(id)) {
      throw new Error('Hay una dependencia circular en el programa.')
    }
    calculandoTardio.add(id)

    if (nodo.sucesores.length === 0) {
      nodo.finTardio = finProyecto
    } else {
      const inicios = nodo.sucesores.map(
        (sucesor) => calcularTardio(sucesor).inicioTardio,
      )
      const minimo = inicios.reduce(
        (min, fecha) => (fecha.getTime() < min.getTime() ? fecha : min),
        inicios[0],
      )
      nodo.finTardio = restarHabiles(minimo, 1)
    }

    nodo.inicioTardio = restarHabiles(nodo.finTardio, nodo.duracion - 1)
    nodo.holgura = Math.max(
      0,
      diasHabilesEntre(nodo.inicioTemprano, nodo.inicioTardio) - 1,
    )
    nodo.critica = nodo.holgura === 0
    calculandoTardio.delete(id)
    calculadosTardio.add(id)
    return nodo
  }

  try {
    for (const nodo of nodos.values()) calcularTardio(nodo.actividad.id)
  } catch (fallo) {
    errorCalculo = fallo instanceof Error ? fallo.message : 'No se pudo calcular la ruta.'
  }

  const lista = Array.from(nodos.values()).sort(
    (a, b) => a.inicioTemprano.getTime() - b.inicioTemprano.getTime(),
  )
  const criticas = lista.filter((nodo) => nodo.critica)

  const fechas = lista.flatMap((nodo) => [
    fechaLocal(nodo.actividad.fecha_inicio).getTime(),
    fechaLocal(nodo.actividad.fecha_fin).getTime(),
  ])
  const minimo = fechas.length > 0 ? Math.min(...fechas) : 0
  const maximo = fechas.length > 0 ? Math.max(...fechas) : 0
  const diasCalendario = Math.max(1, Math.round((maximo - minimo) / 86400000) + 1)

  const ancho = 980
  const altoFila = 34
  const margenSuperior = 54
  const margenInferior = 18
  const etiqueta = 230
  const margenDerecho = 22
  const anchoBarra = ancho - etiqueta - margenDerecho
  const alto = margenSuperior + lista.length * altoFila + margenInferior
  const x = (fecha: string) =>
    etiqueta + ((fechaLocal(fecha).getTime() - minimo) / 86400000 / diasCalendario) * anchoBarra

  const etiquetasMes: { x: number; texto: string }[] = []
  if (lista.length > 0) {
    const cursor = new Date(fechaLocal(isoLocal(new Date(minimo))))
    cursor.setDate(1)
    while (cursor.getTime() <= maximo) {
      if (cursor.getTime() >= minimo) {
        etiquetasMes.push({
          x: etiqueta + ((cursor.getTime() - minimo) / 86400000 / diasCalendario) * anchoBarra,
          texto: cursor.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }),
        })
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Ruta crítica</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar el programa.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Ruta crítica y Gantt</h1>
          <p className="subtitulo">
            Actividades con holgura cero, dependencias fin-inicio y diagrama de tiempos.
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
                <label className="campo__etiqueta" htmlFor="ruta-proyecto">
                  Obra
                </label>
                <select
                  id="ruta-proyecto"
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
                La ruta crítica se calcula con las duraciones y dependencias del programa.
              </span>
            </div>
          </section>

          {errorCalculo ? <Aviso tipo="error">{errorCalculo}</Aviso> : null}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : lista.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Sin programa">
                Agrega actividades y dependencias en Programa.
              </Vacio>
            </div>
          ) : (
            <>
              <section className="rejilla-kpi">
                <article className="kpi">
                  <p className="kpi__etiqueta">Actividades</p>
                  <p className="kpi__valor">{lista.length}</p>
                  <p className="kpi__nota">En el programa</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Actividades críticas</p>
                  <p className="kpi__valor">{criticas.length}</p>
                  <p className="kpi__nota">Holgura cero</p>
                </article>
                <article className="kpi">
                  <p className="kpi__etiqueta">Fin del programa</p>
                  <p className="kpi__valor">
                    {finProyecto.getTime() > 0 ? formatearFecha(isoLocal(finProyecto)) : '—'}
                  </p>
                  <p className="kpi__nota">Según ruta calculada</p>
                </article>
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Diagrama Gantt</h2>
                    <p className="seccion__nota">
                      Barras amarillas: actividades críticas. Barras grises: con holgura.
                    </p>
                  </div>
                </div>

                <div className="gantt-cpm">
                  <svg
                    viewBox={`0 0 ${ancho} ${alto}`}
                    role="img"
                    aria-label="Diagrama Gantt con ruta crítica"
                  >
                    {etiquetasMes.map((etiquetaMes) => (
                      <g key={`${etiquetaMes.x}-${etiquetaMes.texto}`}>
                        <line
                          x1={etiquetaMes.x}
                          x2={etiquetaMes.x}
                          y1={margenSuperior - 18}
                          y2={alto - margenInferior}
                          className="gantt-cpm__malla"
                        />
                        <text
                          x={etiquetaMes.x + 3}
                          y={margenSuperior - 24}
                          className="gantt-cpm__fecha"
                        >
                          {etiquetaMes.texto}
                        </text>
                      </g>
                    ))}

                    {lista.map((nodo, indice) => {
                      const y = margenSuperior + indice * altoFila
                      const inicio = x(nodo.actividad.fecha_inicio)
                      const fin = x(nodo.actividad.fecha_fin)
                      return (
                        <g key={nodo.actividad.id}>
                          <text
                            x={0}
                            y={y + 21}
                            className="gantt-cpm__nombre"
                          >
                            {nodo.actividad.nombre.length > 34
                              ? `${nodo.actividad.nombre.slice(0, 33)}…`
                              : nodo.actividad.nombre}
                          </text>
                          <rect
                            x={etiqueta}
                            y={y + 4}
                            width={anchoBarra}
                            height={altoFila - 8}
                            className="gantt-cpm__fondo"
                          />
                          <rect
                            x={inicio}
                            y={y + 5}
                            width={Math.max(3, fin - inicio + 2)}
                            height={altoFila - 10}
                            rx={4}
                            className={
                              nodo.critica
                                ? 'gantt-cpm__barra gantt-cpm__barra--critica'
                                : 'gantt-cpm__barra'
                            }
                          />
                          {indice < lista.length - 1 ? (
                            <line
                              x1={0}
                              x2={ancho}
                              y1={y + altoFila}
                              y2={y + altoFila}
                              className="gantt-cpm__separador"
                            />
                          ) : null}
                        </g>
                      )
                    })}

                    {lista.map((nodo, indice) => {
                      if (!nodo.predecesor || !nodos.has(nodo.predecesor)) return null
                      const predecesor = nodos.get(nodo.predecesor)
                      if (!predecesor) return null
                      const indicePredecesor = lista.findIndex(
                        (item) => item.actividad.id === predecesor.actividad.id,
                      )
                      if (indicePredecesor < 0) return null
                      const x1 = x(predecesor.actividad.fecha_fin)
                      const y1 =
                        margenSuperior + indicePredecesor * altoFila + altoFila - 10
                      const x2 = x(nodo.actividad.fecha_inicio)
                      const y2 = margenSuperior + indice * altoFila + 10
                      const medio = Math.min(x2 - 4, Math.max(x1 + 6, (x1 + x2) / 2))
                      return (
                        <path
                          key={`flecha-${nodo.actividad.id}`}
                          d={`M ${x1} ${y1} H ${medio} V ${y2} H ${x2 - 3}`}
                          className="gantt-cpm__flecha"
                        />
                      )
                    })}
                  </svg>
                </div>
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Ruta crítica</h2>
                    <p className="seccion__nota">
                      Actividades que no pueden retrasarse sin mover el fin de obra.
                    </p>
                  </div>
                </div>

                {criticas.length === 0 ? (
                  <p className="seccion__nota">No se detectaron actividades críticas.</p>
                ) : (
                  <div className="programa-lista">
                    {criticas.map((nodo) => (
                      <article className="programa-actividad" key={nodo.actividad.id}>
                        <div className="programa-actividad__cabecera">
                          <div>
                            <span className="celda-principal">
                              {nodo.actividad.nombre}
                            </span>
                            <span className="celda-nota">
                              Inicio temprano {formatearFecha(isoLocal(nodo.inicioTemprano))} ·
                              Fin temprano {formatearFecha(isoLocal(nodo.finTemprano))} ·
                              Holgura 0 día(s)
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Holguras por actividad</h2>
                    <p className="seccion__nota">
                      Inicio y fin tempranos, tardíos y días de holgura.
                    </p>
                  </div>
                </div>

                <div className="tabla-marco">
                  <table className="tabla">
                    <thead>
                      <tr>
                        <th scope="col">Actividad</th>
                        <th scope="col">Duración</th>
                        <th scope="col">Inicio temprano</th>
                        <th scope="col">Fin temprano</th>
                        <th scope="col">Inicio tardío</th>
                        <th scope="col">Fin tardío</th>
                        <th scope="col">Holgura</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((nodo) => (
                        <tr key={nodo.actividad.id}>
                          <td>
                            {nodo.actividad.nombre}
                            {nodo.critica ? ' · crítica' : ''}
                          </td>
                          <td>{nodo.duracion} día(s)</td>
                          <td>{formatearFecha(isoLocal(nodo.inicioTemprano))}</td>
                          <td>{formatearFecha(isoLocal(nodo.finTemprano))}</td>
                          <td>{formatearFecha(isoLocal(nodo.inicioTardio))}</td>
                          <td>{formatearFecha(isoLocal(nodo.finTardio))}</td>
                          <td>{nodo.holgura} día(s)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
