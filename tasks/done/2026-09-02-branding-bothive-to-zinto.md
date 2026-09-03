# Restos de branding "BotHive" visibles en producción

**Fecha:** 2026-09-02
**Severidad:** Baja (cosmético, no seguridad)
**Contexto:** Detectado en vivo tras el primer despliegue real en
`crm.zinto.app` — el usuario vio un "flash" del nombre "BotHive" (marca
original del producto antes de rebrandear a Zinto) antes de que cargara el
branding real configurado en la base de datos.

## Causa

El producto se llamó "BotHive" antes de renombrarse a "Zinto". Varios
valores por defecto en el código (usados como fallback mientras carga la
configuración real, o como base para contenido no personalizado) seguían
con el nombre viejo hardcodeado.

## Fix

- `client/src/contexts/branding-context.tsx`: `DEFAULT_BRANDING.appName`
  ("BotHive" → "Zinto") — este es el que causaba el flash visible al
  cargar cualquier página, ya que se usa como estado inicial antes de que
  la respuesta de la API de branding llegue.
- `shared/frontend-website-settings.ts`: defaults de `appName` en
  `createDefaultFrontendWebsiteLocaleContent`,
  `createDefaultFrontendWebsiteSettings`, y los dos usos de
  `options.appName ?? 'BotHive'` — afecta al contenido por defecto del
  sitio web público de una empresa que no ha personalizado su marca.
- `client/src/pages/admin/settings/index.tsx`: default del formulario de
  branding del panel admin (`appName: 'BotHive'` y title de página).
- `client/src/utils/browser-notifications.ts`: título de las notificaciones
  del navegador ("BotHive Test" / "BotHive Notifications" → "Zinto ...").

## Explícitamente NO tocado

- `client/src/utils/embed-context.ts`: `EMBED_STORAGE_KEY =
  'bothive_embed_context'` — es una clave interna de `localStorage`, no
  visible para ningún usuario. Cambiarla podría invalidar el contexto de
  sesiones de widgets ya embebidos en sitios de clientes, sin ningún
  beneficio visible a cambio.
- `console.debug('[BotHive Cache] ...')` en `useMessageCache.ts` — solo
  aparece en la consola de desarrollador, no es texto de producto visible.

## Verificación

`npx tsc --noEmit` sobre todo el proyecto (en curso en background al
momento de escribir esto).
