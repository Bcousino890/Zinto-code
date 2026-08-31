# Host header injection en reset de contraseña + rate limiting de auth

**Fecha:** 2026-08-31
**Archivos:** `server/services/password-reset.ts`, `server/middleware/auth-rate-limit.ts` (nuevo), `server/auth.ts`
**Severidad:** Alta

## Problema

- `PasswordResetService.convertToAbsoluteUrl` priorizaba `requestBaseUrl`
  (derivado de las cabeceras `Host`/`X-Forwarded-Host`, que un atacante
  controla) por encima de las variables de entorno `APP_URL`/`BASE_URL`.
  Un atacante podía forzar que el link del email de reset de contraseña
  apuntara a un dominio propio y capturar el token.
- `/api/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`,
  `/api/admin/auth/forgot-password`, `/api/admin/auth/reset-password` no
  tenían ningún rate limiting — abiertos a fuerza bruta.

## Fix

- Orden de prioridad invertido en `convertToAbsoluteUrl`: env var primero,
  `requestBaseUrl` solo como último recurso si no hay ninguna configurada.
  Corrige ambos endpoints (normal y admin) desde un único punto.
- `server/middleware/auth-rate-limit.ts` nuevo, usando `express-rate-limit`
  (ya estaba en dependencias, no se instaló nada nuevo):
  - `loginRateLimiter`: 10 intentos / 15 min, no cuenta los éxitos.
  - `passwordResetRateLimiter`: 5 intentos / hora.
- Aplicado a los 5 endpoints de auth en `server/auth.ts`.

## Verificación

`npx tsc --noEmit` sobre todo el proyecto: 0 errores nuevos.
Pendiente: prueba manual de que el 11º intento de login en 15 min devuelve
429, y que el link de un reset de contraseña real usa el dominio de
`APP_URL` aunque se le mande un `Host` falso.
