# Instalación paso a paso

Esta guía deja la aplicación funcionando en `https://app.espaciosm.art` con
datos reales. Está escrita para ejecutarse sin conocimientos de programación.
Los comandos solo se usan en la máquina de desarrollo (la que tiene Harness).

Tiempo estimado: 60 a 90 minutos, repartidos en dos sesiones si se prefiere.

## Antes de empezar

Necesitas:

- Una cuenta de GitHub con acceso al repositorio del sitio actual.
- Una cuenta de Supabase (puede ser la misma persona).
- Acceso al panel DNS del dominio `espaciosm.art`.
- La carpeta del proyecto en la máquina de desarrollo.
- Node 20.19 o superior y pnpm 11 para compilar en local (GitHub Actions también
  compila, así que este requisito solo aplica si quieres probar antes de publicar).

Conceptos mínimos:

- **Repositorio**: carpeta del proyecto alojada en GitHub. Debe ser público
  porque GitHub Pages gratuito no publica repositorios privados.
- **Despliegue**: cada cambio en la rama `main` dispara GitHub Actions, que
  compila y publica el sitio.
- **Variables `VITE_`**: se incrustan en el código al compilar. Si cambian, hay
  que volver a ejecutar el despliegue.

---

## Fase 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com/dashboard> y crea un proyecto nuevo.
2. Nombre sugerido: `espaciosm-obra`. Región: la más cercana a México
   (`East US` o `West US` funcionan).
3. Guarda la contraseña de la base en un lugar seguro. No se usa en la
   aplicación, pero sirve para administración.
4. Espera a que el proyecto termine de aprovisionarse (2 a 5 minutos).
5. Abre **Project Settings > API** y copia dos valores:
   - `Project URL`, con forma `https://xxxxxxxx.supabase.co`
   - `anon public` (la llave larga que empieza con `eyJ`)

No copies `service_role`. Esa llave omite todas las reglas de seguridad y no
debe salir del panel de Supabase.

6. Opcional pero recomendado: en **Project Settings > API**, revisa que la
   exposición de esquemas sea solo `public`. La aplicación no necesita otros.

---

## Fase 2. Crear las tablas y la seguridad

Se ejecutan cinco archivos en orden. El primero crea la estructura; el segundo
activa las reglas de acceso; el tercero nombra al primer administrador; el
cuarto endurece perfiles, asistencia y permisos de ejecución; el quinto cierra
la auditoría y el autor de la asistencia.

### 2.1 Esquema

1. En Supabase, abre **SQL Editor > New query**.
2. Copia todo el contenido de `supabase/migrations/0001_esquema_sprint1.sql`.
3. Pega y pulsa **Run**. Debe terminar sin errores.
4. Repite con `0002_rls_sprint1.sql`. Este archivo activa RLS: si algo falla
   aquí, no continúes, porque la base quedaría sin protecciones.

### 2.2 Crear las cuentas

1. Ve a **Authentication > Users > Add user > Create new user**.
2. Captura correo y contraseña. Activa **Auto Confirm User** para que la cuenta
   pueda entrar sin correo de confirmación. El plan gratuito de Supabase tiene
   envío de correos limitado; confirmar a mano evita ese problema.
3. Repite para cada persona: un administrador, el personal de oficina con
   permiso medio y los tres residentes.
4. Desactiva el registro público: **Authentication > Providers > Email** y
   apaga **Enable sign-ups**. Así nadie puede crear cuentas por su cuenta.

Cada usuario crea automáticamente su fila en `perfiles` con rol `residente`.

### 2.3 Nombrar al primer administrador

1. Abre `supabase/migrations/0003_ajustes_post_instalacion.sql`.
2. En el bloque B cambia `admin-de-obra@ejemplo.mx` por el correo real del
   administrador. La comparación no distingue mayúsculas.
3. Pega el archivo completo en el SQL Editor y pulsa **Run**.
4. Al final, la consulta de verificación debe mostrar al menos un `admin`
   activo y la misma cantidad de usuarios en Auth y en perfiles.
