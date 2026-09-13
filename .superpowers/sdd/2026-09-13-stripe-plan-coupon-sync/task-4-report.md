# Informe de Tarea 4: Integración de catálogo Stripe en rutas administrativas

## Alcance implementado

- Las creaciones y actualizaciones de planes y cupones marcan el registro persistido como `pending` y encolan un trabajo `upsert` cuya huella se calcula exclusivamente desde el registro almacenado.
- Los campos Stripe y el estado de sincronización enviados en el cuerpo HTTP no forman parte de los esquemas aceptados y no se usan para crear trabajos ni respuestas.
- Antes de borrar un plan o cupón, la ruta intenta archivarlo mediante `StripeCatalogSyncService`. Un fallo devuelve `502` y no ejecuta el borrado local.
- Se añadieron rutas exclusivas de superadministrador: `POST /api/admin/stripe-catalog/sync`, `GET /api/admin/stripe-catalog/status` y `POST /api/admin/stripe-catalog/retry/:entityType/:entityId`.
- El dry-run compone el servicio con un cliente local que falla si se intentara acceder a Stripe; no crea clientes Stripe ni realiza peticiones remotas durante la simulación.

## Evidencia TDD

### RED

La primera ejecución de la nueva suite falló con `ERR_MODULE_NOT_FOUND` porque aún no existía `server/routes/admin/stripe-catalog-routes.ts`.

Tras añadir el contrato de rutas, la siguiente ejecución falló por los comportamientos buscados: no se encolaban trabajos después de crear plan/cupón y los deletes devolvían `200` sin archivar. Estas fallas guiaron la integración de outbox y archivado previo.

### GREEN

```text
node --experimental-test-module-mocks --import tsx --test tests/stripe-catalog-admin-routes.test.ts
4 tests, 4 passed, 0 failed
```

Las pruebas cubren guard superadmin, dry-run sin cliente Stripe, estado, reintento validado, encolado tras creación, rechazo de IDs/estados Stripe del cliente y abortado de deletes cuando falla el archivado.

## Verificación final

```text
node --experimental-test-module-mocks --import tsx --test \
  tests/stripe-catalog-admin-routes.test.ts \
  tests/stripe-catalog-domain.test.ts \
  tests/stripe-catalog-sync-migration.test.ts \
  tests/stripe-catalog-sync-storage.test.ts \
  tests/stripe-catalog-sync-service.test.ts
52 tests, 52 passed, 0 failed

NODE_OPTIONS=--max-old-space-size=4096 npm run check
exit 0
```

No se efectuó ninguna llamada a Stripe real: las pruebas usan servicios inyectados y el dry-run usa un proxy local sin operaciones remotas.

## Nota operativa

El proyecto no define un script `npm test`; por ello se ejecutaron las suites TypeScript relevantes de las Tareas 1–4 y el chequeo completo de TypeScript.
