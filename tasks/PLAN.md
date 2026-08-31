# Plan de saneamiento por fases — Zinto CRM

Basado en la auditoría de código de agosto 2026 (rama
`claude/crm-analysis-vulnerabilities-1dv1r5`). Cada fase indica: qué incluye,
si se puede paralelizar con subagentes, qué modelo de Claude usar y con qué
nivel de esfuerzo, y el criterio de "hecho".

Regla general de modelo/esfuerzo en Claude Code:
- **Sonnet, esfuerzo medio-alto**: fixes acotados a 1-3 archivos, lógica clara,
  bajo riesgo de romper otras partes (la mayoría de este plan).
- **Opus, esfuerzo alto**: decisiones de arquitectura o refactors que tocan
  muchos archivos a la vez y donde un error de diseño es caro de deshacer
  (dividir `routes.ts`/`flow-executor.ts`, introducir Redis).
- **Paralelizable con subagentes tipo Explore**: auditorías de "buscar todos
  los puntos X en el código" que no dependen unos de otros.
- **Secuencial, un solo agente**: cualquier cosa que edite el mismo archivo
  grande (`routes.ts`, `auth.ts`) para evitar conflictos de merge entre
  agentes paralelos.

---

## Fase 0 — Bypasses críticos de autenticación (HECHA hoy)

Sin paralelizar (mismo archivo, `server/auth.ts` y `server/routes.ts`).
Modelo: Sonnet, esfuerzo medio. Ver `done/`.

- [x] `POST /api/admin/return-from-impersonation` sin autenticación, con
      fallback que iniciaba sesión como cualquier super admin del sistema.
- [x] `POST /api/register` permitía crear un usuario "agent" dentro de
      cualquier empresa activa solo con su `companyId`, sin invitación.
- [x] `checkPlanLimit()` conectado a creación de contactos y de usuarios
      (los dos recursos que definen el tamaño comercial de un plan).
- [x] `.gitignore`: quitado `*.md` (bloqueaba toda la documentación, incluida
      esta carpeta).

---

## Fase 1 — Resto de bypasses y fugas críticas (días, no semanas)

Paralelizable: 3 subagentes Explore/general-purpose, cada uno en archivos
distintos, luego un agente único aplica los fixes para evitar conflictos.
Modelo: Sonnet, esfuerzo alto (hay que verificar cada fix con grep antes/después).

- [ ] SSRF: `/api/n8n/list-workflows`, `/api/make/list-scenarios` sin auth,
      y nodo `api_call` del Flow Builder sin validar IP destino (bloquear
      rangos privados/metadata cloud: 169.254.169.254, 10/8, 172.16/12,
      192.168/16, 127/8).
- [ ] `/api/debug/settings` — quitar o proteger con `ensureSuperAdmin`.
- [ ] XSS: `EmailViewer.tsx` — sustituir el regex de `<script>` por DOMPurify
      (ya está en dependencias, solo falta usarlo).
- [ ] Cifrado roto: `crypto.createCipher` (sin IV) en
      `ai-credentials-service.ts` y `social-auth.ts` → migrar a
      `createCipheriv` con IV aleatorio. Requiere script de re-cifrado de
      credenciales existentes en BD (no perder las API keys ya guardadas).
- [ ] `license-validator.ts`: clave hardcodeada y firma sin secreto real
      (`sha256` sin HMAC) → usar HMAC con secreto de entorno.
- [ ] Purgar `.env`, `server/.env`, `cookies.txt` del repo y del historial
      git; rotar `SESSION_SECRET`, `ENCRYPTION_KEY`, credenciales DB.
- [ ] Rate limiting real en `/api/login`, `/api/auth/forgot-password`,
      `/api/auth/reset-password`.
- [ ] Host header injection en `forgot-password` (usa `x-forwarded-host` del
      request para construir el link del email).

**Hecho cuando:** los 8 puntos tienen commit propio, con nota en `done/`.

---

## Fase 2 — Enforcement de planes al 100% + aislamiento entre empresas

Paralelizable en 2 bloques independientes:
- Bloque A (agente 1): terminar `checkPlanLimit` en canales, flujos y
  campañas (ya está en contactos/usuarios desde Fase 0).
- Bloque B (agente 2, en paralelo): auditar y corregir los ~50 endpoints con
  `:id` sin chequeo de `companyId` detectados en el análisis inicial
  (`/api/contacts/:id`, `/api/whatsapp/send/:connectionId`,
  `/api/email/sync/:connectionId`, `/api/flows/:id/*`, `/api/deals/:id/*`,
  etc.) — cada uno necesita `if (recurso.companyId !== req.user.companyId) 403`.

