# Pruebas de RLS y reglas de negocio

Hay dos niveles: una prueba automática con Postgres embebido y una lista manual
contra el proyecto real de Supabase.

## Prueba automática

```bash
pnpm probar:sql
```

Levanta un Postgres en memoria, simula `auth.uid()` y los roles `anon` y
`authenticated`, aplica `0001` a `0005`, y comprueba aislamiento por obra,
sueldos ocultos para el residente, sellado de asistencia, historial, protección
del perfil, captura de la oficina, borrados bloqueados y permisos de ejecución.
No sustituye una prueba contra Supabase: no valida GoTrue, ni JWT reales, ni el
plan gratuito.

## Pruebas manuales

Estas pruebas se hacen **con la API**, no en el SQL Editor. El SQL Editor se
ejecuta como `postgres`, sin JWT de usuario: `auth.uid()` es nulo y los triggers
de protección no se activan. Para probar como residente hay que usar su sesión.

## Preparación

1. Proyecto de Supabase de prueba, nunca el de producción.
2. Ejecutar `0001` a `0005` en orden.
3. Crear en Auth:
   - `admin@ejemplo.mx` (se promoverá a admin con `0003`).
   - `residente.a@ejemplo.mx` y `residente.b@ejemplo.mx`, ambos residentes.
4. Crear dos obras desde la cuenta admin. Asignar solo la obra A al residente A
   y solo la obra B al residente B.
5. Dar de alta un empleado en cada obra.

Para las pruebas con `fetch`, abre la aplicación con la sesión del residente,
la consola del navegador y ejecuta:

```js
const sesion = JSON.parse(localStorage.getItem('espaciosm-obra-sesion'))
const url = 'https://TU-PROYECTO.supabase.co'
const anon = 'TU-LLAVE-ANON'
const cabeceras = {
  apikey: anon,
  Authorization: `Bearer ${sesion.access_token}`,
  'Content-Type': 'application/json',
}
```

## Lista de pruebas

| # | Prueba | Resultado esperado |
| --- | --- | --- |
| 1 | Residente intenta `PATCH /rest/v1/perfiles?id=eq.<su-id>` con `{"rol":"admin"}` | Error 403/42501: solo administración cambia el rol |
| 2 | Residente intenta `PATCH` de su perfil con `{"activo":false}` | Error 403/42501 |
| 3 | Admin intenta cambiar su propio rol o deshabilitarse | Error 403/42501 |
| 4 | Admin deshabilita a un residente (`activo=false`), y ese residente consulta `/rest/v1/proyectos` | Arreglo vacío, sin obras |
| 5 | Residente consulta `/rest/v1/empleados` | Arreglo vacío: no ve sueldos |
| 6 | Residente consulta la obra B (a la que no pertenece) | Arreglo vacío |
| 7 | Residente registra asistencia con `fecha` de ayer | Se guarda con la fecha de hoy y la hora del servidor |
| 8 | Residente intenta `PATCH` de una asistencia con otra `fecha` o `empleado_id` | Error 403/42501. Si intenta cambiar `registrado_por`, se sobrescribe con su propio usuario |
| 9 | Residente intenta poner `hora_salida` dos veces | La segunda llamada no actualiza filas (`SALIDA_YA_REGISTRADA` en la app) |
| 10 | Residente intenta una fecha futura | Error 23514: la fecha no puede ser futura |
| 11 | Llamada sin sesión (solo `apikey`) a `/rest/v1/rpc/mis_permisos` | Error 401/403; no devuelve permisos |
| 12 | `select routine_name, grantee ... where grantee in ('anon','PUBLIC')` | Cero filas |
| 13 | Revisar `asistencia_historial` después de las pruebas 7 a 9 | Filas con `alta` y `cambio`, autor y horas correctas; solo admin puede leerlas |
| 14 | Residente intenta `DELETE` de una asistencia | No borra filas; el registro sigue existiendo |
| 15 | Permiso medio captura una jornada de ayer con entrada y salida | Se guarda con la fecha y las horas indicadas, y su usuario como autor |
| 16 | Permiso medio intenta leer o escribir `asistencia_historial` | Cero filas al leer; error de permisos al escribir |

## Ejemplos

### 1. Cambio de rol (debe fallar)

```js
const respuesta = await fetch(
  `${url}/rest/v1/perfiles?id=eq.${sesion.user.id}`,
  {
    method: 'PATCH',
    headers: cabeceras,
    body: JSON.stringify({ rol: 'admin' }),
  },
)
console.log(respuesta.status, await respuesta.text())
```

Se espera `403` y un mensaje con `42501` o “Solo administración puede cambiar el
rol o el estado de una cuenta”.

### 2. Obras de otra persona (debe venir vacío)

```js
const respuesta = await fetch(
  `${url}/rest/v1/proyectos?select=id,nombre`,
  { headers: cabeceras },
)
console.log(await respuesta.json())
```

Con la sesión del residente A solo debe aparecer la obra A.

### 3. Empleados y sueldos (debe venir vacío)

```js
const respuesta = await fetch(
  `${url}/rest/v1/empleados?select=nombre,sueldo`,
  { headers: cabeceras },
)
console.log(await respuesta.json())
```

Debe ser `[]`. Los nombres para la asistencia llegan por
`/rest/v1/rpc/empleados_de_proyecto`.

### 4. Sin sesión (debe fallar)

```js
const respuesta = await fetch(`${url}/rest/v1/rpc/mis_permisos`, {
  method: 'POST',
  headers: { apikey: anon, 'Content-Type': 'application/json' },
  body: '{}',
})
console.log(respuesta.status, await respuesta.text())
```

Debe ser `401` o `403`, nunca un objeto de permisos.

### 5. Historial

En el SQL Editor, como `postgres`:

```sql
select creado_en, operacion, empleado_id, usuario_id, datos_nuevos
from public.asistencia_historial
order by creado_en desc
limit 20;
```

Cada alta y cada cierre de jornada debe tener su fila. `usuario_id` debe
corresponder a quien hizo la operación, no a otra persona.

## Pruebas que no se pueden hacer en el SQL Editor

- Rol propio, deshabilitarse, correo y sellado de asistencia dependen de
  `auth.uid()`. En el SQL Editor `auth.uid()` es nulo y los triggers dejan pasar
  la operación a propósito, para mantenimiento.
- Para probar RLS hay que usar la sesión real del usuario, como en los ejemplos.

## Después de las pruebas

1. Borrar el proyecto de Supabase de prueba o limpiar sus datos.
2. No reutilizar las contraseñas de prueba.
3. Anotar cualquier desviación en `docs/DECISIONES.md` antes de dar acceso a los
   residentes.
