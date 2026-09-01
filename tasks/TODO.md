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
- [x] Secretos sacados del tracking Y purgados de todo el historial de git
      (`.env`, `.env.development`, `server/.env`, `cookies.txt` en ambas
      rutas) en `main` y la rama de trabajo, con confirmación explícita del
      usuario antes del force-push. `.env.example` creado como plantilla.
      **Pendiente crítico que sigue sin poder hacerse desde aquí**: rotar
      las credenciales reales (contraseña de BD, SESSION_SECRET,
      ENCRYPTION_KEY) en el entorno de producción cuando se despliegue —
      nunca reusar los valores que estuvieron expuestos.
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
