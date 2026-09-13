# Plan de implementación: sincronización de planes y cupones con Stripe

> **Para agentes de implementación:** SUB-SKILL OBLIGATORIA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Sincronizar automáticamente el catálogo de planes y cupones de Zinto con Stripe y garantizar que cada pago use importes, descuentos y estados verificados exclusivamente por el servidor.

**Arquitectura:** Zinto será la fuente oficial. Un servicio aislado reconciliará productos, precios, cupones y códigos promocionales mediante identificadores locales, metadatos e idempotencia; una bandeja de salida persistente permitirá reintentos. Los flujos de checkout y webhook consumirán únicamente referencias sincronizadas y validarán el resultado antes de activar una suscripción.

**Stack tecnológico:** TypeScript, Express, React, Stripe Node SDK, Drizzle ORM/PostgreSQL, Zod y `node:test`.

**Especificación:** `docs/superpowers/specs/2026-09-13-stripe-plan-coupon-sync-design.md`

## Restricciones globales

- Zinto es la fuente oficial de planes y cupones.
- La moneda de importe fijo será la moneda general configurada; actualmente EUR.
- No se acumulan descuentos: se aplica el descuento válido que produzca el menor total.
- Los precios de Stripe se reemplazan y archivan; nunca se modifican ni eliminan.
- Ninguna suscripción existente cambia de precio automáticamente.
- El cliente nunca puede decidir importe, moneda, precio Stripe, descuento ni periodo de prueba.
- Los secretos de Stripe permanecen en servidor y se ocultan en registros y respuestas.
- La sincronización automática se despliega inicialmente desactivada y se habilita tras una simulación revisada.

---

### Tarea 1: Modelo monetario, intervalos y selección de descuentos

**Archivos:**
- Crear: `server/services/stripe-catalog-domain.ts`
- Probar: `tests/stripe-catalog-domain.test.ts`

**Interfaces:**
- Produce: `toMinorUnits(amount: string | number, currency: string): number`
- Produce: `mapBillingInterval(interval: string, customDays?: number | null): Stripe.PriceCreateParams.Recurring | null`
- Produce: `chooseBestDiscount(plan: PlanLike, coupon?: CouponLike | null, now?: Date): DiscountDecision`
- Produce: `catalogFingerprint(value: unknown): string`

- [ ] **Paso 1: escribir pruebas fallidas de dominio**

```ts
test('convierte EUR a céntimos sin errores flotantes', () => {
  assert.equal(toMinorUnits('29.25', 'EUR'), 2925);
});

test('mapea trimestral a tres meses', () => {
  assert.deepEqual(mapBillingInterval('quarterly'), { interval: 'month', interval_count: 3 });
});

test('elige el descuento con menor total sin acumularlos', () => {
  assert.equal(chooseBestDiscount(planWith25Percent, couponWith10Percent).source, 'plan');
});
```

- [ ] **Paso 2: ejecutar y confirmar RED**

Ejecutar: `node --import tsx --test tests/stripe-catalog-domain.test.ts`

Esperado: falla porque `stripe-catalog-domain.ts` todavía no existe.

- [ ] **Paso 3: implementar conversiones deterministas y validación estricta**

```ts
export function toMinorUnits(amount: string | number, currency: string): number {
  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error('Invalid monetary amount');
  return Math.round(Number(normalized) * 10 ** exponent);
}
```

Incluir todos los intervalos actuales y rechazar `custom` cuando no pueda expresarse exactamente en días, semanas, meses o años de Stripe.

- [ ] **Paso 4: ejecutar y confirmar GREEN**

Ejecutar: `node --import tsx --test tests/stripe-catalog-domain.test.ts`

Esperado: todas las pruebas pasan.

- [ ] **Paso 5: commit**

```bash
git add server/services/stripe-catalog-domain.ts tests/stripe-catalog-domain.test.ts
git commit -m "feat: add Stripe catalog domain rules"
```

### Tarea 2: Persistencia de correspondencias y bandeja de salida

**Archivos:**
- Crear: `migrations/234-stripe-catalog-sync.sql`
- Modificar: `shared/schema.ts`
- Modificar: `server/storage.ts`
- Probar: `tests/stripe-catalog-sync-migration.test.ts`

**Interfaces:**
- Produce: `stripeCatalogSyncJobs` y tipos `StripeCatalogSyncJob`/`InsertStripeCatalogSyncJob`
- Produce en storage: `enqueueStripeCatalogSync`, `claimStripeCatalogSyncJobs`, `completeStripeCatalogSyncJob`, `failStripeCatalogSyncJob`