5. Ejecuta `0004_endurecimiento_sprint1.sql`. Es obligatorio: cierra el acceso
   de cuentas deshabilitadas, protege el rol y sella la asistencia.
6. Ejecuta `0005_revision_sprint1.sql`. Deja la auditoría solo para
   administración y fuerza que `registrado_por` sea siempre quien opera.

Si el bloque B no actualizó a nadie, revisa que el correo esté escrito igual que
en **Authentication > Users** y vuelve a ejecutarlo. El bloque A puede correrse
primero sin riesgo: repara perfiles que no se hayan creado.

### 2.4 Ajustes de autenticación

En **Authentication > URL Configuration**:

- `Site URL`: `https://app.espaciosm.art`
- `Redirect URLs`: agrega `https://app.espaciosm.art/**`

En **Authentication > Providers > Email**:

- `Minimum password length`: **8**. El valor por defecto de Supabase es 6 y la
  aplicación exige 8; si no se ajusta, la base aceptaría contraseñas más cortas
  por API.
- `Enable sign-ups`: **off**, para que nadie cree cuentas por su cuenta.
- `Secure password change`: **on**, para exigir una sesión reciente al cambiar
  la contraseña desde **Mi cuenta**.

El restablecimiento por correo todavía no está implementado; la pantalla **Mi
cuenta** sí permite cambiar la contraseña con la sesión abierta.

---

## Fase 3. Probar en la máquina de desarrollo

1. En la carpeta del proyecto, crea el archivo `.env` a partir de `.env.example`.
2. Llena:

```
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

3. Instala dependencias y arranca:

```bash
pnpm install
pnpm probar:sql   # valida migraciones, RLS y triggers en Postgres embebido
pnpm dev
```

4. Abre `http://localhost:5173` e inicia sesión con la cuenta administradora.
5. Crea una obra en **Proyectos**, asígnate al equipo y da de alta un empleado.
6. Registra la entrada y la salida en **Asistencia**.

El archivo `.env` no se sube nunca al repositorio: `.gitignore` ya lo excluye.

---

## Fase 4. Publicar el repositorio en GitHub

El repositorio debe ser **público**. No contiene llaves: la llave `anon` se
inyecta al compilar desde los secretos de GitHub Actions.

### Opción recomendada: GitHub Desktop

1. Instala GitHub Desktop desde <https://desktop.github.com>.
2. **File > Add local repository** y elige la carpeta `espaciosm-obra`.
3. Si avisa que no es un repositorio, acepta **create a repository**.
4. Revisa la lista de archivos antes de publicar. No deben aparecer
   `node_modules`, `dist` ni `.env`.
5. Pulsa **Publish repository**, desmarca *Keep this code private* y publica.

### Opción alterna: desde la web

Subir la carpeta completa arrastrándola al navegador es riesgoso: el navegador
no respeta `.gitignore` y puede subir `node_modules` (miles de archivos). Si no
usas GitHub Desktop, sube solo el contenido del proyecto sin `node_modules`,
sin `dist` y sin `.env`.

### Verificación

En GitHub deben verse, entre otros:

- `.github/workflows/deploy.yml`
- `.github/dependabot.yml`
- `src/`
- `supabase/migrations/` con los cinco archivos
- `package.json`, `pnpm-lock.yaml`, `vite.config.ts`

---

## Fase 5. Configurar secretos y GitHub Pages

1. En el repositorio: **Settings > Secrets and variables > Actions > New
   repository secret**.
2. Crea exactamente estos dos secretos:

| Nombre | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | La URL del proyecto Supabase |
| `VITE_SUPABASE_ANON_KEY` | La llave `anon public` |

Los nombres deben ser idénticos, en mayúsculas y con guion bajo. Si falta uno,
el flujo de trabajo se detiene con un mensaje claro.

3. Ve a **Settings > Pages** y en **Build and deployment > Source** elige
   **GitHub Actions**.
