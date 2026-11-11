# Decisiones técnicas

Este documento explica por qué el Sprint 1 está armado así. Sirve para tomar las
decisiones pendientes sin romper lo que ya funciona.

## 1. Tres roles y una matriz en la base de datos

Los roles son `admin`, `permiso_medio` y `residente`. En lugar de repartir
condiciones por el código, la regla vive en la tabla `rol_permisos`
(rol × módulo × acción). La función `puede(modulo, accion)` consulta esa tabla y
es la misma que usan las políticas RLS y la interfaz.

Ventajas:

- El alcance del rol intermedio se ajusta con un `UPDATE`, sin recompilar ni
  volver a desplegar.
- La interfaz y la base no pueden discrepar: ambas leen la misma matriz.
- El administrador siempre puede todo, aunque alguien borre filas de la matriz.

Matriz inicial:

| Módulo | admin | permiso_medio | residente |
| --- | --- | --- | --- |
| Proyectos | todo | ver | ver sus obras |
| Personal | todo | ver, crear, editar | sin acceso |
| Asistencia | todo | ver, crear, editar | ver, crear, editar |
| Materiales | todo | ver, crear, editar | ver, crear |
| Generadores | todo | ver, crear, editar | ver |
| Estimaciones | todo | ver | sin acceso |
| Solicitudes | todo | ver, crear, editar, aprobar | ver, crear |
| Pagos | todo | ver | sin acceso |
| Bitácora | todo | ver, crear, editar | ver, crear, editar |
| Reportes | todo | ver, crear, editar | ver, crear |

`aprobar` solo está activo para permiso medio en Solicitudes; estimaciones y
pagos quedan reservados a administración. Es una propuesta, no una imposición:
si la oficina técnica debe aprobar estimaciones, se cambia así:

```sql
update public.rol_permisos
set permitido = true
where rol = 'permiso_medio'
  and modulo = 'estimaciones'
  and accion = 'aprobar';
```

Los módulos aún no construidos ya tienen filas en la matriz. Cuando se
implementen, el comportamiento de los roles ya estará definido.

## 2. Aislamiento por obra, no por registro

Un usuario que no es administrador solo ve los proyectos donde aparece en
`proyecto_miembros`. De ahí cuelga todo lo demás: personal, asistencia y, en los
siguientes sprints, materiales y estimaciones.

Consecuencias:

- Asignar el equipo no es opcional. Si un residente no está en la lista, su
  aplicación se ve vacía y es el comportamiento correcto.
- El administrador no necesita estar en la lista: `es_admin()` lo deja pasar.
- Un residente puede estar en varias obras; basta con agregarlo a cada una.
- El aislamiento es a nivel de fila, no de columna. Si un dato no debe verse,
  no debe estar en una tabla a la que el rol tenga `select`.

## 3. Los sueldos no son visibles para el residente

El residente necesita nombres para pasar lista, pero no necesita sueldos. Por
eso:

- La matriz le niega `personal.ver`.
- La pantalla Personal no le aparece en la navegación.
- La asistencia usa la función `empleados_de_proyecto(proyecto_id)`, que
  devuelve únicamente id, nombre, puesto y si está activo.
- El resumen usa `conteo_personal_por_proyecto()`, que devuelve solo conteos.

Si más adelante se decide que el residente vea sueldos, hay que activar
`personal.ver` para su rol y aceptar que la tabla completa queda a su alcance.
No conviene resolverlo ocultando la columna en la interfaz: la consulta directa
a la API seguiría devolviendo el dato.

## 4. RLS con funciones `security definer`

Las políticas necesitan saber el rol del usuario y si pertenece a la obra. Si
consultaran `perfiles` o `proyecto_miembros` directamente, entrarían en
recursión: la política de esas tablas volvería a llamar a la misma política.

Por eso hay funciones pequeñas, `stable` y `security definer`, con
`search_path` fijo:

