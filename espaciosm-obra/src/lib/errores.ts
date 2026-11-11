/**
 * Traduce errores de Supabase/Postgres a mensajes útiles en español.
 * Nunca muestra detalles internos de la base al usuario final.
 */
export function mensajeDeError(error: unknown): string {
  if (!error) return 'Ocurrió un error inesperado. Intenta de nuevo.'

  const e = error as {
    message?: string
    code?: string
    name?: string
    status?: number
  }
  const codigo = e.code ?? ''
  const texto = `${e.message ?? ''}`.toLowerCase()

  // Autenticación
  if (codigo === 'invalid_credentials' || texto.includes('invalid login credentials')) {
    return 'Correo o contraseña incorrectos.'
  }
  if (codigo === 'email_not_confirmed' || texto.includes('email not confirmed')) {
    return 'La cuenta existe, pero el correo no está confirmado. Revisa la bandeja o pide al administrador que la confirme en Supabase.'
  }
  if (codigo === 'user_already_exists' || texto.includes('already registered')) {
    return 'Ese correo ya tiene una cuenta.'
  }
  if (codigo === 'weak_password' || texto.includes('password should be')) {
    return 'La contraseña es demasiado corta. Usa al menos 8 caracteres.'
  }
  if (texto.includes('jwt') || texto.includes('token has expired')) {
    return 'La sesión venció. Vuelve a iniciar sesión.'
  }

  // Base de datos
  if (codigo === '42501' || texto.includes('row-level security')) {
    return 'No tienes permiso para esta acción. Si deberías tenerlo, revisa tu asignación al proyecto con el administrador.'
  }
  if (codigo === '23505' || texto.includes('duplicate key')) {
    return 'Ya existe un registro con esos datos. Revisa la lista antes de volver a guardar.'
  }
  if (codigo === '23503' || texto.includes('foreign key')) {
    return 'El registro depende de información que ya no existe o no está asignada. Actualiza la pantalla e intenta de nuevo.'
  }
  if (codigo === '23514' || texto.includes('violates check constraint')) {
    return 'Los datos no cumplen una regla de la obra (por ejemplo, fechas u horas incoherentes).'
  }
  if (codigo === 'PGRST116' || texto.includes('0 rows')) {
    return 'No se encontró la información esperada.'
  }

  // Red
  if (texto.includes('failed to fetch') || texto.includes('networkerror') || e.name === 'TypeError') {
    return 'No hay conexión con el servidor. Revisa la red e intenta de nuevo.'
  }

  return 'No se pudo completar la operación. Intenta de nuevo; si persiste, avisa al administrador.'
}
