# Diseño de restauración de datos del VPS

## Objetivo

Restaurar en el VPS los datos del respaldo `zinto-bcousinoprop-20260813-005148` sin reemplazar ni modificar el código fuente actualmente desplegado en `/home/deploy/zinto`.

El resultado debe recuperar las empresas Zinto y Benjamin Cousiño Propiedades, los cuatro planes comerciales, los ajustes administrativos, los archivos multimedia y las sesiones de WhatsApp compatibles con la versión actual de la aplicación.

## Alcance

Se restaurarán, después de validar su compatibilidad:

- La base PostgreSQL completa contenida en `database-full.dump`.
- Las empresas ID 2 (Zinto) e ID 3 (Benjamin Cousiño Propiedades).
- Los planes Inicial, Pro, Premium y Business.
- Los ajustes globales y por empresa almacenados en la base.
- Los archivos de `uploads.tar.gz`.
- Las sesiones de `whatsapp-sessions.tar.gz`.
- Los datos auxiliares de `app-data.tar.gz` que correspondan a rutas utilizadas por la aplicación actual.

No se reemplazarán:

- El repositorio Git ni ningún archivo fuente.
- La compilación activa hasta el momento del corte controlado.
- `package.json`, dependencias o migraciones del repositorio actual.
- El archivo `.env`, la configuración Docker ni la configuración PM2 actuales.
- Credenciales actuales del VPS con valores antiguos incluidos en el respaldo.

Los archivos `instance-config.tar.gz`, `migrations.tar.gz` y `database-schema.sql` se usarán únicamente como referencia para comprobar compatibilidad. No se aplicarán directamente sobre la instalación activa.

## Estrategia

La restauración se realizará mediante una base temporal y un corte reversible:

1. Capturar el estado operativo actual y crear copias de seguridad verificables de la base, uploads y sesiones activas.
2. Extraer el respaldo en un directorio privado de trabajo, conservando permisos restrictivos.
3. Restaurar `database-full.dump` en una base PostgreSQL temporal con las extensiones requeridas.
4. Comparar el esquema restaurado con el esperado por el código actual y ejecutar comprobaciones de integridad.
5. Preparar directorios temporales para uploads y sesiones, sin sobrescribir las rutas activas.
6. Detener brevemente la aplicación y cualquier proceso que pueda escribir en la base o en las sesiones.
7. Cambiar de forma atómica a la base y los directorios validados.
8. Iniciar la aplicación y ejecutar verificaciones funcionales.
9. Revertir inmediatamente al estado anterior si falla una comprobación crítica.

Se prefiere la restauración completa y aislada de la base frente a insertar filas manualmente. Esto preserva relaciones, secuencias, claves foráneas y datos dependientes. La compatibilidad con el código actual es una condición obligatoria antes del corte.

## Datos esperados

El respaldo validado contiene:

- Empresa ID 2: Zinto, activa, asociada al plan Inicial.
- Empresa ID 3: Benjamin Cousiño Propiedades, activa, asociada al plan Pro.
- Plan Inicial: 39 EUR/mes.
- Plan Pro: 99 EUR/mes.
- Plan Premium: 199 EUR/mes.
- Plan Business: 399 EUR/mes.
- Volcado completo de PostgreSQL, archivos multimedia, sesiones de WhatsApp, migraciones y metadatos de configuración.

## Seguridad

El respaldo contiene datos personales, sesiones activas y credenciales históricas. Durante la restauración:

- Los archivos extraídos tendrán acceso restringido al usuario de despliegue.
- No se imprimirán secretos ni contenidos de sesiones en registros o respuestas.
- No se importará el `.env` antiguo.
- Los secretos históricos encontrados en ajustes de base se desactivarán o sustituirán por credenciales vigentes antes de habilitar integraciones externas.
- Después del corte se rotarán las credenciales de pago, correo, OAuth, nube y cualquier otro proveedor presente en el respaldo.
- Las sesiones de WhatsApp se validarán individualmente; una sesión inválida deberá volver a vincularse mediante QR sin impedir que el resto de la aplicación funcione.

## Compatibilidad y migraciones

La base temporal se restaurará con el rol y las extensiones compatibles con PostgreSQL 17. Se comprobarán:

- Tablas, columnas, índices, restricciones y secuencias requeridas por el código actual.
- Estado de las tablas de migraciones.
- Extensiones como pgvector.
- Propietarios y permisos de los objetos restaurados.
- Diferencias entre el esquema del 13 de agosto y el esquema exigido por la revisión actual del repositorio.

Si faltan migraciones posteriores al respaldo, se aplicarán únicamente a la base temporal mediante el mecanismo de migración del código actual. No se ejecutarán archivos SQL históricos de forma masiva sobre la base activa.

## Corte y reversión

El corte requiere una ventana breve de mantenimiento para evitar escrituras concurrentes. Justo antes del cambio se tomará un respaldo final del estado actual. La base anterior y los directorios anteriores se conservarán con nombres fechados hasta completar la validación.

La reversión consistirá en detener la aplicación, volver a seleccionar la base anterior, restaurar los enlaces o rutas anteriores de uploads y sesiones, e iniciar de nuevo PM2. No se eliminará el respaldo previo durante esta operación.

## Verificación

Antes del corte:

- El archivo principal y todas sus sumas SHA-256 deben ser válidos.
- La restauración temporal debe finalizar sin errores.
- Deben existir ambas empresas y los cuatro planes con los precios esperados.
- Deben pasar las comprobaciones de integridad y compatibilidad del esquema.

Después del corte:

- El proceso PM2 debe permanecer estable y sin nuevos errores críticos.
- La comprobación HTTP de salud y la pantalla de acceso deben responder.
- Debe ser posible acceder al panel sin modificar el código.
- Deben verse ambas empresas, sus planes y la configuración esperada.
- Los uploads principales deben responder y los logotipos deben cargar.
- Las sesiones de WhatsApp deben aparecer; se identificarán las que requieran revinculación.
- Se comprobarán los recuentos principales de usuarios, contactos, conversaciones y mensajes contra la base temporal.

## Criterio de finalización

La restauración estará completa cuando la aplicación actual funcione con los datos recuperados, las empresas y planes sean visibles, los archivos estén disponibles, las sesiones estén restauradas o marcadas para revinculación, las integraciones antiguas no puedan usar secretos comprometidos y exista un respaldo verificado para volver al estado previo.
