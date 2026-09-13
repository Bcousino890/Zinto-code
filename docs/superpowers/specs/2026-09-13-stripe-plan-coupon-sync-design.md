# Diseño de sincronización de planes y cupones con Stripe

## Objetivo

Convertir a Zinto en la fuente oficial de información para los planes de suscripción y los códigos de cupón, manteniendo sincronizado automáticamente el catálogo de Stripe en producción. Los cambios realizados en `/admin/plans` y `/admin/coupons` deben propagarse de forma segura a Stripe sin duplicar productos, precios, cupones, códigos promocionales, suscripciones ni cobros.

## Alcance

- Sincronizar todos los planes y cupones existentes con Stripe mediante una reconciliación inicial explícita.
- Sincronizar automáticamente las operaciones posteriores de creación, actualización, desactivación y eliminación.
- Utilizar la cuenta de Stripe configurada en la aplicación y respetar el modo de producción o prueba seleccionado.
- Aplicar los precios y descuentos sincronizados tanto en el pago inicial como en las renovaciones.
- Mostrar el estado de sincronización y errores accionables a los superadministradores.
- Probar la idempotencia, los cálculos de importes, los cambios de estado, el procesamiento de webhooks y la protección de secretos.

## Fuente oficial y reglas de precios

Zinto seguirá siendo la fuente oficial. Los identificadores de Stripe y el estado de sincronización se guardarán en los registros correspondientes de Zinto.

Cuando un plan tenga descuento, `originalPrice` será el importe recurrente base en Stripe y el descuento propio del plan se representará mediante un cupón de Stripe aplicado al crear el pago o la suscripción. Cuando el plan no tenga un descuento activo, `price` será el importe recurrente en Stripe. El total mostrado y cobrado al cliente deberá coincidir con el importe final calculado por Zinto.

Los cupones independientes de `/admin/coupons` se sincronizarán como cupones y códigos promocionales de Stripe. El pago aplicará como máximo un descuento: el descuento propio del plan o un cupón introducido por el usuario. Como el modelo actual no define una política de acumulación, los descuentos no se acumularán. Si existe un cupón válido del usuario, el servidor comparará ambos descuentos y aplicará el que produzca el menor importe final para el cliente.

Los cupones de importe fijo utilizarán la moneda configurada en la aplicación, actualmente EUR. Los cupones porcentuales serán independientes de la moneda. Los días de prueba se conservarán como información del plan y se aplicarán al crear la suscripción en Stripe; no formarán parte del precio.

## Correspondencia de objetos en Stripe

Cada plan guardará:

- `stripeProductId`
- `stripePriceId`
- `stripePlanCouponId` cuando el plan tenga un descuento incorporado
- `stripeSyncStatus`: `pending`, `synced` o `failed`
- `stripeSyncError`
- `stripeSyncedAt`
- una huella determinista de sincronización que abarque todos los campos facturables

Cada cupón guardará:

- `stripeCouponId`
- `stripePromotionCodeId`
- los mismos campos de estado, error, fecha y huella de sincronización

Los metadatos de Stripe incluirán `zinto_plan_id` o `zinto_coupon_id`, el entorno y la versión del esquema. Estos identificadores permitirán reconciliar los sistemas si faltan identificadores locales.

## Ciclo de vida de los planes

### Creación

Después de crear un plan en la base de datos, se pondrá en cola una sincronización idempotente. El proceso creará un producto de Stripe y un precio activo. Los intervalos de Zinto compatibles se convertirán al intervalo y multiplicador correspondiente de Stripe. Los planes `lifetime` utilizarán un precio de pago único. Las duraciones personalizadas que Stripe no pueda representar fallarán con un error visible, sin sustituirse silenciosamente por otro periodo.

### Actualización

Los cambios de nombre, descripción y estado activo actualizarán el producto existente. Los precios de Stripe son inmutables: cambiar el importe, la moneda o el intervalo creará un precio nuevo, lo establecerá como precio predeterminado, guardará su identificador y desactivará el precio anterior. Las suscripciones existentes conservarán su precio anterior; ningún cliente cambiará de precio silenciosamente.

Cambiar el descuento incorporado de un plan creará un cupón de Stripe de reemplazo, porque sus campos monetarios son inmutables. Los nuevos pagos usarán el cupón actualizado y el objeto promocional anterior quedará retirado cuando corresponda.

### Desactivación o eliminación

Desactivar un plan en Zinto desactivará su producto y precio actuales en Stripe. La eliminación realizará primero el mismo archivado y después eliminará el registro local. Los objetos históricos de Stripe nunca se eliminarán definitivamente. Si el archivado en Stripe falla, se rechazará la eliminación para evitar que ambos sistemas queden desincronizados silenciosamente.

## Ciclo de vida de los cupones

Crear un cupón generará un cupón y un código promocional de Stripe con el mismo código público. Los cambios de campos de descuento inmutables crearán objetos de reemplazo y desactivarán el código promocional anterior. Las fechas de activación, límites de uso, estado y productos permitidos se actualizarán o reemplazarán según lo admita Stripe.

`usageLimitPerUser` y `minimumPlanValue` seguirán siendo validados por Zinto porque los códigos promocionales de Stripe no expresan todas las restricciones actuales. Zinto validará el cupón antes de crear el pago y solo enviará a Stripe el identificador de un descuento ya sincronizado. El uso del cupón se registrará únicamente después de recibir un webhook de pago exitoso verificado, nunca al abrir la pantalla de pago.