- `rol_actual()`, `es_admin()`, `puede()`
- `tiene_acceso_proyecto()`
- `mis_permisos()`, `mi_perfil()`
- `empleados_de_proyecto()`, `conteo_personal_por_proyecto()`

Todas se ejecutan como el dueño de las tablas (postgres), así que no vuelven a
pasar por RLS. Están cerradas a `public` y solo `authenticated` puede
ejecutarlas. El `search_path` fijo evita que un esquema malicioso secuestre las
referencias internas.

Regla para el futuro: toda función `security definer` debe validar por su
cuenta el rol o la pertenencia al proyecto. No basta con que la llame la
interfaz.

## 5. Perfiles y ciclo de vida de las cuentas

`auth.users` guarda correo y contraseña. `perfiles` guarda nombre, rol y estado.
Un trigger crea el perfil al dar de alta la cuenta, con rol `residente` por
defecto. Un segundo trigger sincroniza el correo si cambia en Auth.

Decisiones asociadas:

- No hay registro público. Las cuentas se crean en Supabase y se habilitan en
  la aplicación.
- El rol solo lo cambia un administrador.
- La regla no vive solo en la pantalla: el trigger `proteger_perfil` (0004)
  impide que un usuario cambie su rol o se deshabilite, y que un administrador
  haga cualquiera de las dos cosas consigo mismo. También fuerza que el correo
  solo se actualice desde Auth.
- Para evitar quedarse sin acceso, conviene tener al menos dos administradores
  activos. Un administrador puede degradar a otro, pero no a sí mismo.
- Deshabilitar (`activo = false`) no borra historial: corta el acceso y conserva
  la trazabilidad. `tiene_acceso_proyecto()` exige cuenta activa, así que una
  cuenta deshabilitada tampoco ve sus obras.
- Las cuentas no se borran desde la aplicación; se eliminan en Supabase Auth y
  el perfil cae en cascada.

## 6. Asistencia: un registro por persona y día

`asistencia` tiene una fila por empleado y fecha (`unique (empleado_id, fecha)`).
La ausencia se representa con la falta de fila, no con un estado adicional.

- Una llave foránea compuesta `(empleado_id, proyecto_id)` garantiza que el
  registro pertenece al proyecto del empleado. No se puede capturar asistencia
  de un trabajador en una obra ajena.
- La salida debe ser posterior a la entrada. Los turnos que cruzan la
  medianoche no están soportados en el Sprint 1; si se necesitan, habrá que
  cambiar el modelo a marcas de tiempo completas.
- Para el residente, el trigger `sellar_asistencia` impone la fecha de hoy y la
  hora del servidor (`America/Mexico_City`), y fija `registrado_por` en quien
  hace la operación. No puede cambiar empleado, obra, fecha ni hora de entrada,
  ni reabrir una jornada cerrada. La oficina (admin y permiso medio) conserva la
  captura manual para corregir días anteriores, pero tampoco puede fechar en el
  futuro.
- El cierre de una jornada usa `hora_salida is null` en la consulta. Un segundo
  toque o un segundo dispositivo ya no sobrescribe la salida.
- Cada alta, cambio o baja se copia a `asistencia_historial` con el antes y el
  después. Solo la consulta administración; ni siquiera permiso medio puede
  leerla, porque es el rol que puede reescribir días anteriores.
- La oficina (admin y permiso medio) corrige días anteriores con la captura
  manual de jornada: elige empleado, fecha, entrada y salida. No usa los botones
  rápidos en una fecha pasada, para no grabar la hora actual en un día viejo.
- `registrado_por` se fuerza siempre al usuario de la sesión, también en las
  correcciones de la oficina. El historial conserva el antes y el después.

## 7. Baja lógica del personal

`empleados` tiene `activo` y `fecha_baja`. Dar de baja no borra la persona ni su
asistencia; deja de aparecer en las listas activas y se puede reactivar.

No se permite cambiar de obra a un empleado con asistencia registrada: la llave
foránea compuesta lo impide. La interfaz deshabilita el campo al editar. Si una
persona cambia de obra, se da de baja y se vuelve a dar de alta en la nueva.

