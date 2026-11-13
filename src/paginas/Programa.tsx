import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  actualizarActividadPrograma,
  crearActividadPrograma,
  eliminarActividadPrograma,
  listarActividadesPrograma,
  listarAvancesGenerador,
  listarGeneradores,
  listarProyectos,
} from '../datos/consultas'
import type { Generador, ProgramaActividad } from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
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

function esDiaHabil(fecha: Date): boolean {
  return fecha.getDay() !== 0
}

function siguienteDiaHabil(fecha: Date): Date {
  const copia = new Date(fecha)
  while (!esDiaHabil(copia)) {
    copia.setDate(copia.getDate() + 1)
  }
  return copia
}

function sumarDiasHabiles(inicio: Date, dias: number): Date {
  const fecha = siguienteDiaHabil(new Date(inicio))
  let restantes = Math.max(1, dias) - 1
  while (restantes > 0) {
    fecha.setDate(fecha.getDate() + 1)
    if (esDiaHabil(fecha)) restantes -= 1
  }
  return fecha
}

function diasEntre(inicio: string, fin: string): number {
  const desde = fechaLocal(inicio)
  const hasta = fechaLocal(fin)
  let dias = 0
  const cursor = new Date(desde)
  while (cursor <= hasta) {
    if (esDiaHabil(cursor)) dias += 1
    cursor.setDate(cursor.getDate() + 1)
  }
  return dias
}

