# checkPlanLimit en canales y campañas + descubrimiento sobre flows

**Fecha:** 2026-08-31
**Archivos:** `server/routes.ts`, `server/routes/campaigns.ts`
**Severidad:** Media (impacto comercial, no seguridad directa)

## Problema

De la Fase 0 quedaba pendiente conectar `checkPlanLimit` a canales, flujos
y campañas (contactos y usuarios ya se habían conectado).

## Fix

- `POST /api/channel-connections`: `checkPlanLimit(companyId, 'channels')`
  antes de crear la conexión.
- `POST /api/campaigns` (`server/routes/campaigns.ts`):
  `checkPlanLimit(companyId, 'campaigns')` antes de crear la campaña.
- **Flows resultó no necesitar el fix**: `POST /api/flows` ya tenía su
  propio enforcement manual y funcional
  (`companyFlows.length >= companyPlan.maxFlows`, con mensaje de upgrade
  incluido), implementado de forma independiente al servicio
  `planLimitsService`. Confirmado con lectura directa del handler — no es
  el hallazgo de "cero enforcement" que aplicaba a contactos/usuarios.

## Verificación

`npx tsc --noEmit` sobre todo el proyecto: 0 errores nuevos.
