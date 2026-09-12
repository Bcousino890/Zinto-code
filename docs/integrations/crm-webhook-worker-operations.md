# Operación: worker durable de webhooks CRM

El worker lee eventos de `crm_webhook_events`, obtiene un lease por empresa e
integración y entrega el webhook firmado. Las actualizaciones requieren el
token del lease; por tanto, dos procesos nunca pueden completar la misma
entrega. Aun así, se recomienda una sola réplica de worker para evitar sondeo
innecesario de la base de datos.

## Antes de desplegar

En una VPS administrada por PM2, ejecute las migraciones usando el entorno del
proceso `zinto`, no el de una sesión SSH nueva. Así el migrador usa exactamente
la misma conexión de base de datos y claves que la aplicación, sin mostrar sus
valores en la salida:

```bash
npm run db:migrate:pm2 -- validate
npm run db:migrate:pm2 -- run
```

El comando verifica internamente que el proceso `zinto` existe en `pm2 jlist`
y lanza el migrador como proceso hijo. Conserva las variables que PM2 sí
expone y también carga el `.env` privado del release, igual que el arranque de
Zinto; algunos despliegues no mantienen las variables de `.env` dentro de la
metadata de PM2. Si se usa otro nombre de proceso, indíquelo sin exponer
secretos:

```bash
PM2_APP_NAME=zinto-worker npm run db:migrate:pm2 -- status
```

No use `pm2 env` ni pegue la salida de `pm2 jlist` en tickets, chat o logs de
CI: ambos pueden incluir credenciales. El comando falla cerrado si el proceso
no existe o si PM2 devuelve una respuesta inválida. Antes de aplicar cambios,
conserve un respaldo de la base de datos y verifique el estado de PM2:

```bash
pm2 pid zinto
pm2 show zinto | sed -E '/(env|secret|token|password|key)/Id'
```

La migración `231-crm-bidirectional-integration-foundation.sql` crea las
tablas CRM, incluido `crm_webhook_events`. La migración
`232-crm-webhook-delivery-leases.sql` se aplica inmediatamente después en el
orden léxico del migrador y añade los campos de lease, resultados de entrega e
índice de reclamación. No edite ninguna de estas migraciones una vez aplicada:
los cambios posteriores deben ir en una migración nueva con numeración mayor.

Compruebe en la tabla `migrations` que ambas figuran como `success = true`
antes de activar el worker.
Si el arranque de migraciones falla, Zinto registra el error y no inicia el
worker de webhooks CRM en ese proceso.

### Diagnóstico seguro de un despliegue fallido

El flujo de GitHub Actions ejecuta los mismos dos comandos antes de `pm2
restart zinto`. Si fallan, no se reinicia el proceso; el release anterior sigue
atendiendo tráfico. En la VPS, desde `~/zinto`, ejecute solo la comprobación
que falló:

```bash
npm run db:migrate:pm2 -- validate
# o, si validate pasó:
npm run db:migrate:pm2 -- run
```

Comparta únicamente el nombre de la migración y el código de error. Nunca
comparta `DATABASE_URL`, la salida de PM2 ni archivos `.env`.

## Topología recomendada

En un despliegue con varias réplicas HTTP, habilite el worker solo en una:

```bash
# réplica worker
DURABLE_WEBHOOK_WORKER_ENABLED=true
DURABLE_WEBHOOK_WORKER_INTERVAL_MS=5000

# réplicas HTTP solamente
DURABLE_WEBHOOK_WORKER_ENABLED=false
```

`DURABLE_WEBHOOK_WORKER_INTERVAL_MS` acepta enteros entre 1.000 y 3.600.000
milisegundos; un valor inválido utiliza 5.000 ms. El valor por defecto de
`DURABLE_WEBHOOK_WORKER_ENABLED` es `true` para conservar el comportamiento en
instalaciones de una sola réplica.

El ciclo de vida del proceso permite solo un scheduler. En `SIGTERM` o `SIGINT`
se detiene el timer antes de finalizar; una ejecución ya iniciada conserva su
lease y se recupera al expirar si el proceso termina durante la entrega.

## Verificación posterior

1. Cree un evento pendiente para una integración activa con URL HTTPS y secreto cifrado.
2. Observe un cambio a `delivered` tras una respuesta 2xx, o `pending` con
   `next_attempt_at` para errores transitorios.
3. Confirme que los logs muestran exactamente un mensaje de inicio por réplica
   habilitada y ninguno en las réplicas con el worker deshabilitado.
4. Supervise eventos con lease vencido, `last_error` y reintentos agotados.
