# Informe de Tarea 5: Procesador de trabajos con reintentos y concurrencia

## Alcance implementado

- `server/services/stripe-catalog-sync-worker.ts` (nuevo): `runStripeCatalogSyncBatch(limit?, dependencies?)` y `startStripeCatalogSyncWorker(options?)`, exactamente las interfaces del plan (el segundo parámetro de inyección de dependencias en ambas funciones es una elaboración necesaria para probarlas sin Stripe/PostgreSQL reales, siguiendo el mismo patrón de `defaultDependencies`/`Partial<...>` ya usado en `server/routes/admin/stripe-catalog-routes.ts` de la Tarea 4).
- El procesador consume exclusivamente `claimStripeCatalogSyncJobs`, `completeStripeCatalogSyncJob` y `failStripeCatalogSyncJob` de `server/storage.ts` (Tarea 2). No se tocó la tabla `stripe_catalog_sync_jobs` con SQL propio ni se añadió ningún método nuevo de storage: no se encontró ninguna carencia genuina que lo justificara.
- Cada trabajo reclamado se despacha según `operation` (`upsert`/`archive`) **y** `entityType` (`plan`/`coupon`) hacia el método correspondiente de `StripeCatalogSyncService` (Tarea 3): `syncPlan`, `syncCoupon`, `archivePlan` o `archiveCoupon`. Ninguna ruta HTTP actual encola todavía trabajos `operation: 'archive'` (Tarea 4 archiva de forma síncrona antes de borrar, sin pasar por la bandeja de salida), pero el esquema y `decideStripeCatalogSyncEnqueue` sí contemplan `archive` como caso de primera clase, así que el despacho lo implementa igualmente: omitirlo habría sido un fallo de corrección latente (un trabajo `archive` mal manejado podría recrear silenciosamente un producto Stripe que debía archivarse).
- **Fencing/claim token:** cada llamada a `complete`/`fail` reenvía el `claimToken` exacto con el que se reclamó el trabajo. Un resultado `undefined` (la mutación no coincidió porque el lease expiró o fue robado por otro worker) se cuenta en `staleLeases` y se abandona sin reintentar, sin lanzar y sin aplicar dos veces — nunca se trata como error.
- **Concurrencia:** el lote se procesa con un `for...of` secuencial (nunca `Promise.all`), así que dos trabajos de la misma entidad jamás están en vuelo a la vez dentro de un lote, incluso si `claimStripeCatalogSyncJobs` llegara a devolver dos filas para la misma entidad. Esto es independiente y adicional a la garantía ya existente en la SQL real de Tarea 2 (`NOT EXISTS earlier ...`), que solo permite reclamar el trabajo más antiguo no resuelto por entidad.
- **Reintentos y dead-letter:** se leyó primero `failStripeCatalogSyncJob` (`server/storage.ts:2577-2602`) y se confirmó que **no** calcula backoff — persiste tal cual el `nextAttemptAt` que se le pase, o marca `failed` si se omite. Por tanto la política de reintentos pertenece al worker, no duplica nada ya correcto en `storage.ts`. Se implementó `decideStripeCatalogSyncJobRetry(attempts, now)`: backoff exponencial capado (base 30 s, doblando por intento, tope 3600 s) hasta `MAX_ATTEMPTS = 5`; en el intento 5 devuelve `nextAttemptAt: null`, lo que hace que `failStripeCatalogSyncJob` deje el trabajo en el estado terminal `failed` (confirmado en la migración `migrations/234-stripe-catalog-sync.sql:51-52` y en `shared/schema.ts:3963-3965`: el enum de `status` es `pending|processing|completed|failed`). Un trabajo `failed` nunca vuelve a ser reclamado (la claim SQL solo selecciona `pending` o `processing` vencido), así que queda en un estado terminal inspeccionable por un humano o herramienta futura directamente en la tabla.
- **Saneamiento de errores:** todo error se pasa por `sanitizeStripeCatalogError` (Tarea 3, `server/services/stripe-client-provider.ts`) antes de persistirlo en `last_error` o de emitirlo en logs; nunca se registra el objeto de error crudo ni una carga de Stripe completa.
- **Bandera de característica:** `startStripeCatalogSyncWorker()` es no-op (devuelve una función de parada inerte, sin programar ningún temporizador ni ejecutar ningún lote) a menos que `STRIPE_CATALOG_AUTO_SYNC` sea exactamente `'true'`. Un tick que llega mientras un lote sigue en curso se descarta (sin solapar lotes), y un tick encolado que dispara después de `stop()` tampoco hace nada.
- **`server/index.ts`:** se añade `stopStripeCatalogSyncWorker` junto al patrón ya existente de `durableWebhookWorkerLifecycle` — se invoca incondicionalmente en el arranque (no-op salvo bandera activa) y se detiene en `SIGTERM`/`SIGINT`, replicando el estilo exacto de la sección "Durable CRM webhook delivery worker" inmediatamente anterior.