4. Abre la pestaña **Actions**, selecciona **Desplegar en GitHub Pages** y pulsa
   **Run workflow**. También se ejecuta solo con cada push a `main`.
5. Espera a que terminen los trabajos `compilar` y `desplegar`. El segundo
   muestra la URL publicada.

Si el repositorio tiene el archivo `public/CNAME`, Pages queda ligado a
`app.espaciosm.art`. Configura el DNS antes de probar (Fase 6); de lo contrario
la URL `usuario.github.io/espaciosm-obra/` redirigirá a un dominio que aún no
existe.

### Si prefieres probar primero en github.io

1. Borra `public/CNAME` y haz commit.
2. En `.github/workflows/deploy.yml`, agrega `VITE_BASE: /espaciosm-obra/` al
   paso **Compilar la PWA** (con el nombre real del repositorio).
3. Vuelve a ejecutar el despliegue y prueba en
   `https://usuario.github.io/espaciosm-obra/`.
4. Al pasar al dominio propio, revierte ambos cambios.

Este camino extra no es necesario si el DNS se configura de una vez.

---

## Fase 6. Dominio app.espaciosm.art

1. En el panel DNS de `espaciosm.art`, crea un registro:

| Tipo | Nombre | Valor | TTL |
| --- | --- | --- | --- |
| CNAME | `app` | `usuario.github.io` | Automático |

Sustituye `usuario` por el nombre de la cuenta u organización de GitHub. No
escribas la ruta del repositorio. Si existía un registro `A` para `app`,
elimínalo: no pueden convivir ambos.

2. En GitHub: **Settings > Pages > Custom domain**, escribe
   `app.espaciosm.art` y guarda. El archivo `public/CNAME` ya contiene ese
   dominio, así que normalmente aparece solo.
3. Espera la verificación del DNS (de minutos a un par de horas) y activa
   **Enforce HTTPS**. El certificado tarda unos minutos más.
4. Abre `https://app.espaciosm.art`. Debe cargar la pantalla de acceso.

---

## Fase 7. Preparar al equipo y los teléfonos

1. Entra como administrador y asigna roles en **Usuarios y roles**:
   - Una cuenta `admin` (dirección).
   - Una cuenta `permiso_medio` (oficina técnica), si se usa.
   - Tres cuentas `residente`.
2. En **Proyectos**, crea cada obra y usa el botón **Equipo** para agregar a los
   residentes que deben verla. Sin esa asignación, el residente no ve nada.
3. En **Personal**, da de alta a los trabajadores de cada obra.
4. En cada teléfono:
   - iPhone: abrir la URL en Safari, tocar **Compartir > Agregar a inicio**.
   - Android: abrir en Chrome, menú **Instalar aplicación** o **Agregar a
     pantalla principal**.
5. Inicia sesión en el teléfono, entra a **Mi cuenta** y cambia la contraseña
   inicial por una propia. Después registra una asistencia de prueba.

La primera vez que se abre la app en un teléfono conviene tener buena conexión:
el service worker guarda la interfaz, pero los datos siempre se consultan en
línea. Los residentes solo capturan la asistencia del día; la fecha la impone el
servidor y la oficina corrige días anteriores.

---

## Fase 8. Verificar la seguridad antes de dar acceso

La lista completa, con ejemplos de `fetch`, está en
[PRUEBAS_RLS.md](PRUEBAS_RLS.md). Como mínimo:

1. El residente solo ve las obras donde fue agregado al equipo.
2. En **Proyectos** no aparecen los botones **Nueva obra**, **Editar** ni
   **Equipo**.
3. En **Usuarios y roles** aparece el aviso de que la sección es exclusiva de
   administración, aunque escriba la ruta a mano.
4. El residente puede registrar asistencia y completar la salida. La fecha no se
   puede cambiar y la hora la sella el servidor.
5. La oficina puede capturar una jornada de ayer con hora de entrada y salida, y
   queda con ella como autora.
