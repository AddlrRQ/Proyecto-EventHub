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
- `database/migraciones/002_catalogo_organizaciones.sql`: ampliación idempotente del catálogo de organizaciones y eventos de demostración.
- `database/migraciones/003_optimizacion_rendimiento.sql`: migración idempotente de optimización de índices (elimina redundancias y añade índice justificado).
- `database/analisis_rendimiento_ssms.sql`: script de análisis para SSMS (`SET STATISTICS IO ON`, `SET STATISTICS TIME ON`).
- `database/usuario_minimo_eventhub.sql`: script opcional para crear el login/usuario `eventhub_app` con permisos mínimos.
- `public/`: frontend estático (`index.html`, `css/`, `js/`, `portal/`, `Imagenes/`).
- `tests/pruebas_eventhub.js`: pruebas automatizadas con Node.js nativo (`assert`).
- `scripts/benchmark_eventhub.js`: script reproducible para mediciones de complejidad, lotes y endpoints.

## Preparar SQL Server

1. En SSMS, conéctate a tu instancia de SQL Server.
2. Abre `database/database_eventhub.sql` y ejecútalo. El script crea `EventHubDB`, sus
   tablas y algunos datos de ejemplo. Ejecútalo en una base local de desarrollo,
   no en producción.
3. Si estás actualizando una base existente, haz una copia de seguridad y ejecuta en orden:
   - `database/migraciones/001_organizaciones.sql`
   - `database/migraciones/002_catalogo_organizaciones.sql`
   - `database/migraciones/003_optimizacion_rendimiento.sql`
4. Crea un usuario de SQL Server con privilegios mínimos sobre `EventHubDB` (recomendado:
   `eventhub_app`; nunca uses `sa` en producción ni despliegues EC2). Puedes revisar y
   adaptar `database/usuario_minimo_eventhub.sql` reemplazando antes el placeholder de contraseña.

## Configurar y ejecutar en Windows

Desde PowerShell, en la carpeta del proyecto:

```powershell
npm.cmd ci
Copy-Item .env.example .env
```

Edita `.env` y completa `DB_SERVER`, `DB_PORT`, `DB_USER` (`eventhub_app`), `DB_PASSWORD`,
`ALLOWED_ORIGINS` y las opciones TLS/pool según tu entorno:

- **TLS de SQL Server (`DB_ENCRYPT`, `DB_TRUST_SERVER_CERTIFICATE`):**
  en producción se recomienda `DB_ENCRYPT=true` y `DB_TRUST_SERVER_CERTIFICATE=false`
  con un certificado válido. En desarrollo local con certificado autofirmado de
  SQL Server puedes configurar `DB_TRUST_SERVER_CERTIFICATE=true`.
- **CORS (`ALLOWED_ORIGINS`):** lista separada por comas con los orígenes permitidos
  (por ejemplo `http://localhost:3000,http://127.0.0.1:3000` o el origen/DNS del
  Application Load Balancer en AWS). No uses `*`.
- **Pool de conexiones (`DB_POOL_MAX`, `DB_POOL_MIN`, `DB_POOL_IDLE_MS`,
  `DB_CONNECTION_TIMEOUT_MS`, `DB_REQUEST_TIMEOUT_MS`):** con dos instancias EC2
  conectadas a la misma base de datos, cada instancia mantiene su propio pool;
  la cantidad máxima potencial de conexiones simultáneas será aproximadamente
  `número de EC2 × DB_POOL_MAX` (por ejemplo, `2 × 10 = 20`), aunque no todas
  permanecerán abiertas de forma constante si `DB_POOL_MIN=0`.

`DB_SERVER=127.0.0.1` sirve si SQL Server está en esta computadora y escucha en el
puerto `1433`. Genera una clave propia para `AUTH_SECRET` con:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado en `AUTH_SECRET` dentro de `.env`. No compartas ese archivo.
Después inicia el servidor:

```powershell
npm.cmd start
```

Abre <http://localhost:3000>. Para comprobar la conexión a SQL Server abre
<http://localhost:3000/api/health/ready> (o <http://localhost:3000/api/health> por
compatibilidad con el pie de página): debe responder con `"estado":"ok"` y
`"baseDatos":"conectada"`. El panel está en
<http://localhost:3000/portal/>.

Deja abierta la terminal mientras uses la aplicación. Para detener el servidor,
presiona `Ctrl+C`.

## Health checks y arquitectura de dos EC2

- **`GET /api/health/live`:** verifica únicamente que Node.js y Express responden
  (`HTTP 200`, `Cache-Control: no-store`, sin consultar SQL Server). Útil para
  diagnóstico rápido del proceso.
- **`GET /api/health/ready`:** verifica el pool y ejecuta `SELECT 1 AS ok`
  (`HTTP 200` si la base responde, `HTTP 503` si SQL Server no está disponible).
  **Ruta recomendada para el Target Group del Application Load Balancer (ALB).**
- **`GET /api/health`:** conservada por compatibilidad con el indicador de
  instancia del frontend.

> **Limitación arquitectónica:** los health checks no vuelven altamente disponible
> a una única base SQL Server compartida. Si SQL Server falla, ambas instancias EC2
> responderán `503` en `/api/health/ready`; si todos los targets del ALB quedan
> en estado *unhealthy*, AWS ALB aplica comportamiento *fail-open* y continúa
> enrutando tráfico hacia las instancias. Además, el limitador de intentos de
> `/api/admin/login` opera en memoria por instancia EC2 (no es global entre ambas).

## Pruebas y mediciones en Windows

Con Node.js instalado, ejecuta desde la carpeta del worktree en PowerShell:

```powershell
npm.cmd ci
node tests/pruebas_eventhub.js
node scripts/benchmark_eventhub.js
```

Para medir endpoints reales con el servidor iniciado (`npm.cmd start` en otra terminal):

```powershell
node scripts/benchmark_eventhub.js --live http://localhost:3000 --slug upc
```

Para medir consultas SQL y planes de ejecución en SSMS, abre y ejecuta
`database/analisis_rendimiento_ssms.sql` con *Include Actual Execution Plan* (`Ctrl+M`).

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
