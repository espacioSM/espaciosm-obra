import { Fragment, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useSesion } from '../sesion/SesionProvider'
import { puede } from '../lib/permisos'
import { tituloRol } from '../lib/formato'
import { NAVEGACION } from '../navegacion'

export function AppShell() {
  const { perfil, permisos, cerrarSesion } = useSesion()
  const [saliendo, setSaliendo] = useState(false)

  if (!perfil) return null

  const grupos = NAVEGACION.map((grupo) => ({
    titulo: grupo.titulo,
    items: grupo.items.filter((item) => {
      if (item.soloAdmin && perfil.rol !== 'admin') return false
      return puede(permisos, item.modulo, 'ver')
    }),
  })).filter((grupo) => grupo.items.length > 0)

  async function salir() {
    setSaliendo(true)
    await cerrarSesion()
  }

  return (
    <div className="app">
      <header className="barra">
        <Link to="/" className="marca" aria-label="espacioSM Obra, ir al resumen">
          <img
            className="marca__marca"
            src={`${import.meta.env.BASE_URL}marca-espaciosm.png`}
            alt=""
            aria-hidden="true"
          />
          <span className="marca__texto">
            espacio<span>S</span>M
          </span>
          <span className="marca__obra">Obra</span>
        </Link>

        <div className="usuario">
          <div className="usuario__datos">
            <span className="usuario__nombre">{perfil.nombre ?? perfil.email}</span>
            <span className="usuario__rol">{tituloRol[perfil.rol]}</span>
          </div>
          <button
            type="button"
            className="boton-salir"
            onClick={() => void salir()}
            disabled={saliendo}
          >
            {saliendo ? 'Saliendo…' : 'Salir'}
          </button>
        </div>
      </header>

      <div className="cuerpo">
        <aside className="lateral">
          <nav className="nav" aria-label="Navegación principal">
            {grupos.map((grupo) => (
              <Fragment key={grupo.titulo}>
                <div className="nav__grupo">{grupo.titulo}</div>
                {grupo.items.map((item) => (
                  <NavLink
                    key={item.ruta}
                    to={item.ruta}
                    end={item.ruta === '/'}
                    className={({ isActive }) =>
                      isActive ? 'nav__enlace activo' : 'nav__enlace'
                    }
                  >
                    <span>{item.etiqueta}</span>
                    {item.sprint ? (
                      <span className="nav__sprint">Sprint {item.sprint}</span>
                    ) : null}
                  </NavLink>
                ))}
              </Fragment>
            ))}

            <div className="nav__grupo">Cuenta</div>
            <NavLink
              to="/cuenta"
              className={({ isActive }) => (isActive ? 'nav__enlace activo' : 'nav__enlace')}
            >
              <span>Mi cuenta</span>
            </NavLink>
          </nav>
        </aside>

        <main className="contenido">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