6. El residente no puede borrar registros, cambiar sueldos ni cambiar su propio
   rol o estado por API.
7. Un residente deshabilitado no ve ninguna obra, aunque su sesión siga abierta.
8. La tabla `empleados` devuelve vacío para el residente; los nombres de la
   asistencia llegan por la función del directorio.
9. Una llamada con la llave `anon`, sin sesión, a las RPC devuelve error.

Si alguna prueba falla, no des acceso a los residentes: revisa la asignación al
proyecto y las políticas de `0002_rls_sprint1.sql`,
`0004_endurecimiento_sprint1.sql` y `0005_revision_sprint1.sql`.

---

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| Aparece "Falta conectar Supabase" | El despliegue no recibió las variables | Revisa los secretos y vuelve a ejecutar el flujo |
| "Correo o contraseña incorrectos" | Contraseña equivocada o cuenta inexistente | Restablece la contraseña en Supabase Auth |
| "El correo no está confirmado" | El usuario se creó sin Auto Confirm | Confírmalo en Auth o desactiva la confirmación |
| "No tienes permiso para esta acción" | RLS o trigger bloquearon la operación | Verifica el rol, la asignación al proyecto y la regla que aplica |
| "No puedes cambiar tu propio rol ni deshabilitar tu cuenta" | Trigger de protección de perfiles | Pide a otro administrador que lo haga |
| "La jornada ya está cerrada" | Se intentó reabrir o reescribir una salida | Corrige desde la cuenta de oficina, no desde el residente |
| "La salida ya estaba registrada" | Segundo toque o dos dispositivos | La app actualiza la pantalla; no se sobrescribe la hora |
| "La fecha de asistencia no puede ser futura" | Fecha posterior a hoy | Usa hoy o una fecha anterior |
| El flujo falla en "Instalar dependencias" | `pnpm-lock.yaml` desactualizado | Ejecuta `pnpm install` en local y sube el lockfile |
| El flujo dice "Falta el secreto..." | Nombre mal escrito | Debe ser `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` |
| La página queda en blanco | Ruta base incorrecta o error de JavaScript | Abre la consola del navegador y revisa la URL de los archivos |
| El dominio muestra "no seguro" | Certificado en proceso o DNS incorrecto | Espera, verifica el CNAME y vuelve a guardar el dominio |
| Se ve una versión vieja | Service worker con caché | Cierra todas las pestañas y vuelve a abrir; o borra datos del sitio |
| No aparece "Instalar" en el teléfono | Falta HTTPS o el manifiesto no cargó | Debe ser HTTPS; en iPhone se instala desde Safari |
| Supabase no responde | Proyecto pausado por inactividad | Entra al panel y reactívalo |

---

## Mantenimiento

- **Cambios de base de datos**: siempre con un archivo nuevo en
  `supabase/migrations/` (por ejemplo `0006_materiales.sql`). Nunca edites una
  migración que ya se ejecutó.
- **Cambios de código**: commit a `main`, GitHub Actions publica solo.
- **Respaldos**: el plan gratuito no incluye respaldos automáticos. Exporta las
  tablas desde **Table Editor** o programa un respaldo mensual; la estrategia
  definitiva queda como pendiente en `docs/DECISIONES.md`. No cargues nómina
  real sin un respaldo probado.
- **Supabase inactivo**: el plan gratuito puede pausar proyectos sin uso. Una
  revisión semanal del panel evita la sorpresa.
- **Contraseñas**: cada persona las cambia en **Mi cuenta**. Se restablecen
  desde Supabase Auth; la aplicación no envía correos de recuperación en el
  Sprint 1.
- **MFA**: pendiente de interfaz. Mientras tanto, la cuenta de administración
  debe usar una contraseña larga y única, y no compartirse.
- **Permisos de funciones**: al agregar una función nueva, revócala de `PUBLIC` y
  `anon` y concédela solo a `authenticated`; la consulta de verificación está en
  `docs/ESQUEMA.md`.