- [ ] **Paso 1: escribir una prueba fallida que inspeccione columnas e índices de la migración**

```ts
test('la migración agrega correspondencias y deduplicación de trabajos', () => {
  assert.match(sql, /stripe_product_id/);
  assert.match(sql, /stripe_promotion_code_id/);
  assert.match(sql, /UNIQUE.*entity_type.*entity_id.*fingerprint/is);
});
```

- [ ] **Paso 2: ejecutar y confirmar RED**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-migration.test.ts`

Esperado: falla porque no existe la migración.

- [ ] **Paso 3: crear migración aditiva y esquema Drizzle**

Agregar a planes y cupones IDs Stripe, estado `pending|synced|failed`, error, fecha y huella. Crear `stripe_catalog_sync_jobs` con estado, intentos, próxima ejecución, bloqueo y restricción única `(entity_type, entity_id, fingerprint)`.

- [ ] **Paso 4: implementar operaciones storage atómicas**

```ts
enqueueStripeCatalogSync(input: {
  entityType: 'plan' | 'coupon'; entityId: number; operation: 'upsert' | 'archive'; fingerprint: string;
}): Promise<StripeCatalogSyncJob>;
```

- [ ] **Paso 5: verificar migración, tipos y prueba**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-migration.test.ts && NODE_OPTIONS=--max-old-space-size=4096 npm run check`

Esperado: prueba y TypeScript finalizan con código 0.

- [ ] **Paso 6: commit**

```bash
git add migrations/234-stripe-catalog-sync.sql shared/schema.ts server/storage.ts tests/stripe-catalog-sync-migration.test.ts
git commit -m "feat: persist Stripe catalog synchronization"
```

### Tarea 3: Servicio idempotente de catálogo Stripe

**Archivos:**
- Crear: `server/services/stripe-catalog-sync-service.ts`
- Crear: `server/services/stripe-client-provider.ts`
- Probar: `tests/stripe-catalog-sync-service.test.ts`

**Interfaces:**
- Consume: reglas de Tarea 1 y storage de Tarea 2.
- Produce: `syncPlan(planId: number, options?: { dryRun?: boolean }): Promise<SyncResult>`
- Produce: `syncCoupon(couponId: number, options?: { dryRun?: boolean }): Promise<SyncResult>`
- Produce: `archivePlan(planId: number): Promise<SyncResult>` y `archiveCoupon(couponId: number): Promise<SyncResult>`

- [ ] **Paso 1: escribir pruebas fallidas con un cliente Stripe falso**

Cubrir creación única, reejecución sin duplicados, cambio de precio que crea y archiva, actualización de texto sin precio nuevo, cupón reemplazado y modo simulación sin escrituras.

```ts
assert.equal(fakeStripe.products.created.length, 1);
await service.syncPlan(plan.id);
assert.equal(fakeStripe.products.created.length, 1);
```

- [ ] **Paso 2: ejecutar y confirmar RED**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-service.test.ts`

Esperado: falla por módulos ausentes.

- [ ] **Paso 3: implementar proveedor seguro y servicio**

El proveedor leerá `payment_stripe`, rechazará configuración incompleta y nunca incluirá secretos en errores. Cada creación usará `metadata.zinto_plan_id` o `metadata.zinto_coupon_id` y claves de idempotencia derivadas de huellas.

- [ ] **Paso 4: ejecutar y confirmar GREEN**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-service.test.ts`

Esperado: todas las pruebas pasan.

- [ ] **Paso 5: commit**

```bash
git add server/services/stripe-client-provider.ts server/services/stripe-catalog-sync-service.ts tests/stripe-catalog-sync-service.test.ts
git commit -m "feat: synchronize Stripe catalog objects"
```

### Tarea 4: Integrar sincronización en CRUD de planes y cupones

**Archivos:**
- Modificar: `server/plan-routes.ts`
- Modificar: `server/routes/admin/coupon-routes.ts`
- Crear: `server/routes/admin/stripe-catalog-routes.ts`
- Modificar: `server/routes.ts`
- Probar: `tests/stripe-catalog-admin-routes.test.ts`

**Interfaces:**
- Produce: `POST /api/admin/stripe-catalog/sync` con `{ dryRun: boolean }`
- Produce: `GET /api/admin/stripe-catalog/status`
- Produce: `POST /api/admin/stripe-catalog/retry/:entityType/:entityId`

- [ ] **Paso 1: escribir pruebas fallidas de autorización, encolado y eliminación segura**

```ts
assert.equal(anonymousSync.status, 403);
assert.equal(createdPlan.stripeSyncStatus, 'pending');
assert.equal(deleteWhenArchiveFails.status, 502);
```

