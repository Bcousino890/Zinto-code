# TODO activo

Ver `PLAN.md` para contexto completo de cada punto. Última actualización:
2026-08-31.

## Fase 1 — próxima a ejecutar
- [ ] SSRF en `/api/n8n/list-workflows`, `/api/make/list-scenarios`, nodo
      `api_call` del Flow Builder
- [ ] Proteger/eliminar `/api/debug/settings`
- [ ] DOMPurify en `EmailViewer.tsx`
- [ ] Migrar `createCipher` → `createCipheriv` (ai-credentials-service.ts,
      social-auth.ts) + script de re-cifrado
- [ ] `license-validator.ts`: firma HMAC real
- [ ] Purgar secretos del repo/historial + rotar
- [ ] Rate limiting en login/forgot-password/reset-password
- [ ] Host header injection en forgot-password

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
