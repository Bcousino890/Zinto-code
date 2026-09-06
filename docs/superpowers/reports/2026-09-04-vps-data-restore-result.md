# Resultado de restauración del VPS — 2026-09-04

## Resultado

La restauración de datos se completó en producción sin reemplazar ni modificar el código de la aplicación. El CRM responde en `https://crm.zinto.app` y el proceso PM2 `zinto` permanece en línea.

## Datos verificados

- Empresa ID 2: Zinto, activa.
- Empresa ID 3: Benjamin Cousiño Propiedades, activa.
- Plan Inicial: 39 EUR/mes.
- Plan Pro: 99 EUR/mes.
- Plan Premium: 199 EUR/mes.
- Plan Business: 399 EUR/mes.
- Usuarios: 35.
- Contactos: 1.161.
- Conversaciones: 917.
- Mensajes: 13.563.
- Archivos restaurados en `uploads`: 38.
- Archivos restaurados en `whatsapp-sessions`: 1.643.

## Compatibilidad aplicada

El respaldo contenía un esquema parcialmente más antiguo y metadatos de migración desincronizados. La base candidata se creó con el esquema exacto usado por el código actual. Durante la carga se admitieron temporalmente dos columnas históricas de la base de conocimiento y la tabla histórica `schema_migrations`; estos elementos se retiraron antes del corte.

Dos valores vacíos de `payment_transactions.external_transaction_id` se normalizaron a `NULL` para cumplir el índice único actual. No se eliminaron transacciones.

Las credenciales históricas de proveedores incluidas en el respaldo no se activaron. Los ajustes sensibles disponibles en la base anterior se conservaron.

## Verificaciones

- Integridad gzip y SHA-256 del respaldo: válida.
- Sumas internas del respaldo: válidas.
- Rutas peligrosas o enlaces en los archivos: ninguno.
- Esquema y restricciones actuales: cargados correctamente.
- Validación del sistema de migraciones: válida.
- HTTP local `/`: 200.
- HTTP público `https://crm.zinto.app/`: 200.
- Recurso JavaScript principal: 200.
- PM2: en línea.

## Reversión conservada

- Base anterior: `zinto_pre_restore_20260904081535`.
- Uploads anteriores: `/home/deploy/zinto/uploads.pre-restore-20260904T081535Z`.
- Sesiones anteriores: `/home/deploy/zinto/whatsapp-sessions.pre-restore-20260904T081535Z`.
- Artefactos verificados: `/home/deploy/zinto/backups/restore-20260904T081535Z`.

Estos elementos no deben eliminarse hasta confirmar visualmente el CRM y las sesiones de WhatsApp.
