# Zinto CRM — Contexto para Claude

Este archivo se carga automáticamente al inicio de cada sesión de Claude Code en este repo.
Mantenerlo actualizado evita tener que re-explorar la estructura completa en cada sesión nueva.

## Stack

- **Frontend**: React + TypeScript, Tailwind CSS, shadcn/ui (Radix), wouter (routing), TanStack Query.
  - Ubicación: `client/src/`
  - Páginas: `client/src/pages/`
  - Componentes reutilizables: `client/src/components/ui/` (shadcn/ui — ya incluye tooltip, popover, dialog, alert, card, progress, checkbox, badge, etc. — revisar antes de crear componentes nuevos)
  - Helper de API: `apiRequest` en `@/lib/queryClient`
  - Auth/usuario actual: hook `useAuth()` en `client/src/hooks/use-auth.tsx` (expone `user` con `role: 'super_admin'|'admin'|'agent'|null` e `isSuperAdmin: boolean`)
  - Permisos: `client/src/hooks/usePermissions.ts`
- **Backend**: Express + Drizzle ORM + PostgreSQL. `server/routes.ts` (endpoints), `server/storage.ts` (capa de datos, patrón `IStorage`/`DatabaseStorage`).
- **Schema**: `shared/schema.ts` (Drizzle). Tabla `users` ya tiene columna `role` (enum `user_role`: `super_admin`/`admin`/`agent`) — no crear una nueva si se necesita rol de usuario.
- **Migraciones SQL**: carpeta `/migrations/`, numeradas secuencialmente (`NNN-descripcion.sql`). Revisar el último número existente antes de crear una nueva. Estilo: `BEGIN/COMMIT` + `ADD COLUMN IF NOT EXISTS`.

## Rutas post-login

- Página principal tras login: `/inbox` (componente `Inbox` en `client/src/pages/Inbox.tsx`).
- Rutas protegidas usan `<ProtectedRoute path="..." component={...} />` en `client/src/App.tsx` (import desde `@/lib/protected-route`). Rutas admin-only usan `<AdminProtectedRoute>`.

## Integración Meta WhatsApp / onboarding de canales (feature existente, no confundir con onboarding de UX)

Sistema separado para conectar cuentas de WhatsApp/Messenger/Instagram vía Meta Graph API:
- `/server/services/meta-onboarding-session-store.ts`, `meta-graph-api.ts`, `meta-webhook-configurator.ts`, `meta-configuration-monitor.ts`
- `/server/services/channels/whatsapp-meta-partner.ts`
- Frontend: `client/src/components/settings/MetaWhatsAppIntegratedOnboarding.tsx`, hooks `useMetaChannelsOnboarding.ts` / `useUnifiedMetaChannelsOnboarding.ts`
- Tablas: `meta_onboarding_sessions` (TTL 15 min), `meta_whatsapp_clients`, `meta_whatsapp_phone_numbers`
- Endpoints en `server/routes.ts` ~línea 7339-8495, webhooks en `server/webhook-routes.ts` ~línea 3107-3245

## Onboarding UX del cliente (implementado en rama `claude/crm-auto-onboarding-improvement-6vqh9z`)

Objetivo: mejorar la experiencia de un cliente nuevo registrándose (similar a Whaticket), no solo la integración técnica de canales.

Features implementadas:
1. **Guided Tour** (Shepherd.js) — `client/src/lib/onboarding-tour.ts` + `client/src/components/onboarding-tour-overlay.tsx`. Se auto-inicia una vez por usuario vía `localStorage` (`zinto_onboarding_tour_completed`). Anclas `data-tour="..."` agregadas en `Sidebar.tsx`/`Header.tsx`. Montado en `Inbox.tsx`.
2. **Interactive Checklist** — `client/src/components/onboarding-checklist.tsx`, montado en `Inbox.tsx` (desktop only). Progreso persistido en `users.onboarding_progress` (JSONB) y `users.onboarding_completed_at` (migración `229-user-onboarding-checklist.sql`). Endpoints: `GET/POST /api/users/onboarding-progress` (validar `stepKey` contra `ONBOARDING_CHECKLIST_STEP_KEYS` en `server/storage.ts`). Update es atómico vía `jsonb ||` para evitar race conditions entre pasos concurrentes.
3. **Error Help** — `client/src/lib/error-help.ts` (mapa de errores comunes de Meta/red → explicación + acción) + `client/src/components/error-with-help.tsx` (`<ErrorWithHelp error={...} />`). Integrado en `MetaWhatsAppIntegratedOnboarding.tsx` (estado `signupError`).
4. **Role-Based Onboarding** — `client/src/lib/onboarding-flows.ts` (flujos admin vs agent, usa `user.role`/`user.isSuperAdmin` de `useAuth()`) + `client/src/components/role-based-onboarding.tsx`. Página dedicada en `/onboarding` (`client/src/pages/onboarding.tsx`), enlazada desde el checklist ("Ver guía completa").

Plan completo con ideas adicionales (video tutorials, demo/sandbox mode, FAQ sidebar, resume onboarding, etc.) en el historial de conversación — no persistido como archivo en el repo.

## Convenciones descubiertas

- No existe feature de "departamentos" en el CRM (a pesar de aparecer en referencias de Whaticket) — usar equivalentes reales: roles/permisos (`/settings?tab=team`), pipeline (`/pipeline`), disponibilidad de agentes.
- Al agregar columnas a `shared/schema.ts`, ser quirúrgico — el archivo es compartido y grande, evitar reformateos.
- Verificar compilación con `npx tsc --noEmit -p .` — hay un error preexistente no relacionado en `client/src/pages/erp/dental/chart.tsx` (módulo `@bothive/pointer-odontogram-module` faltante), ignorar ese al validar cambios propios.