## Evidencia TDD

### RED

```text
node --import tsx --test tests/stripe-catalog-sync-worker.test.ts

Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../server/services/stripe-catalog-sync-worker' imported from
'.../tests/stripe-catalog-sync-worker.test.ts'
tests 1, pass 0, fail 1
```

Confirmado: falla porque `stripe-catalog-sync-worker.ts` todavía no existía, igual que documenta `task-4-report.md` para su propio RED.

### GREEN

```text
node --import tsx --test tests/stripe-catalog-sync-worker.test.ts
tests 8
pass 8
fail 0
```

Las 8 pruebas cubren: despacho correcto por `operation`×`entityType` (las 4 combinaciones), no-concurrencia de la misma entidad dentro de un lote (dos filas de la misma entidad entregadas deliberadamente juntas por un storage falso, con un servicio falso que detecta reentradas), dos lotes concurrentes sobre el mismo storage nunca procesan el mismo trabajo (usando un storage en memoria que reclama de forma síncrona, igual que la transacción real con `FOR UPDATE SKIP LOCKED`), lease vencido reclamado por otro worker con `complete` tardío y con token obsoleto como no-op seguro, reintento con backoff creciente (30/60/120/240 s) hasta el intento 5 que pasa a `failed` y deja de ser reclamable, la función pura de backoff, y el arranque/parada del planificador (bandera desactivada por defecto, no solapamiento, parada limpia).

## Verificación final

```text
node --import tsx --test \
  tests/stripe-catalog-domain.test.ts \
  tests/stripe-catalog-sync-migration.test.ts \
  tests/stripe-catalog-sync-service.test.ts \
  tests/stripe-catalog-sync-storage.test.ts \
  tests/stripe-catalog-sync-worker.test.ts
tests 56, pass 56, fail 0

node --experimental-test-module-mocks --import tsx --test \
  tests/stripe-catalog-admin-routes.test.ts tests/csrf-protection.test.ts
tests 6, pass 6, fail 0

NODE_OPTIONS=--max-old-space-size=4096 npm run check
exit code 0 (sin salida de tsc, sin errores)
```

No se realizó ninguna llamada real a Stripe ni a PostgreSQL: todas las pruebas usan un storage en memoria hecho a mano y un servicio de sincronización falso inyectados por parámetro, siguiendo el mismo estilo sin librerías de mocking que `tests/stripe-catalog-sync-service.test.ts`. Este entorno no tiene servidor PostgreSQL disponible, igual que en la Tarea 2; no se intentó ninguna conexión real.

## Desviaciones del plan y justificación

- Ambas funciones exportadas aceptan un segundo parámetro opcional de dependencias (`StripeCatalogSyncBatchDependencies` / `StripeCatalogSyncWorkerOptions`) además del `limit`/nada que menciona el plan. Es imprescindible para poder inyectar el storage y el servicio de sincronización falsos en las pruebas sin recurrir a `--experimental-test-module-mocks` (que el propio plan no solicita para este archivo) y sin tocar nunca Stripe/PostgreSQL reales. El comportamiento por defecto de producción (sin argumentos) es exactamente el descrito en el plan.
- Se añadió `staleLeases` al `BatchResult` (no mencionado explícitamente en el plan) para poder observar en logs cuántas mutaciones perdieron el fencing check, distinguiéndolas de éxitos/reintentos/dead-letters reales. Es puramente aditivo y no cambia el contrato de las tres métricas que sí pide la tarea (procesados/exitosos/reintentados/dead-letter).
- Se implementó el despacho para `operation: 'archive'` aunque ninguna ruta lo encola todavía hoy (ver arriba). Se considera parte necesaria de "llamar al método correcto según el trabajo reclamado", no una ampliación de alcance.

## Alcance de commits para revisión

- Implementación: `5750498..b59ad0e` (un commit, `b59ad0e`, "feat: process Stripe catalog sync jobs").
- Archivos: `server/services/stripe-catalog-sync-worker.ts` (nuevo), `server/index.ts` (modificado), `tests/stripe-catalog-sync-worker.test.ts` (nuevo).