Modelo: Sonnet, esfuerzo alto. Bloque B es mecánico pero de mucho volumen —
buen candidato para 3-4 subagentes trabajando en rangos de líneas distintos
de `routes.ts`, cada uno con lista cerrada de endpoints a tocar (no descubrir
libremente, para evitar que dos agentes toquen la misma zona).

- [ ] `checkPlanLimit('channels')` antes de crear `channel_connections`.
- [ ] `checkPlanLimit('flows')` antes de crear un flow.
- [ ] `checkPlanLimit('campaigns')` antes de crear/lanzar una campaña.
- [ ] `data-usage-tracker.ts`: añadir corte real (403) al superar
      storage/bandwidth del plan, no solo acumular contador.
- [ ] IDOR: los ~50 endpoints listados en el análisis inicial, uno a uno.
- [ ] Asistente conversacional de IA (`ai-assistant.ts`) y RAG
      (`knowledge-base-service.ts`) conectados a `aiTokenBillingService`
      (hoy solo el Flow Builder tiene tope real de tokens).

**Hecho cuando:** ningún endpoint de la lista del análisis inicial queda sin
verificación de pertenencia a empresa, y los 5 tipos de límite de plan
(usuarios, contactos, canales, flujos, campañas) bloquean de verdad.

---

## Fase 3 — Observabilidad y defensa en profundidad (2-4 semanas)

Secuencial, va tocando muchos archivos pequeños. Modelo: Sonnet, esfuerzo medio.

- [ ] Logger: sustituir `shared/logger.ts` por uno con persistencia real
      (a archivo rotado o servicio externo tipo Better Stack/Axiom), porque
      hoy en producción `debug/info/warn` están completamente silenciados
      (solo se conserva `error`) — cero rastro de auditoría de eventos
      normales, y un ataque como el bypass de superadmin de hoy no habría
      dejado ningún log.
- [ ] Redactar automáticamente secretos (password/token/apiKey) en cualquier
      log, y eliminar los ~17 `console.log` que hoy imprimen credenciales.
- [ ] Unificar los 32 archivos que usan `console.log` directo al logger
      centralizado.
- [ ] CSRF: token o verificación de `Origin` en mutaciones autenticadas.
- [ ] Reactivar Helmet/CSP (`server/middleware/security.ts` hoy los
      desactiva a propósito) y sustituir `Access-Control-Allow-Origin: *`
      por lista blanca donde no sea estrictamente el widget público de
      webchat.
- [ ] Backups: sacar copia externa (Storage Box/S3), fuera del propio disco
      del servidor de producción.

---

## Fase 4 — Escalabilidad de infraestructura (1-2 meses, Opus)

No paralelizable con subagentes de código — es diseño de arquitectura, mejor
con un único agente de razonamiento alto guiando el refactor, aunque la
implementación de cada pieza sí puede repartirse después.
Modelo: **Opus, esfuerzo alto** para el diseño; Sonnet para la implementación
mecánica una vez decidido el diseño.

- [ ] Introducir Redis: sesiones, rate limits, colas de campaña (hoy 28 `Map`
      en memoria que no escalan a más de un proceso).
- [ ] Sacar las sesiones de WhatsApp no oficial (Baileys) a procesos worker
      separados del proceso web principal.
- [ ] Mover `/media`, `/uploads`, `/email-attachments` a object storage
      (S3-compatible), hoy en disco local del servidor.
- [ ] Dividir `routes.ts` (1.18MB) y `flow-executor.ts` (1.25MB) en módulos
      por dominio — requisito para poder revisar/testear el código en serio.
- [ ] Añadir tests de regresión de aislamiento entre empresas (el hallazgo
      más caro de repetir si se vuelve a romper).

---

## Cómo ejecutar esto con agentes en paralelo (dentro de esta sesión)

Para las fases 1 y 2, lanzar varios agentes `Explore`/`general-purpose` en
un solo mensaje (paralelo real), cada uno con:
- Alcance de archivos cerrado y explícito (nunca "revisa todo X" sin lista).
- La misma instrucción de citar `archivo:línea` en cada hallazgo/fix.
- Prohibición explícita de tocar archivos fuera de su lista, para poder
  aplicar todos los diffs sin conflicto.

Un agente coordinador (esta sesión) aplica los fixes en `routes.ts`/`auth.ts`
de forma secuencial usando los hallazgos de los agentes paralelos, para que
dos agentes nunca editen el mismo archivo grande a la vez.
