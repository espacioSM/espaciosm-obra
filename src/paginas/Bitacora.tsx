import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { crearEntradaBitacora, listarBitacora, listarProyectos } from '../datos/consultas'
import { formatearFecha, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { subirEvidencia } from '../lib/evidencias'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { FotoEvidencia } from '../componentes/FotoEvidencia'

export function Bitacora() {
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
    () => (proyectoId === '' ? Promise.resolve([]) : listarBitacora(proyectoId)),
    [proyectoId],
  )
  const entradas = consulta.datos ?? []
  const puedeVer = permisos.bitacora?.ver === true
  const puedeCrear = permisos.bitacora?.crear === true

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardando, setGuardando] = useState(false)
  const [fecha, setFecha] = useState(hoyISO())
  const [titulo, setTitulo] = useState('')
  const [contenido, setContenido] = useState('')
  const [fotoFiles, setFotoFiles] = useState<File[]>([])
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([])
  const camaraRef = useRef<HTMLInputElement | null>(null)
  const galeriaRef = useRef<HTMLInputElement | null>(null)

  function agregarFotos(lista: FileList | null) {
    if (!lista || lista.length === 0) return
    const siguientes = [...fotoFiles, ...Array.from(lista)].slice(0, 3)
    for (const preview of fotoPreviews) URL.revokeObjectURL(preview)
    setFotoFiles(siguientes)
    setFotoPreviews(siguientes.map((archivo) => URL.createObjectURL(archivo)))
  }

  function quitarFoto(indice: number) {
    const siguientes = fotoFiles.filter((_, posicion) => posicion !== indice)
    for (const preview of fotoPreviews) URL.revokeObjectURL(preview)
    setFotoFiles(siguientes)
    setFotoPreviews(siguientes.map((archivo) => URL.createObjectURL(archivo)))
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (titulo.trim() === '' || contenido.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Captura título y contenido.' })
      return
    }

    setGuardando(true)
    setAviso(null)

    try {
      const proyecto = proyectos.find((item) => item.id === proyectoId)
      const fotoPaths: string[] = []

      for (const archivo of fotoFiles.slice(0, 3)) {
        const ruta = await subirEvidencia(proyectoId, 'bitacora', archivo, [
          `espacioSM Obra · ${proyecto?.nombre ?? 'Proyecto'}`,
          `${formatearFecha(fecha)} · Bitácora`,
          titulo.trim(),
        ])
        fotoPaths.push(ruta)
      }

      await crearEntradaBitacora({
        proyectoId,
        fecha,
        titulo: titulo.trim(),
        contenido: contenido.trim(),
        fotoPaths,
      })

      setTitulo('')
      setContenido('')
      setFotoFiles([])
      setFotoPreviews([])
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Entrada de bitácora guardada.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardando(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Bitácora</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar la bitácora.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Bitácora de obra</h1>
          <p className="subtitulo">
            Notas diarias, visitas e incidencias, con hasta tres fotos por entrada.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para escribir
            en su bitácora.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="bitacora-proyecto">
                  Obra
                </label>
                <select
                  id="bitacora-proyecto"
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

              <span className="seccion__nota">{entradas.length} entradas</span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          {puedeCrear ? (
            <section className="tarjeta">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Nueva entrada</h2>
                  <p className="seccion__nota">
                    Describe lo ocurrido en la obra y adjunta evidencia si aplica.
                  </p>
                </div>
              </div>

              <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
                <div className="campo">
                  <label className="campo__etiqueta" htmlFor="bitacora-fecha">
                    Fecha
                  </label>
                  <input
                    id="bitacora-fecha"
                    className="campo__control"
                    type="date"
                    max={hoyISO()}
                    value={fecha}
                    onChange={(evento) => {
                      if (evento.target.value !== '') setFecha(evento.target.value)
                    }}
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="bitacora-titulo">
                    Título
                  </label>
                  <input
                    id="bitacora-titulo"
                    className="campo__control"
                    value={titulo}
                    onChange={(evento) => setTitulo(evento.target.value)}
                    placeholder="Colado de losa, visita de supervisión…"
                  />
                </div>

                <div className="campo campo--ancho">
                  <label className="campo__etiqueta" htmlFor="bitacora-contenido">
                    Contenido
                  </label>
                  <textarea
                    id="bitacora-contenido"
                    className="campo__control"
                    rows={4}
                    value={contenido}
                    onChange={(evento) => setContenido(evento.target.value)}
                    placeholder="Trabajos realizados, personal, incidencias y acuerdos."
                  />
                </div>

                <div className="campo campo--ancho">
                  <span className="campo__etiqueta">Fotos</span>
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
                    <span className="seccion__nota">{fotoFiles.length} de 3 fotos</span>
                  </div>
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
                </div>

                <div className="acciones campo--ancho">
                  <button
                    type="submit"
                    className="boton boton--primario"
                    disabled={guardando}
                  >
                    {guardando ? 'Guardando…' : 'Guardar entrada'}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : entradas.length === 0 ? (
            <div className="tarjeta tarjeta--plana">
              <Vacio titulo="Bitácora vacía">
                La primera entrada aparecerá aquí.
              </Vacio>
            </div>
          ) : (
            <section className="tarjeta tarjeta--plana">
              <div className="seccion__cabecera">
                <div>
                  <h2 className="seccion__titulo">Entradas</h2>
                  <p className="seccion__nota">De la más reciente a la más antigua.</p>
                </div>
              </div>

              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Título</th>
                      <th scope="col">Contenido</th>
                      <th scope="col">Fotos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entradas.map((entrada) => (
                      <tr key={entrada.id}>
                        <td>{formatearFecha(entrada.fecha)}</td>
                        <td>
                          <span className="celda-principal">{entrada.titulo}</span>
                        </td>
                        <td>{entrada.contenido}</td>
                        <td>
                          <div className="fotos-tabla">
                            {entrada.foto_paths.map((ruta) => (
                              <FotoEvidencia key={ruta} ruta={ruta} />
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
