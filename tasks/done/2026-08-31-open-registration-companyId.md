# Registro abierto dentro de cualquier empresa existente

**Fecha:** 2026-08-31
**Archivo:** `server/auth.ts`
**Severidad:** Crítica

## Problema

`POST /api/register` no requería autenticación ni token de invitación.
Aceptaba `companyId` directo del body, comprobaba solo que la empresa
existiera y estuviera activa, y creaba un usuario con `role: "agent"` dentro
de esa empresa, con login automático. Cualquiera que conociera o adivinara
un `companyId` (entero secuencial) podía crearse una cuenta de agente dentro
de cualquier cliente de Zinto.

Se confirmó que el sistema de invitación por token (`team_invitations`,
`/api/team/invitations/*`) ya está desactivado (devuelve 410 "no longer
supported") y que el flujo real y soportado para añadir usuarios es
`POST /api/team/members`, protegido con `ensureAuthenticated + ensureAdmin +
ensureCompanyContext`. Es decir, `/api/register` no tenía ningún caso de uso
legítimo vigente.

## Fix

Endpoint deshabilitado (410), igual que se hizo con `/api/team/invitations/*`,
con mensaje que apunta al flujo real (pedir a un admin que añada al usuario
desde gestión de equipo).

## Verificación

- `npx tsc --noEmit` sobre el archivo, sin errores nuevos.
- Confirmado que `client/src/hooks/use-auth.tsx` es el único caller en el
  frontend y no se encontró ninguna página que lo invoque activamente hoy.
