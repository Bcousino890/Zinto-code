# XSS con DOMPurify y secretos versionados en git

**Fecha:** 2026-08-31
**Archivos:** `client/src/components/email/EmailViewer.tsx`,
`client/src/components/conversations/MessageBubble.tsx`,
`client/src/pages/public-website.tsx`, `.gitignore`
**Severidad:** Alta (XSS) / Crítica (secretos en git, ver pendiente)

## Problema

- `EmailViewer.tsx` y `MessageBubble.tsx` sanitizaban HTML de correos
  entrantes con una regex que solo quitaba `<script>` — trivial de evadir
  (`<img onerror=...>`, `<svg onload=...>`, etc.). `dompurify` ya estaba en
  dependencias pero no se usaba en estos dos puntos.
- `public-website.tsx` renderizaba el HTML de páginas públicas del cliente
  (`frontendPage.content` y el HTML legacy de GrapesJS) sin sanitizar en
  absoluto.
- `.env`, `.env.development`, `server/.env` y `cookies.txt` estaban
  versionados en git con `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_EMAIL`,
  etc.

## Fix

- Las 3 vistas ahora sanitizan con `DOMPurify.sanitize(...)` antes de
  `dangerouslySetInnerHTML`. En el HTML legacy de páginas (GrapesJS) se
  permite `<iframe>` con atributos `src/allow/allowfullscreen/frameborder/
  target` porque ese generador soporta embeds — DOMPurify sigue filtrando
  `javascript:`/scripts dentro de esos atributos.
- `.env`, `.env.development`, `server/.env`, `cookies.txt` sacados del
  tracking (`git rm --cached`) y añadidos a `.gitignore`.

## Pendiente — requiere decisión explícita, no se hizo aquí

- **El historial de git sigue teniendo los valores viejos** en commits
  anteriores. Quitar el archivo del tracking actual no los borra del
  historial. Falta:
  1. Rotar TODAS las credenciales que aparecían en esos archivos
     (`SESSION_SECRET`, `ENCRYPTION_KEY`, credenciales de base de datos,
     etc.) — indispensable independientemente de lo que se haga con el
     historial, porque ya pueden estar comprometidas.
  2. Decidir si se reescribe el historial (`git filter-repo`) para
     eliminarlos también de ahí. Es una operación destructiva que afecta a
     cualquier clon existente del repo — no se ejecutó sin confirmación
     explícita.
- `PagePreview.tsx` (2 usos de `dangerouslySetInnerHTML`) no se tocó en
  esta pasada: es solo el propio editor viéndose a sí mismo (riesgo bajo,
  self-XSS), queda para una siguiente pasada de limpieza.

## Verificación

`npx tsc --noEmit` sobre todo el proyecto: 0 errores nuevos.
