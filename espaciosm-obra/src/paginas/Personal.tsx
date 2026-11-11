import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  actualizarEmpleado,
  crearEmpleado,
  darDeBajaEmpleado,
  listarEmpleados,
  listarProyectos,
  reactivarEmpleado,
} from '../datos/consultas'
import type { DatosEmpleado } from '../datos/consultas'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import { mensajeDeError } from '../lib/errores'
import {
  formatearFecha,
  formatearMoneda,
  hoyISO,
  tituloPeriodo,
} from '../lib/formato'
import { puede } from '../lib/permisos'
import type { Empleado, PeriodoPago } from '../lib/tipos'

const PERIODOS: PeriodoPago[] = ['mensual', 'quincenal', 'semanal', 'diario', 'por_hora']

export function Personal() {
  const { permisos } = useSesion()
  const puedeVer = puede(permisos, 'personal', 'ver')
  const puedeCrear = puede(permisos, 'personal', 'crear')
  const puedeEditar = puede(permisos, 'personal', 'editar')

  const { datos, cargando, error, recargar } = useDatos(async () => {
    const [proyectos, empleados] = await Promise.all([listarProyectos(), listarEmpleados()])
    return { proyectos, empleados }
  }, [])

  const [formulario, setFormulario] = useState<{ empleado: Empleado | null } | null>(null)
  const [proyectoFiltro, setProyectoFiltro] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [incluirBajas, setIncluirBajas] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [procesando, setProcesando] = useState<string | null>(null)

  const proyectos = datos?.proyectos ?? []
  const empleados = datos?.empleados ?? []

  const filtrados = empleados.filter((empleado) => {
    if (!incluirBajas && !empleado.activo) return false
    if (proyectoFiltro !== '' && empleado.proyecto_id !== proyectoFiltro) return false
    if (busqueda.trim() !== '') {
      const texto = busqueda.trim().toLowerCase()
      const nombre = empleado.nombre.toLowerCase()
      const puesto = (empleado.puesto ?? '').toLowerCase()
      if (!nombre.includes(texto) && !puesto.includes(texto)) return false
    }
    return true
  })

  function nombreProyecto(id: string): string {
    return proyectos.find((proyecto) => proyecto.id === id)?.nombre ?? 'Obra no disponible'
  }

  async function alternarBaja(empleado: Empleado) {
    if (empleado.activo) {
      if (
        !window.confirm(
          `¿Dar de baja a ${empleado.nombre}? Se conserva su historial de asistencia y deja de aparecer en las listas activas.`,
        )
      ) {
        return
      }
    }

    setProcesando(empleado.id)
    setAviso(null)
    try {
      if (empleado.activo) {
        await darDeBajaEmpleado(empleado.id)
        setAviso(`${empleado.nombre} quedó dado de baja.`)
      } else {
        await reactivarEmpleado(empleado.id)
        setAviso(`${empleado.nombre} quedó reactivado.`)
      }
      recargar()
    } catch (fallo) {
      setAviso(mensajeDeError(fallo))
    } finally {
      setProcesando(null)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Personal</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar el personal.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Personal</h1>
          <p className="subtitulo">
            Altas, bajas y sueldos del personal por obra. La baja es lógica: conserva la
            asistencia histórica y se puede revertir.
          </p>
        </div>
        {puedeCrear && proyectos.length > 0 ? (
          <div className="acciones">
            <button
              type="button"
              className="boton boton--primario"
              onClick={() => {
                setAviso(null)
                setFormulario({ empleado: null })
              }}
            >
              Nuevo empleado
            </button>
          </div>
        ) : null}
      </div>

      {aviso ? <Aviso tipo="info">{aviso}</Aviso> : null}
      {error ? (
        <Aviso tipo="error">
          {error}{' '}
          <button type="button" className="boton boton--tenue" onClick={recargar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}

      {formulario ? (
        <FormularioEmpleado
          key={formulario.empleado?.id ?? 'nuevo'}
          empleado={formulario.empleado}
          proyectos={proyectos}
          onCancelar={() => setFormulario(null)}
          onGuardado={() => {
            setFormulario(null)
            setAviso('Personal guardado.')
            recargar()
          }}
        />
      ) : null}

      <section className="tarjeta tarjeta--plana">
        <div className="filtros">
          <div className="campo">
            <label className="campo__etiqueta" htmlFor="filtro-proyecto">
              Obra
            </label>
            <select
              id="filtro-proyecto"
              className="campo__control"
              value={proyectoFiltro}
              onChange={(evento) => setProyectoFiltro(evento.target.value)}
            >
              <option value="">Todas las obras</option>
              {proyectos.map((proyecto) => (
                <option key={proyecto.id} value={proyecto.id}>
                  {proyecto.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label className="campo__etiqueta" htmlFor="filtro-busqueda">
              Buscar
            </label>
            <input
              id="filtro-busqueda"
              className="campo__control"
              type="search"
              placeholder="Nombre o puesto"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </div>

          <label className="casilla">
            <input
              type="checkbox"
              checked={incluirBajas}
              onChange={(evento) => setIncluirBajas(evento.target.checked)}
            />
            Incluir bajas
          </label>

          <span className="seccion__nota">
            {filtrados.length} de {empleados.length} registros
          </span>
        </div>
      </section>

      {cargando && !datos ? (
        <Cargando />
      ) : proyectos.length === 0 ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="Primero da de alta una obra">
            El personal pertenece a una obra. Crea la obra en Proyectos y vuelve aquí.
          </Vacio>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="Sin resultados">
            Ajusta los filtros o da de alta al primer empleado de esta obra.
          </Vacio>
        </div>
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Obra</th>
                <th scope="col">Sueldo</th>
                <th scope="col">Ingreso</th>
                <th scope="col">Estado</th>
                <th scope="col" aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {filtrados.map((empleado) => (
                <tr key={empleado.id}>
                  <td>
                    <span className="celda-principal">{empleado.nombre}</span>
                    <span className="celda-nota">{empleado.puesto ?? 'Sin puesto'}</span>
                  </td>
                  <td>{nombreProyecto(empleado.proyecto_id)}</td>
                  <td>
                    {formatearMoneda(empleado.sueldo)}
                    <span className="celda-nota">{tituloPeriodo[empleado.periodo_pago]}</span>
                  </td>
                  <td>{formatearFecha(empleado.fecha_ingreso)}</td>
                  <td>
                    {empleado.activo ? (
                      <Insignia tono="en_ejecucion">Activo</Insignia>
                    ) : (
                      <Insignia tono="tenue">Baja</Insignia>
                    )}
                  </td>
                  <td>
                    {puedeEditar ? (
                      <div className="tabla__acciones">
                        <button
                          type="button"
                          className="boton"
                          onClick={() => {
                            setAviso(null)
                            setFormulario({ empleado })
                          }}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={empleado.activo ? 'boton boton--peligro' : 'boton'}
                          disabled={procesando === empleado.id}
                          onClick={() => void alternarBaja(empleado)}
                        >
                          {empleado.activo ? 'Dar de baja' : 'Reactivar'}
                        </button>
                      </div>
                    ) : (
                      <span className="seccion__nota">Solo consulta</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FormularioEmpleado({
  empleado,
  proyectos,
  onCancelar,
  onGuardado,
}: {
  empleado: Empleado | null
  proyectos: { id: string; nombre: string }[]
  onCancelar: () => void
  onGuardado: () => void
}) {
  const [proyectoId, setProyectoId] = useState(
    empleado?.proyecto_id ?? proyectos[0]?.id ?? '',
  )
  const [nombre, setNombre] = useState(empleado?.nombre ?? '')
  const [puesto, setPuesto] = useState(empleado?.puesto ?? '')
  const [sueldo, setSueldo] = useState(empleado ? String(empleado.sueldo) : '')
  const [periodo, setPeriodo] = useState<PeriodoPago>(empleado?.periodo_pago ?? 'diario')
  const [fechaIngreso, setFechaIngreso] = useState(empleado?.fecha_ingreso ?? hoyISO())
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    const importe = Number(sueldo)
    if (nombre.trim() === '') {
      setError('El nombre es obligatorio.')
      return
    }
    if (proyectoId === '') {
      setError('Selecciona la obra a la que pertenece.')
      return
    }
    if (!Number.isFinite(importe) || importe < 0) {
      setError('El sueldo debe ser un número mayor o igual a cero.')
      return
    }

    setEnviando(true)
    setError(null)

    const datos: DatosEmpleado = {
      proyecto_id: proyectoId,
      nombre: nombre.trim(),
      puesto: puesto.trim() === '' ? null : puesto.trim(),
      sueldo: Math.round(importe * 100) / 100,
      periodo_pago: periodo,
      fecha_ingreso: fechaIngreso,
    }

    try {
      if (empleado) {
        await actualizarEmpleado(empleado.id, {
          nombre: datos.nombre,
          puesto: datos.puesto,
          sueldo: datos.sueldo,
          periodo_pago: datos.periodo_pago,
          fecha_ingreso: datos.fecha_ingreso,
        })
      } else {
        await crearEmpleado(datos)
      }
      onGuardado()
    } catch (fallo) {
      setError(mensajeDeError(fallo))
      setEnviando(false)
    }
  }

  return (
    <section className="tarjeta">
      <div className="seccion__cabecera">
        <h2 className="seccion__titulo">
          {empleado ? 'Editar empleado' : 'Nuevo empleado'}
        </h2>
      </div>

      <form className="formulario" onSubmit={(evento) => void guardar(evento)}>
        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-proyecto">
            Obra
          </label>
          <select
            id="empleado-proyecto"
            className="campo__control"
            value={proyectoId}
            disabled={empleado !== null}
            onChange={(evento) => setProyectoId(evento.target.value)}
          >
            {proyectos.map((proyecto) => (
              <option key={proyecto.id} value={proyecto.id}>
                {proyecto.nombre}
              </option>
            ))}
          </select>
          {empleado ? (
            <span className="campo__ayuda">
              La obra no se cambia para no romper la asistencia ya registrada.
            </span>
          ) : null}
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-nombre">
            Nombre completo
          </label>
          <input
            id="empleado-nombre"
            className="campo__control"
            type="text"
            required
            maxLength={140}
            value={nombre}
            onChange={(evento) => setNombre(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-puesto">
            Puesto
          </label>
          <input
            id="empleado-puesto"
            className="campo__control"
            type="text"
            maxLength={100}
            value={puesto}
            onChange={(evento) => setPuesto(evento.target.value)}
            placeholder="Maestro de obra, oficial, ayudante"
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-sueldo">
            Sueldo (MXN)
          </label>
          <input
            id="empleado-sueldo"
            className="campo__control"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            value={sueldo}
            onChange={(evento) => setSueldo(evento.target.value)}
          />
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-periodo">
            Periodo del sueldo
          </label>
          <select
            id="empleado-periodo"
            className="campo__control"
            value={periodo}
            onChange={(evento) => setPeriodo(evento.target.value as PeriodoPago)}
          >
            {PERIODOS.map((valor) => (
              <option key={valor} value={valor}>
                {tituloPeriodo[valor]}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label className="campo__etiqueta" htmlFor="empleado-ingreso">
            Fecha de ingreso
          </label>
          <input
            id="empleado-ingreso"
            className="campo__control"
            type="date"
            required
            value={fechaIngreso}
            onChange={(evento) => setFechaIngreso(evento.target.value)}
          />
        </div>

        {error ? (
          <div className="campo--ancho">
            <Aviso tipo="error">{error}</Aviso>
          </div>
        ) : null}

        <div className="acciones campo--ancho">
          <button type="submit" className="boton boton--primario" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Guardar empleado'}
          </button>
          <button type="button" className="boton" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
  )
}
