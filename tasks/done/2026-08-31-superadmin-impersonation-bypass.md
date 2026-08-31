# Bypass de superadmin vía return-from-impersonation

**Fecha:** 2026-08-31
**Archivo:** `server/auth.ts`
**Severidad:** Crítica

## Problema

`POST /api/admin/return-from-impersonation` no tenía ningún middleware de
autenticación. Cuando no había sesión de impersonación activa, el código caía
en un `else` que buscaba "algún" super admin (por email de entorno o el
primer usuario con `isSuperAdmin: true` en toda la base de datos) y ejecutaba
`req.login(superAdmin, ...)`. Resultado: cualquier request no autenticado a
ese endpoint entraba con sesión de super admin completo, sin credenciales.

## Fix

- Añadido `ensureAuthenticated` al endpoint.
- Eliminado el `else` que buscaba un super admin arbitrario. Ahora solo se
  permite volver al super admin registrado en el propio estado de
  impersonación de esa sesión (`session.impersonation.originalUserId` o
  `session.originalSuperAdminId` + `session.isImpersonating`). Si no hay
  impersonación activa, devuelve 404.

## Verificación

- `npx tsc --noEmit` sobre el archivo, sin errores nuevos.
- Pendiente: probar manualmente que un super admin real sigue pudiendo
  impersonar y volver correctamente (flujo `POST /api/admin/impersonate/:id`
  → `POST /api/admin/return-from-impersonation`).
