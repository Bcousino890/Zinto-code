# SSRF (n8n/Make/Flow Builder) y endpoint de debug expuesto

**Fecha:** 2026-08-31
**Archivos:** `server/routes.ts`, `server/services/flow-executor.ts`,
`server/utils/ssrf-guard.ts` (nuevo)
**Severidad:** Alta

## Problema

- `POST /api/n8n/list-workflows` no tenía autenticación y aceptaba
  `instanceUrl` arbitraria del body, que el servidor consultaba
  directamente (`axios.get`) — SSRF clásico contra red interna/metadata
  cloud.
- `POST /api/make/list-scenarios` no tenía autenticación (la URL destino sí
  era fija a `*.make.com`, así que no era SSRF, solo faltaba auth).
- El nodo `api_call` del Flow Builder (`flow-executor.ts`, método compartido
  `makeHttpRequest`) llamaba a `performFlowHttpRequest` con `ssrfGuard:
  false` explícito — el propio proyecto ya tiene una implementación robusta
  de protección SSRF (`isPrivateOrReservedIP` +
  `performFlowHttpRequest`, con revalidación de redirecciones y bind a la
  IP validada) pero estaba desactivada justo en el único punto donde el
  cliente controla la URL directamente desde su cuenta.
- `GET /api/debug/settings` exponía configuración interna sin ninguna
  autenticación.

## Fix

- `assertPublicHttpUrl()` nuevo en `server/utils/ssrf-guard.ts`, reutiliza
  `isPrivateOrReservedIP` ya existente (no se duplicó la lista de rangos
  privados). Aplicado a `/api/n8n/list-workflows` antes de construir la URL
  de la petición saliente.
- `/api/n8n/list-workflows` y `/api/make/list-scenarios`: añadido
  `ensureAuthenticated`.
- `flow-executor.ts`: `ssrfGuard: false` → `true` en `makeHttpRequest`
  (usado por el nodo `api_call` genérico, Shopify y WooCommerce — los tres
  reciben una URL configurada por el cliente). Comentario del método
  actualizado para no volver a apagarlo por error.
- Confirmado que el otro `ssrfGuard: false` restante (integración
  MasterShop) es seguro: la URL base es una constante fija del sistema
  (`MASTER_SHOP_API_BASE_URL`), no configurable por el cliente — no se
  tocó.
- `/api/debug/settings` eliminado (sin caller en el frontend).

## Verificación

`npx tsc --noEmit` sobre todo el proyecto: 0 errores nuevos (solo queda un
error preexistente y no relacionado del paquete local
`@bothive/pointer-odontogram-module`, que requiere su propio build).
