# TODO activo

Ver `PLAN.md` para contexto completo de cada punto. Última actualización:
2026-08-31.

## Fase 1 — hecha salvo lo anotado
- [x] SSRF en `/api/n8n/list-workflows` + auth en `/api/make/list-scenarios`
      + nodo `api_call`/Shopify/WooCommerce del Flow Builder
- [x] `/api/debug/settings` eliminado
- [x] DOMPurify en `EmailViewer.tsx`, `MessageBubble.tsx`, `public-website.tsx`
      — pendiente `PagePreview.tsx` (riesgo bajo, self-XSS)
- [x] `createCipher` → `createCipheriv` en `ai-credentials-service.ts`
      (con compatibilidad legacy); `social-auth.ts` confirmado código muerto
- [x] `license-validator.ts` + `build-licensed.js`: firma HMAC real con
      `LICENSE_SIGNING_SECRET` — pendiente configurarlo en producción real
- [x] Secretos sacados del tracking de git (`.env`, `.env.development`,
      `server/.env`, `cookies.txt`) — **pendiente crítico**: rotar las
      credenciales reales y decidir si se reescribe el historial
- [x] Rate limiting en login/forgot-password/reset-password (normal + admin)
- [x] Host header injection en forgot-password (orden de prioridad
      invertido en `password-reset.ts`, cubre ambos endpoints)

## Fase 2 — pendiente
- [ ] `checkPlanLimit` en channels/flows/campaigns
- [ ] Corte real de storage/bandwidth en `data-usage-tracker.ts`
- [ ] Auditoría IDOR de los ~50 endpoints con `:id` sin `companyId`
- [ ] Tope de tokens IA en asistente conversacional + RAG

## Fase 3 — pendiente
- [ ] Logger con persistencia real
- [ ] Redacción de secretos en logs + limpiar 17 console.log con credenciales
- [ ] CSRF
- [ ] Reactivar Helmet/CSP, quitar `Access-Control-Allow-Origin: *` genérico
- [ ] Backups externos

## Fase 4 — pendiente
- [ ] Redis (sesiones/rate-limit/colas)
- [ ] Workers separados para Baileys
- [ ] Object storage para media/uploads
- [ ] Dividir routes.ts y flow-executor.ts
- [ ] Tests de aislamiento entre empresas
