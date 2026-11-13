import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useSesion } from '../sesion/SesionProvider'
import { useDatos } from '../lib/useDatos'
import {
  crearMaterial,
  crearMovimientoMaterial,
  listarCatalogoMateriales,
  listarMateriales,
  listarMovimientosMaterial,
  listarProyectos,
} from '../datos/consultas'
import type { MaterialCatalogo, TipoMovimientoMaterial } from '../lib/tipos'
import { formatearFecha, formatearMoneda, hoyISO } from '../lib/formato'
import { mensajeDeError } from '../lib/errores'
import { Aviso } from '../componentes/Aviso'
import { Cargando, Vacio } from '../componentes/Estados'
import { Insignia } from '../componentes/Insignias'

const CATEGORIA: Record<string, string> = {
  cimentacion_y_concreto: 'Cimentación y concreto',
  acero_y_refuerzo: 'Acero y refuerzo',
  albanileria: 'Albañilería',
  cimbra_y_madera: 'Cimbra y madera',
  acabados: 'Acabados',
  instalacion_hidrosanitaria: 'Hidrosanitaria',
  instalacion_electrica: 'Eléctrica',
}

export function Materiales() {
  const { sesion, permisos } = useSesion()
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
    if (proyectoId === '') return { proyectoId: '', materiales: [], movimientos: [] }
    const [materiales, movimientos] = await Promise.all([
      listarMateriales(proyectoId),
      listarMovimientosMaterial(proyectoId),
    ])
    return { proyectoId, materiales, movimientos }
  }, [proyectoId])

  const materiales = consulta.datos?.materiales ?? []
  const movimientos = consulta.datos?.movimientos ?? []
  const datosProyectoId = consulta.datos?.proyectoId ?? ''
  const catalogoConsulta = useDatos(listarCatalogoMateriales, [])
  const catalogo = catalogoConsulta.datos ?? []
  const puedeVer = permisos.materiales?.ver === true
  const puedeCrear = permisos.materiales?.crear === true

  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [agregandoCatalogo, setAgregandoCatalogo] = useState<string | null>(null)
  const codigosExistentes = new Set(
    materiales.map((material) => material.catalogo_id).filter(Boolean),
  )

  const [aviso, setAviso] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(
    null,
  )
  const [guardandoMaterial, setGuardandoMaterial] = useState(false)
  const [guardandoMovimiento, setGuardandoMovimiento] = useState(false)

  const [nombreMaterial, setNombreMaterial] = useState('')
  const [unidad, setUnidad] = useState('pieza')
  const [costoMaterial, setCostoMaterial] = useState('')
  const [stockMinimo, setStockMinimo] = useState('0')

  const [materialId, setMaterialId] = useState('')
  const [tipo, setTipo] = useState<TipoMovimientoMaterial>('entrada')
  const [fecha, setFecha] = useState(hoyISO())
  const [cantidad, setCantidad] = useState('')
  const [costoMovimiento, setCostoMovimiento] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [nota, setNota] = useState('')
  const movimientoRef = useRef<HTMLElement | null>(null)
  const cantidadRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setMaterialId('')
    setCostoMovimiento('')
    setCantidad('')
  }, [proyectoId])

  useEffect(() => {
    if (datosProyectoId !== proyectoId) return

    if (materiales.length === 0) {
      setMaterialId('')
      return
    }

    if (materialId === '') {
      const primero = materiales[0]
      setMaterialId(primero.id)
      setCostoMovimiento(String(primero.costo_unitario))
    }
  }, [datosProyectoId, proyectoId, materiales, materialId])

  const nombres = new Map(materiales.map((material) => [material.id, material]))
  const stock = materiales.map((material) => {
    const existencia = movimientos
      .filter((movimiento) => movimiento.material_id === material.id)
      .reduce(
        (total, movimiento) =>
          total +
          (movimiento.tipo === 'entrada'
            ? Number(movimiento.cantidad)
            : -Number(movimiento.cantidad)),
        0,
      )

    return { material, existencia }
  })

  const compras = movimientos
    .filter((movimiento) => movimiento.tipo === 'entrada')
    .reduce(
      (total, movimiento) =>
        total + Number(movimiento.cantidad) * Number(movimiento.costo_unitario),
      0,
    )

  const consumos = movimientos
    .filter((movimiento) => movimiento.tipo === 'salida')
    .reduce(
      (total, movimiento) =>
        total + Number(movimiento.cantidad) * Number(movimiento.costo_unitario),
      0,
    )

  const stockBajo = stock.filter(
    ({ material, existencia }) => existencia <= Number(material.stock_minimo),
  ).length

  const catalogoFiltrado = catalogo.filter((material) => {
    const texto = busquedaCatalogo.trim().toLowerCase()
    if (texto === '') return true
    return [
      material.nombre,
      material.especificacion ?? '',
      material.categoria,
      material.codigo,
    ]
      .join(' ')
      .toLowerCase()
      .includes(texto)
  })

  function enfocarMovimiento(id: string, costo: number) {
    setMaterialId(id)
    setCostoMovimiento(costo === 0 ? '' : String(costo))
    setTipo('entrada')
    setAviso({
      tipo: 'exito',
      texto: 'Material listo. Captura cantidad y costo en Registrar movimiento.',
    })
    window.setTimeout(() => {
      movimientoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      cantidadRef.current?.focus()
    }, 150)
  }

  async function agregarDesdeCatalogo(material: MaterialCatalogo) {
    if (codigosExistentes.has(material.codigo)) {
      usarMaterial(material.codigo)
      return
    }
    setAgregandoCatalogo(material.codigo)
    setAviso(null)

    try {
      const creado = await crearMaterial({
        proyectoId,
        nombre: material.nombre,
        unidad: material.unidad,
        costoUnitario: Number(material.precio_referencia ?? 0),
        stockMinimo: 0,
        catalogoId: material.codigo,
        especificacion: material.especificacion,
        presentacion: material.presentacion,
      })
      consulta.recargar()
      enfocarMovimiento(creado.id, Number(creado.costo_unitario))
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setAgregandoCatalogo(null)
    }
  }

  function usarMaterial(codigo: string) {
    const material = materiales.find((item) => item.catalogo_id === codigo)
    if (!material) return
    enfocarMovimiento(material.id, Number(material.costo_unitario))
  }

  async function guardarMaterial(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (nombreMaterial.trim() === '') {
      setAviso({ tipo: 'error', texto: 'Escribe el nombre del material.' })
      return
    }

    const costo = Number(costoMaterial)
    const minimo = Number(stockMinimo)

    if (!Number.isFinite(costo) || costo < 0) {
      setAviso({ tipo: 'error', texto: 'El costo debe ser un número mayor o igual a cero.' })
      return
    }
    if (!Number.isFinite(minimo) || minimo < 0) {
      setAviso({ tipo: 'error', texto: 'El mínimo debe ser un número mayor o igual a cero.' })
      return
    }

    setGuardandoMaterial(true)
    setAviso(null)

    try {
      const material = await crearMaterial({
        proyectoId,
        nombre: nombreMaterial.trim(),
        unidad: unidad.trim() === '' ? 'pieza' : unidad.trim(),
        costoUnitario: Math.round(costo * 100) / 100,
        stockMinimo: Math.round(minimo * 100) / 100,
      })
      setNombreMaterial('')
      setUnidad('pieza')
      setCostoMaterial('')
      setStockMinimo('0')
      setMaterialId(material.id)
      setCostoMovimiento(String(material.costo_unitario))
      consulta.recargar()
      setAviso({ tipo: 'exito', texto: 'Material agregado al catálogo.' })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoMaterial(false)
    }
  }

  async function guardarMovimiento(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()

    if (materialId === '') {
      setAviso({ tipo: 'error', texto: 'Primero agrega un material al catálogo.' })
      return
    }

    const cantidadNumero = Number(cantidad)
    const costoNumero = Number(costoMovimiento)

    if (!Number.isFinite(cantidadNumero) || cantidadNumero <= 0) {
      setAviso({ tipo: 'error', texto: 'La cantidad debe ser mayor que cero.' })
      return
    }
    if (!Number.isFinite(costoNumero) || costoNumero < 0) {
      setAviso({ tipo: 'error', texto: 'El costo debe ser un número mayor o igual a cero.' })
      return
    }

    setGuardandoMovimiento(true)
    setAviso(null)

    try {
      await crearMovimientoMaterial({
        materialId,
        tipo,
        fecha,
        cantidad: Math.round(cantidadNumero * 100) / 100,
        costoUnitario: Math.round(costoNumero * 100) / 100,
        proveedor: proveedor.trim() === '' ? null : proveedor.trim(),
        nota: nota.trim() === '' ? null : nota.trim(),
        usuarioId,
      })
      setCantidad('')
      setProveedor('')
      setNota('')
      consulta.recargar()
      setAviso({
        tipo: 'exito',
        texto: tipo === 'entrada' ? 'Entrada registrada.' : 'Salida registrada.',
      })
    } catch (fallo) {
      setAviso({ tipo: 'error', texto: mensajeDeError(fallo) })
    } finally {
      setGuardandoMovimiento(false)
    }
  }

  if (!puedeVer) {
    return (
      <div className="pagina">
        <h1 className="titulo">Materiales</h1>
        <Aviso tipo="error">Tu rol no tiene permiso para consultar materiales.</Aviso>
      </div>
    )
  }

  return (
    <div className="pagina">
      <div className="pagina__cabecera">
        <div>
          <h1 className="titulo">Materiales</h1>
          <p className="subtitulo">
            Entradas, salidas y existencias por obra. El residente captura su obra;
            administración y permiso medio consultan todo.
          </p>
        </div>
      </div>

      {proyectosConsulta.error ? (
        <Aviso tipo="error">{proyectosConsulta.error}</Aviso>
      ) : null}

      {proyectos.length === 0 && !proyectosConsulta.cargando ? (
        <div className="tarjeta tarjeta--plana">
          <Vacio titulo="No tienes obras asignadas">
            Pide al administrador que te agregue al equipo de una obra para capturar
            materiales.
          </Vacio>
        </div>
      ) : (
        <>
          <section className="tarjeta tarjeta--plana">
            <div className="filtros">
              <div className="campo">
                <label className="campo__etiqueta" htmlFor="materiales-proyecto">
                  Obra
                </label>
                <select
                  id="materiales-proyecto"
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
                {movimientos.length} movimientos · {materiales.length} materiales
              </span>
            </div>
          </section>

          {aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null}

          <section className="rejilla-kpi">
            <article className="kpi">
              <p className="kpi__etiqueta">Materiales</p>
              <p className="kpi__valor">{materiales.length}</p>
              <p className="kpi__nota">En el catálogo de esta obra</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Compras</p>
              <p className="kpi__valor">{formatearMoneda(compras)}</p>
              <p className="kpi__nota">Total de entradas</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Consumos</p>
              <p className="kpi__valor">{formatearMoneda(consumos)}</p>
              <p className="kpi__nota">Total de salidas</p>
            </article>
            <article className="kpi">
              <p className="kpi__etiqueta">Stock bajo</p>
              <p className="kpi__valor">{stockBajo}</p>
              <p className="kpi__nota">Materiales en o bajo el mínimo</p>
            </article>
          </section>

          <section className="tarjeta tarjeta--plana">
            <div className="seccion__cabecera">
              <div>
                <h2 className="seccion__titulo">Catálogo de proveedor</h2>
                <p className="seccion__nota">
                  Materiales comunes precargados. Al agregar, se abre Registrar movimiento
                  con el material y el precio de referencia; ahí capturas cantidad y costo
                  real. El enlace abre Home Depot.
                </p>
              </div>
              <span className="seccion__nota">
                {catalogoFiltrado.length} de {catalogo.length}
              </span>
            </div>

            <div className="campo">
              <label className="campo__etiqueta" htmlFor="catalogo-busqueda">
                Buscar material
              </label>
              <input
                id="catalogo-busqueda"
                className="campo__control"
                type="search"
                value={busquedaCatalogo}
                onChange={(evento) => setBusquedaCatalogo(evento.target.value)}
                placeholder="Cemento, block, varilla, pintura…"
              />
            </div>

            {catalogoFiltrado.length === 0 ? (
              <Vacio titulo="Sin coincidencias">
                Prueba con otro nombre, categoría o código.
              </Vacio>
            ) : (
              <div className="tabla-marco">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th scope="col">Material</th>
                      <th scope="col">Unidad</th>
                      <th scope="col">Precio referencia</th>
                      <th scope="col">Proveedor</th>
                      <th scope="col" aria-label="Acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {catalogoFiltrado.map((material) => {
                      const existente = codigosExistentes.has(material.codigo)
                      return (
                        <tr key={material.codigo}>
                          <td>
                            <span className="celda-principal">{material.nombre}</span>
                            <span className="celda-nota">
                              {CATEGORIA[material.categoria] ?? material.categoria}
                              {material.especificacion
                                ? ` · ${material.especificacion}`
                                : ''}
                              {material.presentacion
                                ? ` · ${material.presentacion}`
                                : ''}
                            </span>
                          </td>
                          <td>{material.unidad}</td>
                          <td>
                            {material.precio_referencia === null
                              ? 'Sin precio'
                              : formatearMoneda(Number(material.precio_referencia))}
                          </td>
                          <td>
                            {material.url ? (
                              <a
                                className="boton boton--tenue"
                                href={material.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Home Depot
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {existente ? (
                              <button
                                type="button"
                                className="boton"
                                onClick={() => usarMaterial(material.codigo)}
                              >
                                Usar
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="boton"
                                disabled={agregandoCatalogo !== null}
                                onClick={() => void agregarDesdeCatalogo(material)}
                              >
                                {agregandoCatalogo === material.codigo
                                  ? 'Agregando…'
                                  : 'Agregar y capturar'}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {consulta.cargando && !consulta.datos ? (
            <Cargando />
          ) : (
            <>
              <div className="rejilla-dos">
                <section className="tarjeta" ref={movimientoRef}>
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Registrar movimiento</h2>
                      <p className="seccion__nota">
                        Entrada al recibir material; salida al usarlo en la obra.
                      </p>
                    </div>
                  </div>

                  {puedeCrear ? (
                    materiales.length === 0 ? (
                      <Vacio titulo="Primero agrega un material">
                        Usa el formulario de la derecha para crear el primer material del
                        catálogo.
                      </Vacio>
                    ) : (
                      <form
                        className="formulario"
                        onSubmit={(evento) => void guardarMovimiento(evento)}
                      >
                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="mov-material">
                            Material
                          </label>
                          <select
                            id="mov-material"
                            className="campo__control"
                            value={materialId}
                            onChange={(evento) => {
                              const id = evento.target.value
                              setMaterialId(id)
                              const material = nombres.get(id)
                              if (material) {
                                setCostoMovimiento(String(material.costo_unitario))
                              }
                            }}
                          >
                            {materiales.map((material) => (
                              <option key={material.id} value={material.id}>
                                {material.nombre} ({material.unidad})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="mov-tipo">
                            Tipo
                          </label>
                          <select
                            id="mov-tipo"
                            className="campo__control"
                            value={tipo}
                            onChange={(evento) =>
                              setTipo(evento.target.value as TipoMovimientoMaterial)
                            }
                          >
                            <option value="entrada">Entrada</option>
                            <option value="salida">Salida</option>
                          </select>
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="mov-fecha">
                            Fecha
                          </label>
                          <input
                            id="mov-fecha"
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
                          <label className="campo__etiqueta" htmlFor="mov-cantidad">
                            Cantidad
                          </label>
                          <input
                            id="mov-cantidad"
                            ref={cantidadRef}
                            className="campo__control"
                            inputMode="decimal"
                            value={cantidad}
                            onChange={(evento) => setCantidad(evento.target.value)}
                            placeholder="0.00"
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="mov-costo">
                            Costo unitario
                          </label>
                          <input
                            id="mov-costo"
                            className="campo__control"
                            inputMode="decimal"
                            value={costoMovimiento}
                            onChange={(evento) => setCostoMovimiento(evento.target.value)}
                            placeholder="0.00"
                          />
                        </div>

                        <div className="campo">
                          <label className="campo__etiqueta" htmlFor="mov-proveedor">
                            Proveedor
                          </label>
                          <input
                            id="mov-proveedor"
                            className="campo__control"
                            value={proveedor}
                            onChange={(evento) => setProveedor(evento.target.value)}
                            placeholder="Opcional"
                          />
                        </div>

                        <div className="campo campo--ancho">
                          <label className="campo__etiqueta" htmlFor="mov-nota">
                            Nota
                          </label>
                          <input
                            id="mov-nota"
                            className="campo__control"
                            value={nota}
                            onChange={(evento) => setNota(evento.target.value)}
                            placeholder="Factura, frente de trabajo o comentario"
                          />
                        </div>

                        <div className="acciones campo--ancho">
                          <button
                            type="submit"
                            className="boton boton--primario"
                            disabled={guardandoMovimiento}
                          >
                            {guardandoMovimiento ? 'Guardando…' : 'Guardar movimiento'}
                          </button>
                        </div>
                      </form>
                    )
                  ) : (
                    <p className="seccion__nota">Solo consulta.</p>
                  )}
                </section>

                <section className="tarjeta">
                  <div className="seccion__cabecera">
                    <div>
                      <h2 className="seccion__titulo">Catálogo</h2>
                      <p className="seccion__nota">
                        Agrega materiales con su unidad y costo de referencia.
                      </p>
                    </div>
                  </div>

                  {puedeCrear ? (
                    <form
                      className="formulario"
                      onSubmit={(evento) => void guardarMaterial(evento)}
                    >
                      <div className="campo campo--ancho">
                        <label className="campo__etiqueta" htmlFor="mat-nombre">
                          Nombre del material
                        </label>
                        <input
                          id="mat-nombre"
                          className="campo__control"
                          value={nombreMaterial}
                          onChange={(evento) => setNombreMaterial(evento.target.value)}
                          placeholder="Cemento gris"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="mat-unidad">
                          Unidad
                        </label>
                        <input
                          id="mat-unidad"
                          className="campo__control"
                          value={unidad}
                          onChange={(evento) => setUnidad(evento.target.value)}
                          placeholder="bulto, m3, pieza"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="mat-costo">
                          Costo unitario
                        </label>
                        <input
                          id="mat-costo"
                          className="campo__control"
                          inputMode="decimal"
                          value={costoMaterial}
                          onChange={(evento) => setCostoMaterial(evento.target.value)}
                          placeholder="0.00"
                        />
                      </div>

                      <div className="campo">
                        <label className="campo__etiqueta" htmlFor="mat-minimo">
                          Stock mínimo
                        </label>
                        <input
                          id="mat-minimo"
                          className="campo__control"
                          inputMode="decimal"
                          value={stockMinimo}
                          onChange={(evento) => setStockMinimo(evento.target.value)}
                          placeholder="0"
                        />
                      </div>

                      <div className="acciones campo--ancho">
                        <button
                          type="submit"
                          className="boton boton--primario"
                          disabled={guardandoMaterial}
                        >
                          {guardandoMaterial ? 'Guardando…' : 'Agregar material'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="seccion__nota">Solo consulta.</p>
                  )}
                </section>
              </div>

              <section className="tarjeta tarjeta--plana">
                <div className="seccion__cabecera">
                  <div>
                    <h2 className="seccion__titulo">Existencias</h2>
                    <p className="seccion__nota">
                      Entradas menos salidas. El mínimo se define en el catálogo.
                    </p>
                  </div>
                </div>

                {stock.length === 0 ? (
                  <Vacio titulo="Catálogo vacío">
                    Agrega el primer material para empezar a controlar existencias.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Material</th>
                          <th scope="col">Unidad</th>
                          <th scope="col">Existencia</th>
                          <th scope="col">Mínimo</th>
                          <th scope="col">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stock.map(({ material, existencia }) => {
                          const bajo = existencia <= Number(material.stock_minimo)
                          return (
                            <tr key={material.id}>
                              <td>
                                <span className="celda-principal">{material.nombre}</span>
                                <span className="celda-nota">
                                  {material.especificacion ?? material.unidad}
                                </span>
                              </td>
                              <td>{material.unidad}</td>
                              <td>{existencia.toFixed(2)}</td>
                              <td>{Number(material.stock_minimo).toFixed(2)}</td>
                              <td>
                                {bajo ? (
                                  <Insignia tono="alerta">Stock bajo</Insignia>
                                ) : (
                                  <Insignia tono="en_ejecucion">Suficiente</Insignia>
                                )}
                              </td>
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
                    <h2 className="seccion__titulo">Movimientos</h2>
                    <p className="seccion__nota">Entradas y salidas registradas.</p>
                  </div>
                </div>

                {movimientos.length === 0 ? (
                  <Vacio titulo="Sin movimientos">
                    Registra la primera entrada de material.
                  </Vacio>
                ) : (
                  <div className="tabla-marco">
                    <table className="tabla">
                      <thead>
                        <tr>
                          <th scope="col">Fecha</th>
                          <th scope="col">Tipo</th>
                          <th scope="col">Material</th>
                          <th scope="col">Cantidad</th>
                          <th scope="col">Costo unitario</th>
                          <th scope="col">Total</th>
                          <th scope="col">Proveedor</th>
                          <th scope="col">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((movimiento) => {
                          const material = nombres.get(movimiento.material_id)
                          const total =
                            Number(movimiento.cantidad) * Number(movimiento.costo_unitario)
                          return (
                            <tr key={movimiento.id}>
                              <td>{formatearFecha(movimiento.fecha)}</td>
                              <td>
                                <Insignia
                                  tono={
                                    movimiento.tipo === 'entrada' ? 'en_ejecucion' : 'tenue'
                                  }
                                >
                                  {movimiento.tipo === 'entrada' ? 'Entrada' : 'Salida'}
                                </Insignia>
                              </td>
                              <td>
                                <span className="celda-principal">
                                  {material?.nombre ?? 'Material eliminado'}
                                </span>
                                <span className="celda-nota">
                                  {material?.unidad ?? ''}
                                </span>
                              </td>
                              <td>
                                {Number(movimiento.cantidad).toFixed(2)}{' '}
                                {material?.unidad ?? ''}
                              </td>
                              <td>{formatearMoneda(Number(movimiento.costo_unitario))}</td>
                              <td>{formatearMoneda(total)}</td>
                              <td>{movimiento.proveedor ?? '—'}</td>
                              <td>{movimiento.nota ?? '—'}</td>
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
