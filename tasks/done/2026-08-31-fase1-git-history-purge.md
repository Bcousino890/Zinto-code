# Purga de secretos del historial de git

**Fecha:** 2026-08-31
**Severidad:** Crítica
**Confirmado explícitamente por el usuario antes de ejecutar** (acción
destructiva: reescritura de historial + force-push).

## Contexto

El commit inicial (`ff3bc08`) traía `.env`, `.env.development`,
`server/.env` y `cookies.txt` versionados. Ya se habían sacado del tracking
en el commit anterior (`637700a`), pero seguían recuperables desde el
historial. Como el proyecto todavía no está desplegado en producción, era
el mejor momento posible para hacer la limpieza completa sin riesgo de
romper un despliegue real.

## Qué se hizo

1. Backup local antes de tocar nada: tags `backup-main-before-purge` y
   `backup-feature-before-purge` (se invalidaron automáticamente al
   reescribir, pero `git filter-branch` conserva además `refs/original/*`
   con los hashes previos hasta que se limpian explícitamente).
2. `git filter-branch --index-filter 'git rm --cached --ignore-unmatch
   .env .env.development server/.env cookies.txt' --prune-empty -- --all`
   — reescribe los 3 commits existentes (`main` y la rama de trabajo,
   que compartían el commit inicial) eliminando esos 4 archivos de
   **todo** el historial, no solo del estado actual.
3. Se encontró un quinto archivo no detectado antes: `server/cookies.txt`
   (vacío, solo cabecera de libcurl, sin secretos reales — se confirmó
   revisando su contenido en todos los commits). Se eliminó igualmente por
   higiene, en un commit normal (no hacía falta reescribir historia por
   este, nunca tuvo contenido sensible).
4. Limpieza de `refs/original/*`, `git reflog expire --all` y
   `git gc --prune=now --aggressive` para purgar los blobs sueltos del
   repositorio local.
5. `git push --force` a `main` y a
   `claude/crm-analysis-vulnerabilities-1dv1r5`.
6. `.env.example` creado (no existía ninguna plantilla) documentando cada
   variable, con nota explícita de generar valores nuevos y nunca reusar
   nada que estuvo expuesto.

## Hashes cambiados (referencia)

- `main`: `ff3bc08` → `e475d37`
- Rama de trabajo: `637700a` → `cdf79d1` (tras el commit adicional de
  `server/cookies.txt`)

## Pendiente — sigue sin hacerse aquí, requiere acceso a infraestructura real

- **Rotar las credenciales reales** que aparecían en esos archivos
  (contraseña de base de datos, `SESSION_SECRET`, `ENCRYPTION_KEY`, etc.).
  Purgar el historial no protege nada si esos valores concretos se siguen
  usando en algún entorno — hay que generarlos de nuevo con
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  y configurarlos como variables de entorno reales en el VPS cuando se
  despliegue, nunca en el repo.
- Cualquier clon local existente de este repositorio (si lo hay, en otra
  máquina) queda con el historial viejo — debe re-clonarse desde cero, no
  hacer `git pull` (un rewrite de historia con `pull` normal genera
  conflictos y puede reintroducir los objetos purgados).