El historial de sueldos no está versionado: editar el sueldo cambia también los
cálculos retroactivos que se hagan en el futuro. Si el Sprint 4 necesita
nómina histórica, habrá que agregar una tabla de movimientos salariales.

## 8. Interfaz

- **Tema oscuro institucional.** Fondo negro, superficies grafito, texto marfil
  y amarillo `#f5cf16` tomado del logotipo. El logotipo completo se usa en el
  acceso; en la barra superior se usa la marca geométrica con el nombre
  `espacioSM` y la S en amarillo, para que sea legible a 34 px.
- **HashRouter** (`/#/asistencia`) en lugar de rutas limpias. GitHub Pages no
  reescribe rutas al `index.html`; con hash, recargar una pantalla interna
  nunca produce 404. El costo es estético y no afecta a la PWA.
- **CSS propio**, sin biblioteca de componentes. Menos dependencias, control
  total del tono sobrio y del tamaño táctil. Los objetivos interactivos tienen
  al menos 44 px y las tablas se desplazan en horizontal en el teléfono.
- **Sin librería de estado**. La sesión vive en un contexto; cada pantalla
  consulta lo que necesita con el hook `useDatos`. Para el tamaño del Sprint 1
  es suficiente y deja el código legible.
- **La interfaz oculta lo que no se puede hacer, pero no es la seguridad**. La
  decisión final siempre la toma RLS. Un residente que escriba una ruta a mano
  ve la pantalla, pero la consulta vuelve sin datos.

## 9. PWA

- `vite-plugin-pwa` genera el service worker en cada compilación.
- Se precargan solo los archivos de la interfaz. Las consultas a Supabase
  viajan siempre a la red: nunca se guardan datos de obra en caché.
- `registerType: autoUpdate` hace que la versión nueva se instale sola; para
  verla puede hacer falta cerrar todas las pestañas.
- El manifiesto declara iconos de 192, 512 y una versión maskable. En iPhone la
  instalación es manual desde Safari.
- **No hay captura sin conexión.** Sin red, la app abre pero no puede leer ni
  guardar. Es una limitación consciente del Sprint 1; el campo suele tener
  señal, pero conviene definir si se necesita una cola local en un sprint
  posterior.

## 10. Contraseñas, sesión y CSP

- **Cambio de contraseña en la app.** La pantalla **Mi cuenta** usa
  `supabase.auth.updateUser({ password })`. No hay recuperación por correo en el
  Sprint 1; si alguien la olvida, un administrador la restablece en Supabase.
- **Cambio seguro de contraseña.** Conviene activar *Secure password change* en
  Supabase Auth para exigir una sesión reciente al cambiarla; la interfaz no
  puede imponerlo por sí sola.
- **Longitud mínima de 8.** Se valida en la interfaz y hay que configurarla en
  Supabase, en **Authentication > Providers > Email**. El valor por defecto de
  Supabase es 6.
- **La sesión vive en `localStorage`**, como es normal en supabase-js. Un XSS
  podría llevársela, por eso la CSP importa.
- **CSP de producción.** GitHub Pages no permite cabeceras, así que
  `vite.config.ts` inyecta un `<meta http-equiv="Content-Security-Policy">` solo
  al compilar: scripts del propio sitio, conexiones a `*.supabase.co`, imágenes
  propias o `blob:`. En desarrollo se omite para no romper React Refresh. Una
  CSP en `<meta>` no puede aplicar `frame-ancestors`; si se necesita
  anti-clickjacking estricto, hará falta un proxy o un CDN que emita cabeceras.
- **PKCE.** El cliente usa `flowType: 'pkce'`, que deja lista la recuperación de
  contraseña por enlace. Cuando se implemente, habrá que revisar
  `detectSessionInUrl` con HashRouter.
- **MFA pendiente.** La verificación en dos pasos (TOTP) se recomienda para la
  cuenta de administración, pero requiere una pantalla de enrolamiento que no
  forma parte de este sprint.