- [ ] **Paso 2: ejecutar y confirmar RED**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-catalog-admin-routes.test.ts`

- [ ] **Paso 3: encolar upsert después de crear/actualizar y archivar antes de eliminar**

No aceptar IDs Stripe ni estados de sincronización desde `req.body`; construir esos campos exclusivamente en servidor.

- [ ] **Paso 4: implementar endpoints de simulación, estado y reintento solo para superadministradores**

- [ ] **Paso 5: ejecutar pruebas y confirmar GREEN**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-catalog-admin-routes.test.ts`

- [ ] **Paso 6: commit**

```bash
git add server/plan-routes.ts server/routes/admin/coupon-routes.ts server/routes/admin/stripe-catalog-routes.ts server/routes.ts tests/stripe-catalog-admin-routes.test.ts
git commit -m "feat: sync plan and coupon changes with Stripe"
```

### Tarea 5: Procesador de trabajos con reintentos y concurrencia

**Archivos:**
- Crear: `server/services/stripe-catalog-sync-worker.ts`
- Modificar: `server/index.ts`
- Probar: `tests/stripe-catalog-sync-worker.test.ts`

**Interfaces:**
- Produce: `runStripeCatalogSyncBatch(limit?: number): Promise<BatchResult>`
- Produce: `startStripeCatalogSyncWorker(): () => void`

- [ ] **Paso 1: escribir pruebas fallidas de reclamación, obsolescencia y backoff**

Comprobar que dos workers no procesan el mismo trabajo, que una huella antigua se omite y que el retraso queda limitado.

- [ ] **Paso 2: ejecutar RED**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-worker.test.ts`

- [ ] **Paso 3: implementar worker desactivado por defecto**

Activarlo únicamente cuando `STRIPE_CATALOG_AUTO_SYNC=true`. Limitar intentos, usar bloqueo con vencimiento y sanear errores antes de persistirlos.

- [ ] **Paso 4: ejecutar GREEN y commit**

Ejecutar: `node --import tsx --test tests/stripe-catalog-sync-worker.test.ts`

```bash
git add server/services/stripe-catalog-sync-worker.ts server/index.ts tests/stripe-catalog-sync-worker.test.ts
git commit -m "feat: process Stripe catalog sync jobs"
```

### Tarea 6: Checkout seguro con precios y cupones sincronizados

**Archivos:**
- Crear: `server/services/stripe-checkout-service.ts`
- Modificar: `server/payment-routes.ts`
- Modificar: `server/routes/enhanced-subscription.ts`
- Modificar: `client/src/components/settings/CheckoutDialog.tsx`
- Probar: `tests/stripe-checkout-integrity.test.ts`

**Interfaces:**
- Produce: `createStripeCheckout(input: { companyId: number; userId: number; planId: number; couponCode?: string; renewal?: boolean }): Promise<CheckoutResult>`

- [ ] **Paso 1: escribir pruebas fallidas de integridad**

```ts
assert.equal(fakeStripe.lastSession.line_items[0].price, storedPlan.stripePriceId);
assert.equal(fakeStripe.lastSession.amount_total, undefined);
assert.equal(tamperedRequest.body.amount, 1);
assert.equal(fakeStripe.lastSession.line_items[0].price, storedPlan.stripePriceId);
```

Cubrir plan inactivo, precio no sincronizado, cupón vencido, mínimo, límite por usuario, mejor descuento, prueba y clave idempotente.

- [ ] **Paso 2: ejecutar RED**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-checkout-integrity.test.ts`

- [ ] **Paso 3: implementar servicio y sustituir `price_data` por `stripePriceId`**

Crear Checkout en modo `subscription` para planes recurrentes y `payment` para `lifetime`. Aplicar exactamente un `discounts: [{ coupon: id }]`; nunca usar `allow_promotion_codes` porque Zinto debe validar restricciones propias.

- [ ] **Paso 4: conectar campo de cupón y renovaciones al mismo servicio**

- [ ] **Paso 5: ejecutar GREEN y commit**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-checkout-integrity.test.ts`

```bash
git add server/services/stripe-checkout-service.ts server/payment-routes.ts server/routes/enhanced-subscription.ts client/src/components/settings/CheckoutDialog.tsx tests/stripe-checkout-integrity.test.ts
git commit -m "feat: enforce synchronized Stripe checkout pricing"
```

### Tarea 7: Webhooks, activación y uso de cupones

**Archivos:**
- Modificar: `server/admin-routes.ts`
- Modificar: `server/services/subscription-webhooks.ts`
- Modificar: `server/storage.ts`
- Probar: `tests/stripe-webhook-payment-integrity.test.ts`

**Interfaces:**
- Produce: `verifyStripePaymentOutcome(event): Promise<VerifiedPaymentOutcome>`
- Produce: registro atómico de transacción, activación y uso de cupón.

- [ ] **Paso 1: escribir pruebas fallidas para firma, repetición y discrepancias**

Cubrir firma inválida, mismo evento dos veces, importe incorrecto, moneda incorrecta, empresa/plan inexistentes, pago fallido y éxito único.

- [ ] **Paso 2: ejecutar RED**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-webhook-payment-integrity.test.ts`

