# Enforcement real de límites de plan (contactos y usuarios)

**Fecha:** 2026-08-31
**Archivos:** `server/routes.ts`
**Severidad:** Alta (impacto directo en el modelo comercial)

## Problema

`planLimitsService.checkPlanLimit()` (en `server/services/plan-limits-service.ts`)
existía, estaba bien implementada (soporta `users`, `contacts`, `channels`,
`flows`, `campaigns`) pero tenía **cero invocaciones** en todo el servidor.
El único uso real del servicio era `checkApplicationAccess`/
`checkSubscriptionExpiration` (¿suscripción activa sí/no?), no límites de
volumen. En la práctica, ningún plan limitaba cuántos contactos o usuarios
podía tener una empresa.

## Fix

- `POST /api/contacts`: se añade `checkPlanLimit(companyId, 'contacts')`
  antes de `storage.getOrCreateContact`. Si `!allowed`, 403 con el mensaje
  del propio servicio.
- `POST /api/team/members`: se añade `checkPlanLimit(companyId, 'users')`
  antes de la validación de rol/custom role.
- Import añadido: `planLimitsService` desde `./services/plan-limits-service`
  en `routes.ts`.

## Pendiente (Fase 2)

- `channels`, `flows`, `campaigns` — mismo patrón, sin aplicar todavía.
- Storage/bandwidth (`data-usage-tracker.ts`) sigue sin corte real.

## Verificación

- `npx tsc --noEmit` sobre el archivo, sin errores nuevos.
- Pendiente: prueba manual con un plan de límite bajo (ej. `maxContacts: 1`)
  para confirmar que el segundo contacto devuelve 403.
