# EventHub

Aplicación web con Node.js, Express y SQL Server. No requiere compilar el
frontend: Node.js ejecuta la API y sirve los archivos de `public`.

## Requisitos

- Node.js 18 o posterior.
- SQL Server (Developer o Express para desarrollo) y SQL Server Management
  Studio (SSMS).
- SQL Server configurado para aceptar conexiones TCP/IP y autenticación SQL.
  La configuración de ejemplo usa el puerto `1433`.

## Estructura del proyecto

- `backend/server.js`: API REST con Express y conexión a SQL Server (`mssql`).
- `database/database_eventhub.sql`: script base para crear `EventHubDB`.
- `database/migraciones/001_organizaciones.sql`: migración idempotente para organizaciones, capacidad y cuentas del portal.
- `public/`: frontend estático (`index.html`, `css/`, `js/`, `portal/`, `img/`).

## Preparar SQL Server

1. En SSMS, conéctate a tu instancia de SQL Server.
2. Abre `database/database_eventhub.sql` y ejecútalo. El script crea `EventHubDB`, sus
   tablas y algunos datos de ejemplo. Ejecútalo en una base local de desarrollo,
   no en producción.
3. Si estás actualizando una base existente a la v1.0, haz una copia de seguridad y
   ejecuta `database/migraciones/001_organizaciones.sql`.
4. Ten a mano un usuario y contraseña de SQL Server que tenga acceso a
   `EventHubDB`. Para desarrollo puedes usar `sa`; no es recomendable para
   producción.

## Configurar y ejecutar en Windows

Desde PowerShell, en la carpeta del proyecto:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Edita `.env` y completa `DB_SERVER`, `DB_PORT`, `DB_USER` y `DB_PASSWORD` con
los datos de tu SQL Server. `DB_SERVER=127.0.0.1` sirve si SQL Server está en
esta computadora y escucha en el puerto `1433`. Si usas otro host o puerto,
cámbialos. Genera una clave propia para `AUTH_SECRET` con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado en `AUTH_SECRET` dentro de `.env`. No compartas ese archivo.
Después inicia el servidor:

```powershell
npm.cmd start
```

Abre <http://localhost:3000>. Para comprobar la conexión a SQL Server abre
<http://localhost:3000/api/health>: debe responder con `"estado":"ok"` y
`"baseDatos":"conectada"`. El panel está en
<http://localhost:3000/portal/>.

Deja abierta la terminal mientras uses la aplicación. Para detener el servidor,
presiona `Ctrl+C`.

## Contraseña del administrador

El SQL crea el usuario `admin`, pero almacena solamente un hash y no especifica
una contraseña legible. Para definir una, genera un hash en PowerShell:

```powershell
node -e 'const c=require("crypto"),r=require("readline").createInterface({input:process.stdin,output:process.stdout});r.question("Nueva contraseña: ",p=>{const s=c.randomBytes(16).toString("hex");console.log("Hash para SQL: scrypt$"+s+"$"+c.scryptSync(p,s,64).toString("hex"));r.close()})'
```

Copia el valor que aparece después de `Hash para SQL:` y ejecútalo en SSMS:

```sql
UPDATE dbo.Administradores
SET password_hash = N'PEGA_AQUI_EL_HASH'
WHERE usuario = N'admin';
```

Luego inicia sesión en el panel con el usuario `admin` y la contraseña que
elegiste.

## Problemas comunes

- **`npm` no se ejecuta en PowerShell:** usa `npm.cmd`, como en los comandos de
  esta guía.
- **Error de conexión o health `degradado`:** comprueba que el servicio de SQL
  Server esté iniciado, TCP/IP habilitado, el puerto correcto en `.env`, y que
  el usuario/contraseña tengan acceso a `EventHubDB`.
- **No se encuentra la base o las tablas:** vuelve a ejecutar
  `database/database_eventhub.sql` en SSMS con una cuenta que pueda crear la base.
- **El puerto 3000 está ocupado:** define otro `PORT` en `.env` y abre ese
  puerto en el navegador.