export function Programa() {
  const { permisos } = useSesion()
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const generadoresConsulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarGeneradores(proyectoId)),
    [proyectoId],
  )
  const generadores = generadoresConsulta.datos ?? []

  const consulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarActividadesPrograma(proyectoId)),
    [proyectoId],
  )
  const actividades = consulta.datos ?? []

  const avancesConsulta = useDatos(
    () => (proyectoId === '' ? Promise.resolve([]) : listarAvancesGenerador(proyectoId)),
    [proyectoId],
  )
  const avances = avancesConsulta.datos ?? []
  const validadoPorGenerador = new Map<string, number>()
  for (const avance of avances) {
    if (avance.estado !== 'validado') continue
    validadoPorGenerador.set(
      avance.generador_id,
      (validadoPorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
    )
  }

  const puedeEditar = permisos.generadores?.editar === true
  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)
  const [editandoId, setEditandoId] = useState('')
  const [generadorId, setGeneradorId] = useState('')
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [unidad, setUnidad] = useState('m2')
  const [rendimiento, setRendimiento] = useState('')
  const [cuadrillas, setCuadrillas] = useState('1')
  const [fechaInicio, setFechaInicio] = useState(hoyISO())
  const [dependeDeId, setDependeDeId] = useState('')
  const autoDependencia = useRef(true)

  useEffect(() => {
    if (
      autoDependencia.current &&
      !editandoId &&
      dependeDeId === '' &&
      actividades.length > 0
    ) {
      setDependeDeId(actividades[actividades.length - 1].id)
      autoDependencia.current = false
    }
  }, [actividades, editandoId, dependeDeId])

  function limpiarFormulario() {
    setEditandoId('')
    setGeneradorId('')
    setNombre('')
    setCantidad('')
    setUnidad('m2')
    setRendimiento('')
    setCuadrillas('1')
    setFechaInicio(hoyISO())
    setDependeDeId('')
    autoDependencia.current = true
  }

  function cargarGenerador(id: string) {
    setGeneradorId(id)
    const generador = generadores.find((item) => item.id === id)
    if (!generador) return
    setNombre(generador.descripcion)
    setCantidad(String(generador.cantidad))
    setUnidad(generador.unidad)
    if (Number(generador.rendimiento) > 0) {
      setRendimiento(String(generador.rendimiento))
    }
    setCuadrillas(String(generador.cuadrillas ?? 1))
  }

  function editar(actividad: ProgramaActividad) {
    setEditandoId(actividad.id)
    setGeneradorId(actividad.generador_id ?? '')
    setNombre(actividad.nombre)
    setCantidad(String(actividad.cantidad))
    setUnidad(actividad.unidad)
    setRendimiento(String(actividad.rendimiento))
    setCuadrillas(String(actividad.cuadrillas))
    setFechaInicio(actividad.fecha_inicio)
    setDependeDeId(actividad.depende_de_id ?? '')
  }

  function calcularFechas(
    inicio: string,
    cantidadNumero: number,
    rendimientoNumero: number,
    cuadrillasNumero: number,
    predecesor: ProgramaActividad | undefined,
  ): { inicio: string; fin: string } {
    let fecha = fechaLocal(inicio)
    if (predecesor) {
      fecha = siguienteDiaHabil(fechaLocal(predecesor.fecha_fin))
      if (fecha <= fechaLocal(predecesor.fecha_fin)) {
        fecha.setDate(fecha.getDate() + 1)
        fecha = siguienteDiaHabil(fecha)
      }
    }
    const dias = Math.max(
      1,
      Math.ceil(cantidadNumero / (rendimientoNumero * cuadrillasNumero)),
    )
    return {
      inicio: isoLocal(fecha),
      fin: isoLocal(sumarDiasHabiles(fecha, dias)),
    }
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const cantidadNumero = Number(cantidad)
    const rendimientoNumero = Number(rendimiento)
    if (nombre.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el nombre de la actividad.' })
      return
    }
    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }
    if (!Number.isFinite(rendimientoNumero) || rendimientoNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'El rendimiento debe ser mayor que cero.' })
      return
    }

    const cuadrillasNumero = Number(cuadrillas)
    if (!Number.isFinite(cuadrillasNumero) || cuadrillasNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'Las cuadrillas deben ser mayores que cero.' })
      return
    }

    const predecesor = actividades.find((item) => item.id === dependeDeId)
    const fechas = calcularFechas(
      fechaInicio,
      cantidadNumero,
      rendimientoNumero,
      cuadrillasNumero,
      predecesor,
    )

    setGuardando(true)
    setAviso(null)
    try {
      const datos = {
        proyectoId,
        generadorId: generadorId === '' ? null : generadorId,
        nombre: nombre.trim(),
        cantidad: Math.round(cantidadNumero * 100) / 100,
        unidad: unidad.trim() === '' ? 'pieza' : unidad.trim(),
        rendimiento: Math.round(rendimientoNumero * 100) / 100,
        cuadrillas: Math.round(cuadrillasNumero * 100) / 100,
        fechaInicio: fechas.inicio,
        fechaFin: fechas.fin,
        dependeDeId: dependeDeId === '' ? null : dependeDeId,
        orden: editandoId
          ? actividades.find((item) => item.id === editandoId)?.orden ?? 0
          : actividades.length,
      }

      if (editandoId) {
        await actualizarActividadPrograma(editandoId, datos)
      } else {
        await crearActividadPrograma(datos)
      }

      limpiarFormulario()
      consulta.recargar()
      setAviso({
        tipo: 'exito',
        texto: editandoId ? 'Actividad actualizada.' : 'Actividad agregada al programa.',
      })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  async function recalcular() {
    if (actividades.length === 0) return
    setGuardando(true)
    setAviso(null)

    try {
      const porId = new Map(actividades.map((actividad) => [actividad.id, actividad]))
      const calculadas = new Map<
        string,
        { inicio: string; fin: string; cantidad: number; rendimiento: number }
      >()

      function calcular(id: string, visitando: Set<string>): {
        inicio: string
        fin: string
        cantidad: number
        rendimiento: number
      } {
        const existente = calculadas.get(id)
        if (existente) return existente
        if (visitando.has(id)) throw new Error('Hay una dependencia circular en el programa.')
        visitando.add(id)

        const actividad = porId.get(id)
        if (!actividad) throw new Error('Actividad no encontrada.')

        const predecesor = actividad.depende_de_id
          ? calcular(actividad.depende_de_id, visitando)
          : null
        const fechas = calcularFechas(
          predecesor ? predecesor.fin : actividad.fecha_inicio,
          Number(actividad.cantidad),
          Number(actividad.rendimiento),
          Number(actividad.cuadrillas),
          predecesor
            ? ({
                ...actividad,
                fecha_fin: predecesor.fin,
              } as ProgramaActividad)
            : undefined,
        )
        const resultado = {
          inicio: fechas.inicio,
          fin: fechas.fin,
          cantidad: Number(actividad.cantidad),
          rendimiento: Number(actividad.rendimiento),
        }
        calculadas.set(id, resultado)
        visitando.delete(id)
        return resultado
      }

      for (const actividad of actividades) {
        calcular(actividad.id, new Set())
      }

      for (const actividad of actividades) {
        const calculada = calculadas.get(actividad.id)
        if (!calculada) continue
        await actualizarActividadPrograma(actividad.id, {
          proyectoId,
          generadorId: actividad.generador_id,
          nombre: actividad.nombre,
          cantidad: actividad.cantidad,
          unidad: actividad.unidad,
          rendimiento: actividad.rendimiento,
          cuadrillas: actividad.cuadrillas,
          fechaInicio: calculada.inicio,
          fechaFin: calculada.fin,
          dependeDeId: actividad.depende_de_id,
          orden: actividad.orden,
        })
      }

      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Programa recalculado.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  async function borrar(actividad: ProgramaActividad) {
    if (!window.confirm(`¿Eliminar la actividad "${actividad.nombre}"?`)) return
    try {
      await eliminarActividadPrograma(actividad.id)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Actividad eliminada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    }
  }

  const fechas = actividades.flatMap((actividad) => [
    fechaLocal(actividad.fecha_inicio).getTime(),
    fechaLocal(actividad.fecha_fin).getTime(),
  ])
  const minimo = fechas.length > 0 ? Math.min(...fechas) : 0
  const maximo = fechas.length > 0 ? Math.max(...fechas) : 0
  const rango = Math.max(1, maximo - minimo)
  const cantidadVista = Number(cantidad)
  const rendimientoVista = Number(rendimiento)
  const cuadrillasVista = Number(cuadrillas)
  const diasVista =
    Number.isFinite(cantidadVista) &&
    cantidadVista > 0 &&
    Number.isFinite(rendimientoVista) &&
    rendimientoVista > 0 &&
    Number.isFinite(cuadrillasVista) &&
    cuadrillasVista > 0
      ? Math.max(
          1,
          Math.ceil(cantidadVista / (rendimientoVista * cuadrillasVista)),
        )
      : 0
  const predecesorForm = actividades.find((actividad) => actividad.id === dependeDeId)
  const fechasForm =
    diasVista > 0
      ? calcularFechas(
          fechaInicio,
          cantidadVista,
          rendimientoVista,
          Number(cuadrillas),
          predecesorForm,
        )
      : null

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Programa de obra</h1>
          <p className="subtitulo">
            Actividades por concepto, rendimiento y duración automática. Dependencias
            fin-inicio.
          </p>
        </div>
        <div className="acciones">
          <button
            type="button"
            className="boton"
            onClick={() => void recalcular()}
            disabled={guardando || actividades.length === 0}
          >
            Recalcular programa
          </button>
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
                <label className="campo__etiqueta" htmlFor="programa-proyecto">
                  Obra
                </label>
                <select
                  id="programa-proyecto"
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
                La duración se calcula con días de lunes a sábado.
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : (
            <>
              {puedeEditar ? (
                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">
                        {editandoId ? 'Editar actividad' : 'Nueva actividad'}
                      </h2>
                      <p className="seccion__nota">
                        Al elegir un generador se cargan cantidad, unidad y rendimiento.
                      </p>
                    </div>
                    {editandoId ? (
                      <button type="button" className="boton" onClick={limpiarFormulario}>
                        Cancelar edición
                      </button>
                    ) : null}
                  </div>

                  <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
                    <div className="campo campo--ancho">
                      <label className="campo__etiqueta" htmlFor="programa-generador">
                        Concepto del generador
                      </label>
                      <select
                        id="programa-generador"
                        className="campo__control"
                        value={generadorId}
                        onChange={(evento) => cargarGenerador(evento.target.value)}
                      >
                        <option value="">Actividad libre</option>
                        {generadores.map((generador: Generador) => (
                          <option key={generador.id} value={generador.id}>
                            {generador.clave ? `${generador.clave} · ` : ''}
                            {generador.descripcion}
                          </option>
                        ))}
                      </select>
                      <span className="campo__ayuda">
                        Para que el avance real se calcule automáticamente, elige un
                        concepto. Una actividad libre no recibe avances.
                      </span>
                    </div>

                    <div className="campo campo--ancho">
                      <label className="campo__etiqueta" htmlFor="programa-nombre">
                        Nombre de la actividad
                      </label>
                      <input
                        id="programa-nombre"
                        className="campo__control"
                        value={nombre}
                        onChange={(evento) => setNombre(evento.target.value)}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="programa-cantidad">
                        Cantidad
                      </label>
                      <input
                        id="programa-cantidad"
                        className="campo__control"
                        inputMode="decimal"
                        value={cantidad}
                        onChange={(evento) => setCantidad(evento.target.value)}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="programa-unidad">
                        Unidad
                      </label>
                      <input
                        id="programa-unidad"
                        className="campo__control"
                        value={unidad}
                        onChange={(evento) => setUnidad(evento.target.value)}
                      />
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="programa-rendimiento">
                        Rendimiento ({unidad.trim() || 'unidad'}/día)
                      </label>
                      <input
                        id="programa-rendimiento"
                        className="campo__control"
                        inputMode="decimal"
                        value={rendimiento}
                        onChange={(evento) => setRendimiento(evento.target.value)}
                        placeholder="Ej. 12"
                      />
                      <span className="campo__ayuda">
                        Cuántas {unidad.trim() || 'unidades'} se hacen en un día. No
                        escribas días.
                      </span>
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="programa-cuadrillas">
                        Cuadrillas asignadas
                      </label>
                      <input
                        id="programa-cuadrillas"
                        className="campo__control"
                        inputMode="decimal"
                        value={cuadrillas}
                        onChange={(evento) => setCuadrillas(evento.target.value)}
                        placeholder="1"
                      />
                      <span className="campo__ayuda">
                        Más cuadrillas reducen la duración.
                      </span>
                    </div>

                    <div className="campo">
                      <label className="campo__etiqueta" htmlFor="programa-inicio">
                        Fecha de inicio
                      </label>
                      <input
                        id="programa-inicio"
                        className="campo__control"
                        type="date"
                        value={fechaInicio}
                        onChange={(evento) => {
                          if (evento.target.value !== '') setFechaInicio(evento.target.value)
                        }}
                      />
                    </div>

                    <div className="campo campo--ancho">
                      <label className="campo__etiqueta" htmlFor="programa-depende">
                        Depende de
                      </label>
                      <select
                        id="programa-depende"
                        className="campo__control"
                        value={dependeDeId}
                        onChange={(evento) => setDependeDeId(evento.target.value)}
                      >
                        <option value="">Sin dependencia</option>
                        {actividades
                          .filter((actividad) => actividad.id !== editandoId)
                          .map((actividad) => (
                            <option key={actividad.id} value={actividad.id}>
                              {actividad.nombre}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="acciones campo--ancho">
                      <span className="seccion__nota">
                        {diasVista > 0 && fechasForm ? (
                          <>
                            Duración estimada: {diasVista} día(s) hábiles (
                            {cantidadVista.toFixed(2)} {unidad.trim() || 'unidad'} ÷{' '}
                            {rendimientoVista.toFixed(2)} por día ×{' '}
                            {cuadrillasVista.toFixed(2)} cuadrilla(s)).
                            <br />
                            Inicio: {formatearFecha(fechasForm.inicio)} · Fin:{' '}
                            {formatearFecha(fechasForm.fin)}
                            {predecesorForm
                              ? ` · Después de "${predecesorForm.nombre}".`
                              : ''}
                          </>
                        ) : (
                          'Captura cantidad y rendimiento para calcular la duración.'
                        )}
                      </span>
                    </div>

                    <div className="acciones campo--ancho">
                      <button
                        type="submit"
                        className="boton boton--primario"
                        disabled={guardando}
                      >
                        {guardando
                          ? 'Guardando…'
                          : editandoId
                            ? 'Guardar cambios'
                            : 'Agregar actividad'}
                      </button>
                    </div>
                  </form>
                </section>
              ) : null}

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Conceptos, importes y avance</h2>
                    <p className="seccion__nota">
                      Avance real con avances validados sobre la cantidad contratada.
                    </p>
                  </div>
                </div>

                {generadores.length === 0 ? (
                  <Vacio titulo="Sin conceptos">
                    Agrega conceptos al generador para ver importes y avance.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Concepto</th>
                          <th scope="col">Importe</th>
                          <th scope="col">Avance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generadores.map((generador: Generador) => {
                          const ejecutado = validadoPorGenerador.get(generador.id) ?? 0
                          const cantidadContratada = Number(generador.cantidad)
                          const importe =
                            cantidadContratada * Number(generador.precio_unitario)
                          const porcentaje =
                            cantidadContratada > 0
                              ? (ejecutado / cantidadContratada) * 100
                              : 0
                          return (
                            <tr key={generador.id}>
                              <td>
                                <span className="celda-principal">
                                  {generador.clave ? `${generador.clave} · ` : ''}
                                  {generador.descripcion}
                                </span>
                              </td>
                              <td>{formatearMoneda(importe)}</td>
                              <td>{porcentaje.toFixed(1)}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Actividades programadas</h2>
                    <p className="seccion__nota">
                      {actividades.length} actividad(es) · duración en días laborables.
                    </p>
                  </div>
                </div>

                {actividades.length === 0 ? (
                  <Vacio titulo="Sin programa">
                    Agrega la primera actividad para generar el programa de obra.
                  </Vacio>
                ) : (
                  <div className="programa-lista">
                    {actividades.map((actividad) => {
                      const predecesor = actividades.find(
                        (item) => item.id === actividad.depende_de_id,
                      )
                      const ancho =
                        rango > 0
                          ? ((fechaLocal(actividad.fecha_fin).getTime() -
                              fechaLocal(actividad.fecha_inicio).getTime()) /
                              rango) *
                            100
                          : 0
                      const desplazamiento =
                        rango > 0
                          ? ((fechaLocal(actividad.fecha_inicio).getTime() - minimo) /
                              rango) *
                            100
                          : 0
                      return (
                        <article className="programa-actividad" key={actividad.id}>
                          <div className="programa-actividad__cabecera">
                            <div>
                              <span className="celda-principal">{actividad.nombre}</span>
                              <span className="celda-nota">
                                {Number(actividad.cantidad).toFixed(2)}{' '}
                                {actividad.unidad} ·{' '}
                                {Number(actividad.rendimiento).toFixed(2)}{' '}
                                {actividad.unidad}/día ·{' '}
                                {Number(actividad.cuadrillas).toFixed(2)} cuadrilla(s) ·{' '}
                                {diasEntre(actividad.fecha_inicio, actividad.fecha_fin)}{' '}
                                día(s)
                              </span>
                            </div>
                            {puedeEditar ? (
                              <div className="acciones">
                                <button
                                  type="button"
                                  className="boton"
                                  onClick={() => editar(actividad)}
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  className="boton boton--peligro"
                                  onClick={() => void borrar(actividad)}
                                >
                                  Eliminar
                                </button>
                              </div>
                            ) : null}
                          </div>

                          <div className="programa-actividad__datos">
                            <span>
                              <strong>Inicio:</strong>{' '}
                              {formatearFecha(actividad.fecha_inicio)}
                            </span>
                            <span>
                              <strong>Fin:</strong>{' '}
                              {formatearFecha(actividad.fecha_fin)}
                            </span>
                            <span>
                              <strong>Depende de:</strong>{' '}
                              {predecesor?.nombre ?? 'Sin dependencia'}
                            </span>
                          </div>

                          <div className="gantt">
                            <div
                              className="gantt__barra"
                              style={{
                                marginLeft: `${Math.max(0, desplazamiento)}%`,
                                width: `${Math.max(3, ancho)}%`,
                              }}
                            />
                          </div>
                        </article>
                      )
                    })}
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