- [ ] **Paso 3: verificar cuerpo crudo, firma y valores esperados antes de activar**

La transacción de base de datos debe bloquear la empresa, insertar el ID de evento de forma única, verificar el resultado y registrar uso de cupón solo una vez.

- [ ] **Paso 4: ejecutar GREEN y commit**

Ejecutar: `node --experimental-test-module-mocks --import tsx --test tests/stripe-webhook-payment-integrity.test.ts`

```bash
git add server/admin-routes.ts server/services/subscription-webhooks.ts server/storage.ts tests/stripe-webhook-payment-integrity.test.ts
git commit -m "fix: verify Stripe payment outcomes before activation"
```

### Tarea 8: Estado y controles en administración

**Archivos:**
- Modificar: `client/src/pages/admin/plans/index.tsx`
- Modificar: `client/src/pages/admin/coupons/index.tsx`
- Crear: `client/src/hooks/use-stripe-catalog-sync.ts`
- Probar: `tests/stripe-catalog-ui-contract.test.ts`

**Interfaces:**
- Consume los tres endpoints administrativos de la Tarea 4.
- Produce indicadores `Pendiente`, `Sincronizado`, `Error`, botón de simulación/sincronización y reintento.

- [ ] **Paso 1: escribir prueba de contrato fallida para estados y acciones**

- [ ] **Paso 2: ejecutar RED**

Ejecutar: `node --import tsx --test tests/stripe-catalog-ui-contract.test.ts`

- [ ] **Paso 3: implementar hook y controles sin mostrar secretos**

La primera acción ejecutará `dryRun: true` y mostrará un resumen exacto. La ejecución real requerirá una confirmación explícita con cantidades.

- [ ] **Paso 4: ejecutar GREEN y commit**

Ejecutar: `node --import tsx --test tests/stripe-catalog-ui-contract.test.ts`

```bash
git add client/src/pages/admin/plans/index.tsx client/src/pages/admin/coupons/index.tsx client/src/hooks/use-stripe-catalog-sync.ts tests/stripe-catalog-ui-contract.test.ts
git commit -m "feat: show Stripe catalog sync controls"
```

### Tarea 9: Verificación integral y revisión de seguridad

**Archivos:**
- Modificar si es necesario: únicamente archivos de las tareas anteriores.
- Crear: `docs/stripe-catalog-sync-runbook.md`

**Interfaces:**
- Produce un procedimiento de simulación, reconciliación, activación, reversión y rotación de claves.

- [ ] **Paso 1: ejecutar todas las pruebas específicas**

```bash
node --import tsx --test tests/stripe-catalog-domain.test.ts tests/stripe-catalog-sync-migration.test.ts tests/stripe-catalog-sync-service.test.ts tests/stripe-catalog-sync-worker.test.ts tests/stripe-catalog-ui-contract.test.ts
node --experimental-test-module-mocks --import tsx --test tests/stripe-catalog-admin-routes.test.ts tests/stripe-checkout-integrity.test.ts tests/stripe-webhook-payment-integrity.test.ts
```

- [ ] **Paso 2: ejecutar comprobación de tipos y build**

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run check
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

- [ ] **Paso 3: ejecutar revisión de seguridad del diff**

Usar `codex-security:security-diff-scan` sobre todos los cambios y resolver cualquier hallazgo validado relacionado con secretos, autorización, manipulación de importes, repetición o duplicación de cobros.

- [ ] **Paso 4: crear runbook y realizar simulación**

Documentar comandos y resultados. La simulación debe listar objetos a crear/actualizar/archivar y efectuar cero escrituras en Stripe.

- [ ] **Paso 5: revisión manual antes de producción**

Confirmar que `STRIPE_CATALOG_AUTO_SYNC` sigue desactivado, que no existen secretos en `git diff`, y que ninguna suscripción existente se migrará.

- [ ] **Paso 6: commit**

```bash
git add docs/stripe-catalog-sync-runbook.md
git commit -m "docs: add Stripe catalog sync runbook"
```