## 11. Despliegue

- Repositorio público: GitHub Pages gratuito no publica repositorios privados.
  El código es visible; los datos no, porque viven en Supabase y están
  protegidos por RLS.
- La llave `anon` se inyecta al compilar desde secretos de GitHub Actions. No
  está escrita en el repositorio.
- `public/CNAME` fija `app.espaciosm.art`. La base de Vite es `/`.
- El flujo usa Node 22 y pnpm 11, con `pnpm-lock.yaml` versionado y
  `packageManager` fijado en `package.json`. `pnpm/action-setup` no lleva
  `version` para no chocar con `packageManager`.
- Las actions están fijadas a un SHA, no a una etiqueta móvil. Dependabot las
  actualiza junto con las dependencias npm.
- `.npmrc` fuerza enlaces planos (`node-linker=hoisted`). Sin eso, Vite 8 no
  resuelve sus dependencias en Windows con la estructura aislada de pnpm. En
  Linux funciona igual.
- No se usa Cloud Run ni Cloud SQL: el brief descarta costo y complejidad.

## Pendientes por definir

| Tema | Estado | Recomendación |
| --- | --- | --- |
| Matriz final del rol intermedio | Propuesta aplicada | Ajustar con `UPDATE` después de una semana de uso real |
| Formato del PDF de status | No definido | Partir de una hoja tamaño carta, una página por obra, con avance, fotos y pendientes |
| Estimaciones con formato oficial | No definido | Si el cliente exige formato de la industria, modelar conceptos y reportes antes del Sprint 3 |
| Respaldo de datos | Provisional | Exportación mensual desde Supabase; evaluar `pg_dump` programado o una copia en Google Drive |
| Notificaciones | No incluidas | Definir si bastan avisos en la app o se requiere correo o WhatsApp |
| Captura sin conexión | No incluida | Solo si los residentes reportan falta de señal; implica cola local y resolución de conflictos |
| Fotos de avance | Sprint 2/5 | Definir límite por foto, compresión en el navegador y política de borrado |
| Empleado en varias obras | No soportado | Definir si se necesita; hoy un empleado pertenece a una obra |
| Nómina histórica | No incluida | Tabla de movimientos de sueldo si se van a calcular pagos retroactivos |
| MFA para administración | No incluida | Pantalla de enrolamiento TOTP; mientras tanto, contraseña larga y única |
| Recuperación de contraseña | No incluida | Enlace por correo con PKCE; revisar la convivencia con HashRouter |
| Pruebas automatizadas de RLS | Parciales | `pnpm probar:sql` cubre migraciones, triggers y RLS en Postgres embebido; falta un proyecto Supabase de prueba y, si crece, pgTAP |

## Riesgos asumidos

1. **La llave `anon` es pública.** La seguridad depende de RLS. Cualquier tabla
   nueva debe activar RLS el mismo día en que se crea, antes de cargar datos.
2. **El repositorio es público.** Se expone el esquema, no la información. No
   subir datos reales, volcados ni archivos `.env`.
3. **Plan gratuito de Supabase.** Puede pausar el proyecto por inactividad, el
   almacenamiento es limitado y no hay respaldos automáticos. Revisar límites
   vigentes antes de subir fotos.
4. **Un solo administrador.** Si esa cuenta se deshabilita o pierde la
   contraseña, la operación se detiene. Crear una segunda cuenta admin.
5. **La sesión vive en `localStorage`.** La CSP reduce el riesgo de XSS, pero no
   lo elimina. No agregar HTML de terceros ni `dangerouslySetInnerHTML`.
6. **Sin MFA ni recuperación de contraseña.** El administrador conoce las
   contraseñas iniciales; cada persona debe cambiarla en **Mi cuenta**.
7. **Sin captura sin conexión.** Una obra sin señal no puede registrar
   asistencia en el momento.
8. **RLS mal revisado.** Antes de dar acceso a los residentes hay que ejecutar
   la lista de verificación de `docs/PRUEBAS_RLS.md`.
