# Auditoría IDOR de los endpoints con `:id`/`:connectionId` sin companyId

**Fecha:** 2026-08-31
**Archivo:** `server/routes.ts` (todo en un único archivo — de ahí que un
solo agente secuencial, no varios en paralelo, fuera lo correcto para no
generar conflictos de merge)
**Severidad:** Crítica (varios), Alta (el resto)

## Metodología

Se revisó uno por uno cada endpoint de la lista de ~50 candidatos
identificada en el análisis inicial (`grep` de rutas con `:id` sin
`companyId` en las 45 líneas siguientes). Para cada uno se leyó el handler
completo y se aplicó una de tres acciones:
1. **Sin protección real → fix**: cargar el recurso, comparar
   `recurso.companyId` con `req.user.companyId` (o `req.user.isSuperAdmin`),
   404/403 antes de continuar.
2. **Protección con el campo equivocado → corregido**: varios endpoints
   comparaban `connection.userId !== req.user.id` en vez de `companyId`,
   lo que además de no ser la intención de negocio correcta (bloquea a
   compañeros de la misma empresa que no crearon la conexión) técnicamente
   sigue evitando cross-tenant, pero se unificó al patrón `companyId`
   correcto en los 10 puntos donde aparecía.
3. **Ya protegido correctamente → confirmado, sin cambios**: todo el
   bloque de Flow Builder (flows, sessions, executions, webhook-triggers)
   usa `userCanAccessFlow`/`canAccessFlowExecutionHistory`, bien diseñado
   desde el principio — no hacía falta tocarlo.

## Hallazgos corregidos (por endpoint)

**Sin ningún chequeo de pertenencia — cross-tenant directo:**
- `POST /api/whatsapp/send/:connectionId` — enviaba WhatsApp desde la
  conexión de cualquier empresa.
- `POST /api/email/sync/:connectionId` — forzaba sync de bandeja de
  cualquier empresa. Además había un **duplicado exacto de la ruta**
  (`server/routes.ts`, registrado dos veces) que Express nunca alcanzaba
  — código muerto, eliminado.
- `POST /api/email/restart-polling/:connectionId`
- `GET /api/email/mailboxes/:connectionId`
- `PATCH /api/deals/:id/stage` — además mutaba el deal **antes** de
  comprobar siquiera que existiera.
- `GET /api/deals/:id/activities`, `POST /api/deals/:id/activities`
- `POST /api/instagram/send/:connectionId`
- `POST /api/channel-connections/:id/reconnect`
- `GET /api/whatsapp/diagnostics/:connectionId`
- `GET /api/whatsapp/group-picture/:connectionId/:groupJid`
- `POST /api/whatsapp/participants-pictures/:connectionId`
- `POST /api/contacts/:id/update-profile-picture` (contacto y conexión)
- `POST /api/conversations/:id/update-group-picture` (conversación y
  conexión)
- `PATCH /api/conversations/:id` — actualizaba con `req.body` crudo
  (mass assignment, incluido `companyId`) sin cargar ni verificar la
  conversación existente primero.
- `PATCH /api/contacts/:id` — mismo problema de mass assignment de
  `companyId`.
- `GET /api/contacts/:id/notes`, `POST /api/contacts/:id/notes`
- `POST /api/conversations/:id/upload-media-old` (legacy, sin caller en
  frontend, se decidió proteger en vez de eliminar por si hay integración
  externa que la use)
- `POST /api/conversations/:id/upload-media`
- `POST /api/conversations/:id/upload-media-only`

**Chequeo con campo equivocado (`userId` en vez de `companyId`), corregido
en 10 puntos:**
- `GET /api/instagram/health/:connectionId`
- `GET /api/telegram/health/:connectionId`
- `GET /api/messenger/health/:connectionId`
- `POST /api/instagram/send-media/:connectionId`
- `POST /api/instagram/send-quick-replies/:connectionId`
- `GET /api/instagram/templates/:connectionId`
- `POST /api/instagram/templates/:connectionId`
- `POST /api/instagram/refresh-token/:connectionId`
- `GET /api/whatsapp/profile-picture/:connectionId/:phoneNumber`
- `GET /api/whatsapp/profile-picture-url/:connectionId/:phoneNumber`

## Confirmado como ya seguro, sin cambios

- Todo el bloque Flow Builder (flows, sesiones, ejecuciones,
  webhook-triggers): usa `userCanAccessFlow`/`canAccessFlowExecutionHistory`.
- `POST /api/register` ya deshabilitado en Fase 0.
- `/api/webchat/preview/:token`, `/api/webchat/embed/:token`,
  `/api/webchat/widget/:token*`: el "token" es
  `crypto.randomBytes(24).toString('hex')` (192 bits de entropía) — acceso
  público por diseño (widget embebido para visitantes anónimos), no es
  IDOR. Confirmado en `server/services/channels/webchat.ts`.

## Pendiente

- No se auditaron endpoints fuera de `server/routes.ts` (p. ej. los que
  viven en `server/routes/erp/*.ts`, `server/admin-routes.ts`,
  `server/webhook-routes.ts`) — quedan para una siguiente pasada.
- Falta decidir si `/api/conversations/:id/upload-media-old` se elimina
  del todo en vez de mantenerse (ver nota en el propio commit).

## Verificación

`npx tsc --noEmit` sobre todo el proyecto tras cada tanda de cambios: 0
errores nuevos en ningún punto.
