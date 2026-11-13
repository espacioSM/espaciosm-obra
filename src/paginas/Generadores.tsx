import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  actualizarAvanceGenerador,
  actualizarGenerador,
  crearAvanceGenerador,
  crearGenerador,
  desactivarGenerador,
  listarAvancesGenerador,
  listarGeneradores,
  listarProyectos,
  validarAvanceGenerador,
} from '../datos/consultas'
import type { EstadoAvanceGenerador, Generador, GeneradorAvance } from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { subirEvidencia, urlEvidencia } from '../lib/evidencias'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'

export function Generadores() {
  const { sesion, perfil, permisos } = useSesion()
  const usuarioId = sesion?.user.id ?? null
  const proyectosConsulta = useDatos(listarProyectos, [])
  const proyectos = proyectosConsulta.datos ?? []
  const [proyectoId, setProyectoId] = useState('')

  useEffect(() => {
    if (proyectoId === '' && proyectos.length > 0) {
      setProyectoId(proyectos[0].id)
    }
  }, [proyectoId, proyectos])

  const consulta = useDatos(async () => {
    if (proyectoId === '') return { generadores: [], avances: [] }
    const [generadores, avances] = await Promise.all([
      listarGeneradores(proyectoId),
      listarAvancesGenerador(proyectoId),
    ])
    return { generadores, avances }
  }, [proyectoId])

  const generadores = consulta.datos?.generadores ?? []
  const avances = consulta.datos?.avances ?? []
  const puedeVer = permisos.generadores?.ver === true
  const puedeCrear = permisos.generadores?.crear === true
  const esGestor = perfil?.rol === 'admin' || perfil?.rol === 'permiso_medio'
  const esResidente = perfil?.rol === 'residente'
  const puedeCrearConcepto = esGestor && puedeCrear
  const puedeEditarConcepto = esGestor && permisos.generadores?.editar === true
  const puedeValidar = esGestor

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardandoGenerador, setGuardandoGenerador] = useState(false)
  const [guardandoAvance, setGuardandoAvance] = useState(false)

  const [clave, setClave] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [unidad, setUnidad] = useState('m2')
  const [cantidad, setCantidad] = useState('')
  const [precio, setPrecio] = useState('')
  const [rendimiento, setRendimiento] = useState('')
  const [cuadrillas, setCuadrillas] = useState('1')
  const [generadorEditandoId, setGeneradorEditandoId] = useState('')

  const [generadorId, setGeneradorId] = useState('')
  const [fecha, setFecha] = useState(hoyISO())
  const [modo, setModo] = useState<'dimensiones' | 'directa'>('dimensiones')
  const [nivel, setNivel] = useState('')
  const [eje, setEje] = useState('')
  const [tramo, setTramo] = useState('')
  const [frente, setFrente] = useState('')
  const [largo, setLargo] = useState('')
  const [ancho, setAncho] = useState('')
  const [alto, setAlto] = useState('')
  const [piezas, setPiezas] = useState('1')
  const [cantidadAvance, setCantidadAvance] = useState('')
  const [nota, setNota] = useState('')
  const [respuestaResidente, setRespuestaResidente] = useState('')
  const [avanceEditando, setAvanceEditando] = useState<GeneradorAvance | null>(null)
  const [fotoFiles, setFotoFiles] = useState<File[]>([])
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([])
  const [fotoPathsActuales, setFotoPathsActuales] = useState<string[]>([])
  const camaraRef = useRef<HTMLInputElement | null>(null)
  const galeriaRef = useRef<HTMLInputElement | null>(null)
  const formAvanceRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (generadores.length === 0) {
      setGeneradorId('')
      return
    }

    if (!generadores.some((generador) => generador.id === generadorId)) {
      setGeneradorId(generadores[0].id)
    }
  }, [generadores, generadorId])

  const ejecutadoPorGenerador = new Map<string, number>()
  const pendientePorGenerador = new Map<string, number>()
  for (const avance of avances) {
    if (avance.estado === 'validado') {
      ejecutadoPorGenerador.set(
        avance.generador_id,
        (ejecutadoPorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
      )
    } else if (avance.estado === 'enviado') {
      pendientePorGenerador.set(
        avance.generador_id,
        (pendientePorGenerador.get(avance.generador_id) ?? 0) + Number(avance.cantidad),
      )
    }
  }

  const filas = generadores.map((generador) => {
    const ejecutado = ejecutadoPorGenerador.get(generador.id) ?? 0
    const pendiente = pendientePorGenerador.get(generador.id) ?? 0
    const importe = Number(generador.cantidad) * Number(generador.precio_unitario)
    const importeEjecutado = ejecutado * Number(generador.precio_unitario)
    const porcentaje = importe > 0 ? (importeEjecutado / importe) * 100 : 0
    return { generador, ejecutado, pendiente, importe, importeEjecutado, porcentaje }
  })

  const contratado = filas.reduce((total, fila) => total + fila.importe, 0)
  const ejecutadoTotal = filas.reduce((total, fila) => total + fila.importeEjecutado, 0)
  const avanceGeneral = contratado > 0 ? (ejecutadoTotal / contratado) * 100 : 0
  const generadorSeleccionado = generadores.find(
    (generador) => generador.id === generadorId,
  )

  const largoNumero = Number(largo) || 0
  const anchoNumero = Number(ancho) || 0
  const altoNumero = Number(alto) || 0
  const piezasNumero = Number(piezas) || 1
  const cantidadDimensiones =
    altoNumero > 0
      ? largoNumero * anchoNumero * altoNumero * piezasNumero
      : largoNumero * anchoNumero * piezasNumero
  const cantidadFinal =
    modo === 'dimensiones' ? cantidadDimensiones : Number(cantidadAvance) || 0

  async function guardarGenerador(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (descripcion.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe la descripción del concepto.' })
      return
    }

    const cantidadNumero = Number(cantidad)
    const precioNumero = Number(precio)

    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }
    if (!Number.isFinite(precioNumero) || precioNumero < 0) {
      setAviso({ tipo: 'error', texto: 'El precio debe ser mayor o igual a cero.' })
      return
    }

    const rendimientoNumero = Number(rendimiento)
    if (!Number.isFinite(rendimientoNumero) || rendimientoNumero <= 0) {
      setAviso({
        tipo: 'error',
        texto: 'El rendimiento debe ser mayor que cero (unidad por día).',
      })
      return
    }

    const cuadrillasNumero = Number(cuadrillas)
    if (!Number.isFinite(cuadrillasNumero) || cuadrillasNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'Las cuadrillas deben ser mayores que cero.' })
      return
    }

    setGuardandoGenerador(true)
    setAviso(null)

    const datosConcepto = {
      clave: clave.trim() === '' ? null : clave.trim(),
      descripcion: descripcion.trim(),
      unidad: unidad.trim() === '' ? 'pieza' : unidad.trim(),
      cantidad: Math.round(cantidadNumero * 100) / 100,
      precioUnitario: Math.round(precioNumero * 100) / 100,
      rendimiento: Math.round(rendimientoNumero * 100) / 100,
      cuadrillas: Math.round(cuadrillasNumero * 100) / 100,
    }

    try {
      if (generadorEditandoId) {
        await actualizarGenerador(generadorEditandoId, datosConcepto)
        setAviso({ tipo: 'exito', texto: 'Concepto actualizado.' })
      } else {
        const generador = await crearGenerador({ proyectoId, ...datosConcepto })
        setGeneradorId(generador.id)
        setAviso({ tipo: 'exito', texto: 'Concepto agregado al generador.' })
      }
      setClave('')
      setDescripcion('')
      setCantidad('')
      setPrecio('')
      setRendimiento('')
      setCuadrillas('1')
      setGeneradorEditandoId('')
      consulta.recargar()
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoGenerador(false)
    }
  }

  function editarGenerador(generador: Generador) {
    setGeneradorEditandoId(generador.id)
    setClave(generador.clave ?? '')
    setDescripcion(generador.descripcion)
    setUnidad(generador.unidad)
    setCantidad(String(generador.cantidad))
    setPrecio(String(generador.precio_unitario))
    setRendimiento(String(generador.rendimiento))
    setCuadrillas(String(generador.cuadrillas))
    setAviso(null)
  }

  function cancelarEdicionGenerador() {
    setGeneradorEditandoId('')
    setClave('')
    setDescripcion('')
    setCantidad('')
    setPrecio('')
    setRendimiento('')
    setCuadrillas('1')
  }

  async function eliminarGenerador(generador: Generador) {
    if (
      !window.confirm(
        `¿Eliminar el concepto "${generador.descripcion}"? Dejará de aparecer, pero se conserva el historial.`,
      )
    ) {
      return
    }
    try {
      await desactivarGenerador(generador.id)
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Concepto eliminado del generador.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    }
  }

  async function guardarAvance(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (generadorId === '') {
      setAviso({ tipo: 'error', texto: 'Primero agrega un concepto al generador.' })
      return
    }

    if (!Number.isFinite(cantidadFinal) || cantidadFinal <= 0) {
      setAviso({
        tipo: 'error',
        texto:
          modo === 'dimensiones'
            ? 'Captura largo y ancho; si aplica, alto y piezas.'
            : 'La cantidad debe ser mayor que cero.',
      })
      return
    }

    setGuardandoAvance(true)
    setAviso(null)

    let fotoPaths = fotoPathsActuales

    try {
      if (fotoFiles.length > 0) {
        const proyecto = proyectos.find((item) => item.id === proyectoId)
        const sello = new Intl.DateTimeFormat('es-MX', {
          dateStyle: 'short',
          timeStyle: 'short',
          timeZone: 'America/Mexico_City',
        }).format(new Date())
        const ubicacion =
          [nivel, eje, tramo, frente].filter((valor) => valor.trim() !== '').join(' · ') ||
          'Sin ubicación'

        fotoPaths = []
        for (const archivo of fotoFiles.slice(0, 3)) {
          const ruta = await subirEvidencia(proyectoId, generadorId, archivo, [
            `espacioSM Obra · ${proyecto?.nombre ?? 'Proyecto'}`,
            sello,
            `Ubicación: ${ubicacion}`,
            `Concepto: ${generadorSeleccionado?.descripcion ?? 'Sin concepto'}`,
            `Cantidad: ${cantidadFinal.toFixed(2)} ${
              generadorSeleccionado?.unidad ?? ''
            }`,
          ])
          fotoPaths.push(ruta)
        }
      }

      const datos = {
        generadorId,
        fecha,
        cantidad: Math.round(cantidadFinal * 100) / 100,
        nivel: nivel.trim() === '' ? null : nivel.trim(),
        eje: eje.trim() === '' ? null : eje.trim(),
        tramo: tramo.trim() === '' ? null : tramo.trim(),
        frente: frente.trim() === '' ? null : frente.trim(),
        largo: largoNumero > 0 ? largoNumero : null,
        ancho: anchoNumero > 0 ? anchoNumero : null,
        alto: altoNumero > 0 ? altoNumero : null,
        piezas: piezasNumero > 0 ? piezasNumero : 1,
        estado: 'enviado' as const,
        observaciones: null,
        respuestaResidente:
          respuestaResidente.trim() === '' ? null : respuestaResidente.trim(),
        fotoPaths,
        nota: nota.trim() === '' ? null : nota.trim(),
        usuarioId,
      }

      if (avanceEditando) {
        await actualizarAvanceGenerador(avanceEditando.id, datos)
      } else {
        await crearAvanceGenerador(datos)
      }
      setAvanceEditando(null)
      setRespuestaResidente('')
      setCantidadAvance('')
      setLargo('')
      setAncho('')
      setAlto('')
      setPiezas('1')
      setNivel('')
      setEje('')
      setTramo('')
      setFrente('')
      setNota('')
      setFotoFiles([])
      setFotoPreviews([])
      setFotoPathsActuales([])
      consulta.recargar()
      setAviso({
        tipo: 'exito',
        texto: avanceEditando
          ? 'Avance corregido y reenviado a validación.'
          : 'Avance enviado para validación.',
      })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoAvance(false)
    }
  }

  function agregarFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const combinados = [...fotoFiles, ...Array.from(lista)].slice(0, 3)
    for (const preview of fotoPreviews) URL.revokeObjectURL(preview)
    setFotoFiles(combinados)
    setFotoPreviews(combinados.map((archivo) => URL.createObjectURL(archivo)))
  }

  function quitarFoto(indice: number) {
    const siguientes = fotoFiles.filter((_, posicion) => posicion !== indice)
    for (const preview of fotoPreviews) URL.revokeObjectURL(preview)
    setFotoFiles(siguientes)
    setFotoPreviews(siguientes.map((archivo) => URL.createObjectURL(archivo)))
  }

  function editarAvance(avance: GeneradorAvance) {    setAvanceEditando(avance)
    setGeneradorId(avance.generador_id)
    setFecha(avance.fecha)
    setNivel(avance.nivel ?? '')
    setEje(avance.eje ?? '')
    setTramo(avance.tramo ?? '')
    setFrente(avance.frente ?? '')
    setModo(avance.largo !== null || avance.ancho !== null ? 'dimensiones' : 'directa')
    setLargo(avance.largo === null ? '' : String(avance.largo))
    setAncho(avance.ancho === null ? '' : String(avance.ancho))
    setAlto(avance.alto === null ? '' : String(avance.alto))
    setPiezas(avance.piezas === null ? '1' : String(avance.piezas))
    setCantidadAvance(String(avance.cantidad))
    setNota(avance.nota ?? '')
    setRespuestaResidente(avance.respuesta_residente ?? '')
    setFotoPathsActuales(
      avance.foto_paths && avance.foto_paths.length > 0
        ? avance.foto_paths
        : avance.foto_path
          ? [avance.foto_path]
          : [],
    )
    setFotoFiles([])
    setFotoPreviews([])
    setAviso(null)
    window.setTimeout(() => {
      formAvanceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 100)
  }

  async function validarAvance(avanceId: string, estado: EstadoAvanceGenerador) {
    const observaciones =
      window.prompt(
        estado === 'validado'
          ? 'Observaciones de validación (opcional):'
          : 'Motivo del rechazo:',
        '',
      ) ?? ''
    if (estado === 'rechazado' && observaciones.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el motivo del rechazo.' })
      return
    }

    setAviso(null)
    try {
      await validarAvanceGenerador(avanceId, estado, observaciones)
      consulta.recargar()
      setAviso({
        tipo: 'exito',
        texto: estado === 'validado' ? 'Avance validado.' : 'Avance rechazado.',
      })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Generadores</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar generadores.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Generadores de obra</h1>
          <p className="subtitulo">
            Conceptos contratados, precios unitarios y avance ejecutado. Es la base
            para las estimaciones.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para consultar
            sus generadores.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="generadores-proyecto">
                  Obra
                </label>
                <select
                  id="generadores-proyecto"
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
                {generadores.length} conceptos · {avances.length} avances
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          <section className="rejilla-kpi">
            <article className="kpi">
              <p className="kpi__etiqueta">Conceptos</p>
              <p className="kpi__valor">{generadores.length}</p>
              <p className="kpi__nota">En el generador de esta obra</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Contratado</p>
              <p className="kpi__valor">{formatearMoneda(contratado)}</p>
              <p className="kpi__nota">Cantidad por precio unitario</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Ejecutado</p>
              <p className="kpi__valor">{formatearMoneda(ejecutadoTotal)}</p>
              <p className="kpi__nota">Avances acumulados</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Avance</p>
              <p className="kpi__valor">{avanceGeneral.toFixed(1)}%</p>
              <p className="kpi__nota">Importe ejecutado / contratado</p>
            </article>
          </section>

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : (
            <>
              {puedeCrearConcepto || puedeCrear ? (
                <div className="rejilla-dos">
                  {puedeCrearConcepto ? (
                    <section className="tarjeta">
                    <div className="seccion__cabecera">
                      <div>
                        <h2 className="seccion__titulo">
                          {generadorEditandoId ? 'Editar concepto' : 'Nuevo concepto'}
                        </h2>
                        <p className="seccion__nota">
                          Clave, descripción, unidad, cantidad, precio y rendimiento.
                        </p>
                      </div>
                      {generadorEditandoId ? (
                        <button
                          type="button"
                          className="boton"
                          onClick={cancelarEdicionGenerador}
                        >
                          Cancelar edición
                        </button>
                      ) : null}
                    </div>

                    <form
                      className="formulario"
                      onSubmit={(evento) => void guardarGenerador(evento)}
                    >
                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-clave">
                          Clave
                        </label>
                        <input
                          id="gen-clave"
                          className="campo__control"
                          value={clave}
                          onChange={(evento) => setClave(evento.target.value)}
                          placeholder="Opcional"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-unidad">
                          Unidad
                        </label>
                        <input
                          id="gen-unidad"
                          className="campo__control"
                          value={unidad}
                          onChange={(evento) => setUnidad(evento.target.value)}
                          placeholder="m2, m3, ml, pieza"
                        />
                      </div>

                      <div className="campo campo--ancho">
                        <label className="campo__etiqueta" htmlFor="gen-descripcion">
                          Descripción
                        </label>
                        <input
                          id="gen-descripcion"
                          className="campo__control"
                          value={descripcion}
                          onChange={(evento) => setDescripcion(evento.target.value)}
                          placeholder="Muro de block de concreto"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-cantidad">
                          Cantidad contratada
                        </label>
                        <input
                          id="gen-cantidad"
                          className="campo__control"
                          inputMode="decimal"
                          value={cantidad}
                          onChange={(evento) => setCantidad(evento.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-precio">
                          Precio unitario
                        </label>
                        <input
                          id="gen-precio"
                          className="campo__control"
                          inputMode="decimal"
                          value={precio}
                          onChange={(evento) => setPrecio(evento.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-rendimiento">
                          Rendimiento (unidades por día)
                        </label>
                        <input
                          id="gen-rendimiento"
                          className="campo__control"
                          inputMode="decimal"
                          value={rendimiento}
                          onChange={(evento) => setRendimiento(evento.target.value)}
                          placeholder="Ej. 12"
                        />
                        <span className="campo__ayuda">
                          Cuántas {unidad.trim() || 'unidades'} se ejecutan en un día. No
                          escribas días.
                        </span>
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="gen-cuadrillas">
                          Cuadrillas asignadas
                        </label>
                        <input
                          id="gen-cuadrillas"
                          className="campo__control"
                          inputMode="decimal"
                          value={cuadrillas}
                          onChange={(evento) => setCuadrillas(evento.target.value)}
                          placeholder="1"
                        />
                        <span className="campo__ayuda">
                          La duración se divide entre las cuadrillas.
                        </span>
                      </div>

                      <div className="acciones campo--ancho">
                        <button
                          type="submit"
                          className="boton boton--primario"
                          disabled={guardandoGenerador}
                        >
                          {guardandoGenerador
                            ? 'Guardando…'
                            : generadorEditandoId
                              ? 'Guardar cambios'
                              : 'Agregar concepto'}
                        </button>
                      </div>
                    </form>
                  </section>
                  ) : null}

                  <section className="tarjeta" ref={formAvanceRef}>
                    <div className="seccion__cabecera">
                      <div>
                        <h2 className="seccion__titulo">
                          {avanceEditando ? 'Corregir avance rechazado' : 'Registrar avance'}
                        </h2>
                        <p className="seccion__nota">
                          {avanceEditando
                            ? 'Corrige lo necesario y reenvía el mismo registro a validación.'
                            : 'Captura ubicación, dimensiones y cantidad ejecutada.'}
                        </p>
                      </div>
                    </div>

                    {avanceEditando?.observaciones ? (
                      <Aviso tipo="error">
                        Motivo del rechazo: {avanceEditando.observaciones}
                      </Aviso>
                    ) : null}

                    {generadores.length === 0 ? (
                      <Vacio titulo="Primero agrega un concepto">
                        El avance se registra contra un concepto del generador.
                      </Vacio>
                    ) : (
                      <form
                        className="formulario"
                        onSubmit={(evento) => void guardarAvance(evento)}
                      >
                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="av-generador">
                            Concepto
                          </label>
                          <select
                            id="av-generador"
                            className="campo__control"
                            value={generadorId}
                            onChange={(evento) => setGeneradorId(evento.target.value)}
                          >
                            {generadores.map((generador) => (
                              <option key={generador.id} value={generador.id}>
                                {generador.clave ? `${generador.clave} · ` : ''}
                                {generador.descripcion}
                              </option>
                            ))}
                          </select>
                          {generadorSeleccionado ? (
                            <span className="campo__ayuda">
                              Contratado: {Number(generadorSeleccionado.cantidad).toFixed(2)}{' '}
                              {generadorSeleccionado.unidad} · Validado:{' '}
                              {(
                                ejecutadoPorGenerador.get(generadorSeleccionado.id) ?? 0
                              ).toFixed(2)}{' '}
                              · Por validar:{' '}
                              {(
                                pendientePorGenerador.get(generadorSeleccionado.id) ?? 0
                              ).toFixed(2)}
                            </span>
                          ) : null}
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-fecha">
                            Fecha
                          </label>
                          <input
                            id="av-fecha"
                            className="campo__control"
                            type="date"
                            max={hoyISO()}
                            value={fecha}
                            onChange={(evento) => {
                              if (evento.target.value !== '') setFecha(evento.target.value)
                            }}
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-nivel">
                            Nivel
                          </label>
                          <input
                            id="av-nivel"
                            className="campo__control"
                            value={nivel}
                            onChange={(evento) => setNivel(evento.target.value)}
                            placeholder="PB, PA, Cimentación"
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-eje">
                            Eje
                          </label>
                          <input
                            id="av-eje"
                            className="campo__control"
                            value={eje}
                            onChange={(evento) => setEje(evento.target.value)}
                            placeholder="A, B, 1, 2"
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-tramo">
                            Tramo
                          </label>
                          <input
                            id="av-tramo"
                            className="campo__control"
                            value={tramo}
                            onChange={(evento) => setTramo(evento.target.value)}
                            placeholder="1-3, 2-4"
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="av-frente">
                            Frente
                          </label>
                          <input
                            id="av-frente"
                            className="campo__control"
                            value={frente}
                            onChange={(evento) => setFrente(evento.target.value)}
                            placeholder="Frente norte"
                          />
                        </div>

                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="av-modo">
                            Forma de captura
                          </label>
                          <select
                            id="av-modo"
                            className="campo__control"
                            value={modo}
                            onChange={(evento) =>
                              setModo(evento.target.value as 'dimensiones' | 'directa')
                            }
                          >
                            <option value="dimensiones">Por dimensiones</option>
                            <option value="directa">Cantidad directa</option>
                          </select>
                        </div>

                        {modo === 'dimensiones' ? (
                          <>
                            <div className="campo">
                              <label className="campo__etiqueta" htmlFor="av-largo">
                                Largo
                              </label>
                              <input
                                id="av-largo"
                                className="campo__control"
                                inputMode="decimal"
                                value={largo}
                                onChange={(evento) => setLargo(evento.target.value)}
                                placeholder="0.00"
                              />
                            </div>

                            <div className="campo">
                              <label className="campo__etiqueta" htmlFor="av-ancho">
                                Ancho
                              </label>
                              <input
                                id="av-ancho"
                                className="campo__control"
                                inputMode="decimal"
                                value={ancho}
                                onChange={(evento) => setAncho(evento.target.value)}
                                placeholder="0.00"
                              />
                            </div>

                            <div className="campo">
                              <label className="campo__etiqueta" htmlFor="av-alto">
                                Alto (opcional)
                              </label>
                              <input
                                id="av-alto"
                                className="campo__control"
                                inputMode="decimal"
                                value={alto}
                                onChange={(evento) => setAlto(evento.target.value)}
                                placeholder="0.00"
                              />
                            </div>

                            <div className="campo">
                              <label className="campo__etiqueta" htmlFor="av-piezas">
                                Piezas
                              </label>
                              <input
                                id="av-piezas"
                                className="campo__control"
                                inputMode="decimal"
                                value={piezas}
                                onChange={(evento) => setPiezas(evento.target.value)}
                                placeholder="1"
                              />
                            </div>

                            <div className="campo campo--ancho">
                              <span className="campo__etiqueta">Cantidad calculada</span>
                              <div className="campo__control campo__control--fijo">
                                {cantidadDimensiones.toFixed(2)}{' '}
                                {generadorSeleccionado?.unidad ?? ''}
                              </div>
                              <span className="campo__ayuda">
                                Largo × ancho × alto × piezas. Si dejas el alto en cero, se
                                calcula área.
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="campo campo--ancho">
                            <label className="campo__etiqueta" htmlFor="av-cantidad">
                              Cantidad ejecutada
                            </label>
                            <input
                              id="av-cantidad"
                              className="campo__control"
                              inputMode="decimal"
                              value={cantidadAvance}
                              onChange={(evento) => setCantidadAvance(evento.target.value)}
                              placeholder="0.00"
                            />
                          </div>
                        )}

                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="av-nota">
                            Nota
                          </label>
                          <input
                            id="av-nota"
                            className="campo__control"
                            value={nota}
                            onChange={(evento) => setNota(evento.target.value)}
                            placeholder="Turno, comentario o referencia"
                          />
                        </div>

                        {avanceEditando ? (
                          <div className="campo campo--ancho">
                            <label className="campo__etiqueta" htmlFor="av-respuesta">
                              Respuesta al rechazo
                            </label>
                            <textarea
                              id="av-respuesta"
                              className="campo__control"
                              rows={3}
                              value={respuestaResidente}
                              onChange={(evento) =>
                                setRespuestaResidente(evento.target.value)
                              }
                              placeholder="Explica qué corregiste"
                            />
                          </div>
                        ) : null}

                        <div className="campo campo--ancho">
                          <span className="campo__etiqueta">Foto de evidencia</span>
                          <input
                            ref={camaraRef}
                            className="entrada-oculta"
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={(evento) => {
                              agregarFotos(evento.target.files)
                              evento.target.value = ''
                            }}
                          />
                          <input
                            ref={galeriaRef}
                            className="entrada-oculta"
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(evento) => {
                              agregarFotos(evento.target.files)
                              evento.target.value = ''
                            }}
                          />
                          <div className="acciones">
                            <button
                              type="button"
                              className="boton"
                              disabled={fotoFiles.length >= 3}
                              onClick={() => camaraRef.current?.click()}
                            >
                              Tomar foto
                            </button>
                            <button
                              type="button"
                              className="boton"
                              disabled={fotoFiles.length >= 3}
                              onClick={() => galeriaRef.current?.click()}
                            >
                              Elegir de galería
                            </button>
                            <span className="seccion__nota">
                              {fotoFiles.length} de 3 fotos
                            </span>
                          </div>
                          <span className="campo__ayuda">
                            Puedes tomar una foto o elegir varias de la memoria, hasta 3.
                            La app agrega proyecto, fecha, ubicación y concepto sobre cada
                            una.
                          </span>
                          {fotoPreviews.length > 0 ? (
                            <div className="fotos-previas">
                              {fotoPreviews.map((preview, indice) => (
                                <div className="foto-previa-contenedor" key={preview}>
                                  <img
                                    className="foto-previa"
                                    src={preview}
                                    alt={`Vista previa ${indice + 1}`}
                                  />
                                  <button
                                    type="button"
                                    className="boton boton--peligro"
                                    onClick={() => quitarFoto(indice)}
                                  >
                                    Quitar
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {fotoPathsActuales.length > 0 && fotoFiles.length === 0 ? (
                            <span className="campo__ayuda">
                              Este avance ya tiene {fotoPathsActuales.length} foto(s). Si
                              eliges nuevas, se reemplazan.
                            </span>
                          ) : null}
                        </div>

                        <div className="acciones campo--ancho">
                          <button
                            type="submit"
                            className="boton boton--primario"
                            disabled={guardandoAvance}
                          >
                            {guardandoAvance
                              ? 'Guardando…'
                              : avanceEditando
                                ? 'Reenviar a validación'
                                : 'Enviar avance'}
                          </button>
                          {avanceEditando ? (
                            <button
                              type="button"
                              className="boton boton--tenue"
                              onClick={() => {
                                setAvanceEditando(null)
                                setRespuestaResidente('')
                              }}
                            >
                              Cancelar corrección
                            </button>
                          ) : null}
                        </div>
                      </form>
                    )}
                  </section>
                </div>
              ) : (
                <Aviso tipo="info">
                  Solo consulta. Los conceptos y avances los captura administración o
                  permiso medio.
                </Aviso>
              )}

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Conceptos</h2>
                    <p className="seccion__nota">
                      Importes y porcentaje de avance por concepto.
                    </p>
                  </div>
                </div>

                {filas.length === 0 ? (
                  <Vacio titulo="Generador vacío">
                    Agrega el primer concepto para medir el avance de la obra.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Clave</th>
                          <th scope="col">Concepto</th>
                          <th scope="col">Unidad</th>
                          <th scope="col">Contratado</th>
                          <th scope="col">P. unitario</th>
                          <th scope="col">Rendimiento</th>
                          <th scope="col">Importe</th>
                          <th scope="col">Ejecutado</th>
                          <th scope="col">Saldo</th>
                          <th scope="col">Avance</th>
                          {puedeEditarConcepto ? (
                            <th scope="col" aria-label="Acciones" />
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {filas.map(({ generador, ejecutado, importe, porcentaje }) => (
                          <tr key={generador.id}>
                            <td>{generador.clave ?? '—'}</td>
                            <td>
                              <span className="celda-principal">
                                {generador.descripcion}
                              </span>
                            </td>
                            <td>{generador.unidad}</td>
                            <td>{Number(generador.cantidad).toFixed(2)}</td>
                            <td>{formatearMoneda(Number(generador.precio_unitario))}</td>
                            <td>
                              {Number(generador.rendimiento) > 0
                                ? `${Number(generador.rendimiento).toFixed(2)} ${generador.unidad}/día · ${Number(generador.cuadrillas).toFixed(2)} cuadrilla(s)`
                                : '—'}
                            </td>
                            <td>{formatearMoneda(importe)}</td>
                            <td>{ejecutado.toFixed(2)}</td>
                            <td>
                              {(Number(generador.cantidad) - ejecutado).toFixed(2)}
                            </td>
                            <td>{porcentaje.toFixed(1)}%</td>
                            {puedeEditarConcepto ? (
                              <td>
                                <div className="tabla__acciones">
                                  <button
                                    type="button"
                                    className="boton"
                                    onClick={() => editarGenerador(generador)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="boton boton--peligro"
                                    onClick={() => void eliminarGenerador(generador)}
                                  >
                                    Eliminar
                                  </button>
                                </div>
                              </td>
                            ) : null}
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
                    <h2 className="seccion__titulo">Avances</h2>
                    <p className="seccion__nota">Registros que alimentan el porcentaje.</p>
                  </div>
                </div>

                {avances.length === 0 ? (
                  <Vacio titulo="Sin avances">
                    Registra el primer avance de un concepto.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Concepto</th>
                          <th scope="col">Ubicación</th>
                          <th scope="col">Foto</th>
                          <th scope="col">Cantidad</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Observaciones</th>
                          {puedeValidar || esResidente ? (
                            <th scope="col" aria-label="Acciones" />
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {avances.map((avance) => {
                          const generador = generadores.find(
                            (item) => item.id === avance.generador_id,
                          )
                          return (
                            <tr key={avance.id}>
                              <td>{formatearFecha(avance.fecha)}</td>
                              <td>
                                <span className="celda-principal">
                                  {generador?.descripcion ?? 'Concepto eliminado'}
                                </span>
                                <span className="celda-nota">
                                  {generador?.clave ?? ''}
                                </span>
                              </td>
                              <td>
                                {[avance.nivel, avance.eje, avance.tramo, avance.frente]
                                  .filter(Boolean)
                                  .join(' · ') || 'Sin ubicación'}
                              </td>
                              <td>
                                <div className="fotos-tabla">
                                  {(avance.foto_paths && avance.foto_paths.length > 0
                                    ? avance.foto_paths
                                    : avance.foto_path
                                      ? [avance.foto_path]
                                      : []
                                  ).map((ruta) => (
                                    <FotoAvance key={ruta} ruta={ruta} />
                                  ))}
                                </div>
                              </td>
                              <td>
                                {Number(avance.cantidad).toFixed(2)}{' '}
                                {generador?.unidad ?? ''}
                              </td>
                              <td>
                                <Insignia
                                  tono={
                                    avance.estado === 'validado'
                                      ? 'en_ejecucion'
                                      : avance.estado === 'rechazado'
                                        ? 'alerta'
                                        : avance.estado === 'enviado'
                                          ? 'alerta'
                                          : 'tenue'
                                  }
                                >
                                  {avance.estado === 'validado'
                                    ? 'Validado'
                                    : avance.estado === 'rechazado'
                                      ? 'Rechazado'
                                      : avance.estado === 'enviado'
                                        ? 'Por validar'
                                        : 'Borrador'}
                                </Insignia>
                              </td>
                              <td>
                                {avance.observaciones ? (
                                  <span className="celda-nota">
                                    Rechazo: {avance.observaciones}
                                  </span>
                                ) : null}
                                {avance.respuesta_residente ? (
                                  <span className="celda-nota">
                                    Respuesta: {avance.respuesta_residente}
                                  </span>
                                ) : null}
                                {!avance.observaciones &&
                                !avance.respuesta_residente &&
                                avance.nota
                                  ? avance.nota
                                  : null}
                                {!avance.observaciones &&
                                !avance.respuesta_residente &&
                                !avance.nota
                                  ? '—'
                                  : null}
                              </td>
                              {puedeValidar || esResidente ? (
                                <td>
                                  {puedeValidar && avance.estado === 'enviado' ? (
                                    <div className="tabla__acciones">
                                      <button
                                        type="button"
                                        className="boton boton--primario"
                                        onClick={() => void validarAvance(avance.id, 'validado')}
                                      >
                                        Validar
                                      </button>
                                      <button
                                        type="button"
                                        className="boton boton--peligro"
                                        onClick={() => void validarAvance(avance.id, 'rechazado')}
                                      >
                                        Rechazar
                                      </button>
                                    </div>
                                  ) : null}
                                  {esResidente && avance.estado === 'rechazado' ? (
                                    <button
                                      type="button"
                                      className="boton"
                                      onClick={() => editarAvance(avance)}
                                    >
                                      Corregir y reenviar
                                    </button>
                                  ) : null}
                                </td>
                              ) : null}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
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

function FotoAvance({ ruta }: { ruta: string | null }) {
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
      <img className="foto-miniatura" src={url} alt="Evidencia del avance" />
    </a>
  )
}
