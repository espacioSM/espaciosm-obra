import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { configuracionLista } from './lib/supabase'
import { SesionProvider } from './sesion/SesionProvider'
import { AppShell } from './componentes/AppShell'
import { RequiereSesion } from './componentes/RequiereSesion'
import { PantallaConfiguracion } from './componentes/Pantallas'
import { Login } from './paginas/Login'
import { Resumen } from './paginas/Resumen'
import { Proyectos } from './paginas/Proyectos'
import { Personal } from './paginas/Personal'
import { Asistencia } from './paginas/Asistencia'
import { Materiales } from './paginas/Materiales'
import { Generadores } from './paginas/Generadores'
import { Usuarios } from './paginas/Usuarios'
import { Cuenta } from './paginas/Cuenta'
import { Pendiente } from './paginas/Pendiente'

export default function App() {
  if (!configuracionLista) {
    return <PantallaConfiguracion />
  }

  return (
    <HashRouter>
      <SesionProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<RequiereSesion />}>
            <Route element={<AppShell />}>
              <Route index element={<Resumen />} />
              <Route path="proyectos" element={<Proyectos />} />
              <Route path="personal" element={<Personal />} />
              <Route path="asistencia" element={<Asistencia />} />
              <Route path="materiales" element={<Materiales />} />
              <Route path="generadores" element={<Generadores />} />
              <Route path="usuarios" element={<Usuarios />} />
              <Route path="cuenta" element={<Cuenta />} />
              <Route path=":modulo" element={<Pendiente />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </SesionProvider>
    </HashRouter>
  )
}
