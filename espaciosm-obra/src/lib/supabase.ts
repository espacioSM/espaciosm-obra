import { createClient } from '@supabase/supabase-js'
import type { Database } from './tipos'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const llave = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * true cuando existen las dos variables de entorno. La interfaz muestra una
 * pantalla de configuración pendiente en lugar de fallar en blanco.
 */
export const configuracionLista = url.length > 0 && llave.length > 0

// Cliente único para toda la app. Si faltan las variables se crea con valores
// inocuos para que el módulo cargue y la interfaz pueda explicar el problema.
export const supabase = createClient<Database>(
  configuracionLista ? url : 'https://sin-configurar.supabase.co',
  configuracionLista ? llave : 'sin-configurar',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // PKCE deja lista la recuperación de contraseña por enlace. Con
      // HashRouter habrá que revisar detectSessionInUrl cuando se implemente.
      flowType: 'pkce',
      storageKey: 'espaciosm-obra-sesion',
    },
  },
)