## Arquitectura de sincronización

Un servicio específico, `StripeCatalogSyncService`, será responsable de las operaciones del catálogo de Stripe y no contendrá lógica HTTP. Las rutas de planes y cupones llamarán a un coordinador de sincronización respaldado por una bandeja de salida después de validar y guardar los datos locales. Una tabla de trabajos guardará el tipo de operación, el identificador de la entidad, la huella, el número de intentos, el último error y la fecha de finalización.

El endpoint de sincronización inicial estará limitado a superadministradores y reconciliará todos los planes y cupones. Será idempotente y podrá ejecutarse varias veces sin crear duplicados. Un endpoint de estado mostrará cantidades y elementos fallidos en la interfaz administrativa. Una acción manual «Sincronizar con Stripe» permitirá reintentar registros fallidos o desactualizados.

Los reintentos automáticos usarán espera exponencial limitada. Las claves de idempotencia de Stripe serán deterministas según la entidad, operación y huella. Los cambios simultáneos se serializarán por entidad y los trabajos antiguos volverán a leer el registro más reciente antes de llamar a Stripe.

## Integridad del pago

El pago utilizará exclusivamente el `stripePriceId` guardado en el plan seleccionado. El servidor ignorará cualquier importe, moneda, identificador de precio, identificador de descuento o periodo de prueba enviado por el cliente. Cargará el plan y el cupón desde la base de datos, recalculará el importe final, validará su vigencia y elegibilidad, y creará la sesión de Stripe Checkout con metadatos deterministas.

El procesamiento de webhooks verificará el cuerpo original de la solicitud y la firma de Stripe, y evitará procesar dos veces el mismo identificador de evento. Antes de modificar una suscripción, validará los metadatos del plan y la empresa. El plan, importe, moneda, cliente y estado de pago recibidos se compararán con los registros calculados por el servidor. Las discrepancias se registrarán y aislarán en lugar de activar el acceso.

Las claves de idempotencia impedirán crear pagos, sesiones o suscripciones duplicadas durante reintentos. Las restricciones únicas de la base de datos impedirán procesamientos duplicados y correspondencias activas repetidas.

## Secretos y registros

Las claves secretas y los secretos de webhook de Stripe permanecerán exclusivamente en el servidor y nunca se devolverán mediante los endpoints de catálogo o pago. Los registros ocultarán claves API, firmas de webhook, datos de pago del cliente y cargas completas de Stripe. Las respuestas administrativas solo devolverán identificadores de objetos de Stripe y mensajes de error saneados.

## Comportamiento ante fallos

Los planes y cupones permanecerán guardados si falla una sincronización asíncrona, excepto durante una eliminación, que fallará de forma segura cuando no pueda confirmarse el archivado en Stripe. Los elementos fallidos mostrarán el estado `failed` y podrán reintentarse. El pago se bloqueará para cualquier plan de pago que no tenga un precio sincronizado vigente; nunca se aceptará un importe enviado por el cliente ni se creará un precio improvisado como alternativa.

## Base de datos y migración

Se agregarán columnas opcionales de correspondencia y estado de Stripe a `plans` y `coupon_codes`, además de una tabla de trabajos de sincronización con restricciones únicas por entidad y huella. La migración será aditiva y reversible. Los registros existentes comenzarán en estado `pending` y serán procesados por la reconciliación inicial.

## Experiencia administrativa

Las páginas de planes y cupones mostrarán el estado de sincronización con Stripe. Una acción exclusiva de superadministradores iniciará la reconciliación inicial o completa y mostrará las cantidades de elementos sincronizados, omitidos y fallidos. Al guardar un elemento se informará que el cambio local se guardó y que la sincronización está pendiente. Los errores incluirán una acción de reintento y una explicación saneada.

## Verificación

- Pruebas unitarias de conversión a unidades monetarias mínimas, intervalos, huellas, selección de descuentos y decisiones del ciclo de vida.
- Pruebas del servicio con un cliente de Stripe simulado para creación, actualización, archivado, idempotencia, reintentos y trabajos obsoletos.
- Pruebas de rutas que demuestren que se ignoran los importes e identificadores de Stripe enviados por el cliente.
- Pruebas de pago para descuentos de planes, cupones, selección sin acumulación, periodos de prueba, descuentos fijos en EUR, cupones inactivos o vencidos y planes no sincronizados.
- Pruebas de webhooks para firmas válidas e inválidas, eventos duplicados, importes discrepantes, pagos fallidos, activación correcta, renovaciones, reembolsos y cancelaciones.
- Pruebas de migración y un informe de simulación antes de crear objetos reales.
- Comprobación de tipos y compilación de producción.
- Revisión de seguridad del cambio final enfocada en exposición de secretos, autorización, referencias inseguras a objetos, repetición de eventos, cobros duplicados, manipulación de importes y comportamientos permisivos ante fallos.

## Despliegue

1. Desplegar el esquema y el código con la sincronización automática desactivada.
2. Ejecutar una simulación de reconciliación y revisar los productos, precios y cupones exactos que se crearían.
3. Ejecutar la reconciliación inicial en producción después de aprobar el informe.
4. Verificar los objetos de Stripe y realizar una prueba completa de pago con un importe controlado.
5. Activar la sincronización automática.
6. Supervisar errores de webhooks y sincronización durante el primer ciclo de facturación.

Ninguna suscripción existente cambiará de precio ni se migrará automáticamente durante este despliegue.
