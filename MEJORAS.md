# Mejoras y funciones agregadas a Zinto

Registro de qué se cambió, dónde vive cada cosa y qué quedó pendiente.
La idea es no tener que volver a bucear en el código para recordar dónde está algo.

Última actualización: 6 de septiembre de 2026

---

## Índice rápido: dónde buscar cada cosa

| Si buscás… | Está en |
|---|---|
| Política de importación de WhatsApp por empresa | `server/services/channels/whatsapp.ts` (handler `messaging-history.set`) + `client/src/pages/admin/companies/[id].tsx` |
| Recepción de mensajes de grupo | `server/services/channels/whatsapp.ts` → `handleIncomingGroupMessage` |
| Sincronización de historial desde una fecha | PR #4 (sin mergear) → `runDateRangeHistorySync` |
| Foto de perfil de contactos | `server/routes.ts` (`POST /api/contacts`) y `processHistorySyncData` en `whatsapp.ts` |
| Ajustes por empresa (super admin) | `/admin/companies/:id` → pestaña *Company Details* |
| Migraciones nuevas | `migrations/229-*.sql`, `migrations/230-*.sql` |

---

## 1. Configuración por empresa desde el panel de admin

**Dónde:** `https://crm.zinto.app/admin/companies/:id` → pestaña *Company Details*

Se agregaron dos controles para decidir, cliente por cliente, qué puede importar de WhatsApp.
Sirve para dar historial completo solo a quien lo necesita.

### Selector: importación de historial

| Modo | Qué hace |
|---|---|
| `Disabled` | No crea nada a partir del historial |
| `Contacts only` | Crea contactos, pero no las conversaciones **(valor por defecto)** |
| `Full chat + contacts` | Crea todo, **y además le quita el límite de 7 días a los mensajes** |

### Switch: recibir mensajes de grupos

Apagado por defecto. Al prenderlo, los grupos de WhatsApp aparecen en la bandeja.

> ⚠️ Ojo al prenderlo: se crean conversaciones para **todos** los grupos en los que esté ese
> número. En una cuenta con muchos grupos, la bandeja se llena. Probarlo primero en una
> empresa de prueba.

**Archivos:** `shared/schema.ts` (columnas `whatsapp_import_mode` y `whatsapp_groups_enabled`),
`server/auth.ts` (`PUT /api/admin/companies/:id`), `client/src/pages/admin/companies/[id].tsx`
**Migraciones:** `229-company-whatsapp-import-mode.sql`, `230-company-whatsapp-groups-enabled.sql`

---

## 2. Mensajes de grupo de WhatsApp

Antes los mensajes de grupo se **descartaban** en silencio: había un `return` en
`handleIncomingMessage` que los tiraba a la basura sin dejar registro. Estaba ahí desde el
commit inicial del repo, así que la recepción de grupos nunca funcionó (aunque *enviar* a un
grupo sí funcionaba, y el esquema y los componentes del front ya estaban listos).

Ahora, con el switch prendido:

- Se crea la conversación del grupo con su nombre real (vía `groupMetadata`)
- Cada mensaje queda atribuido a **quién lo escribió**, no al grupo
- El autor se guarda en `group_participants` y en las columnas `group_participant_jid` /
  `group_participant_name` del mensaje

Se ve el nombre del que escribió sobre la burbuja, su avatar, y en la vista previa de la lista
aparece como `"Juan: hola"`.

**Función:** `handleIncomingGroupMessage` en `server/services/channels/whatsapp.ts`
**Commit:** `8df72aa`

---

## 3. Contactos: foto de perfil y nombre

- **Foto:** los contactos creados por sincronización de historial ya no quedan sin foto.
  Límite de 300 por sincronización, con 400 ms entre cada pedido para no saturar WhatsApp.
- **Foto (creación manual):** antes solo se buscaba si el tipo era exactamente
  `whatsapp_unofficial`; ahora cubre también `whatsapp` y cualquier contacto de origen WhatsApp.
- **Nombre:** usa el nombre que la persona tiene puesto en WhatsApp
  (`notify` / `pushName` / `verifiedName`) antes de caer al número pelado.

**Commit:** `b854c2d`

---

## 4. Sincronizar historial desde una fecha — ⏳ PR abierto, sin mergear

🔗 **https://github.com/Bcousino890/Zinto-code/pull/4**

Botón *Sync History* al lado de cada conexión de WhatsApp, con fecha "desde" y "hasta".
Recorre cada conversación existente pidiendo mensajes hacia atrás hasta llegar a esa fecha, o
hasta que WhatsApp deje de dar más.

**Límite real que conviene tener presente:** WhatsApp no permite pedir "dame los chats entre
tal y tal fecha". Un chat que nunca estuvo en el CRM solo puede aparecer cuando WhatsApp manda
su lista de chats al reconectar — no se puede descubrir por fecha.

**Estado:** sin probar contra una conexión real. Revisar antes de mergear.

---

## 5. Marca: BotHive → Zinto

28 archivos con textos que veía el usuario final: invitaciones por email, notificaciones del
navegador, nombre del remitente SMTP, el `brand_name` del checkout de PayPal, los textos por
defecto del constructor de sitios, la página de "build required", y el email de soporte del 404
(`support@zinto.app`).

Quedaron **a propósito** sin tocar: nombres de variables internas, comentarios de código, el
nombre de una caché de IndexedDB, un campo `source` de webhook que integraciones externas
podrían estar filtrando, y la comparación `company.name === 'BotHive Admin'` que valida contra
datos reales de la base.

**Commits:** `7f0f83b`, `788f44e`

---

## 6. Arreglos de producción

### Pantalla en blanco (6 sep 2026)

La app quedó completamente caída: abría y no mostraba nada.

**Causa:** se agregó `useTranslation()` dentro de `AuthProvider` y `BrandingProvider`, pero
esos providers están montados **por encima** de `TranslationProvider`. El hook estaba escrito
para lanzar un error si no encuentra su provider → React desmontaba todo el árbol.

```
Uncaught Error: useTranslation must be used within a TranslationProvider
    at AuthProvider
```

**Arreglo, en dos partes:**
1. `useTranslation` ya no explota si falta el provider: devuelve el texto en inglés por defecto
   y avisa por consola (`078a26a`)
2. `TranslationProvider` se movió al tope, dentro de `QueryClientProvider`, así cubre a todos
   y la traducción vuelve a estar completa (`2f09257`)

La parte 1 queda como red de seguridad: si mañana alguien agrega otro provider arriba, la app
muestra texto sin traducir en vez de caerse entera.

### Historial de WhatsApp: 48 h → 7 días

La interfaz prometía "últimos 7 días" pero el código descartaba todo lo anterior a 48 h.
Ahora coinciden. **Commit:** `c3cb220`

### Otros

- Fotos de contacto, historial de conversaciones, conversaciones duplicadas vacías y límite de
  subida de 10 MB → 100 MB (PR #1, hecho en otra sesión)
- El bucle de sincronización leía un ID de grupo como si fuera un teléfono y creaba contactos
  basura — ya se excluyen los `@g.us`
- Mensajes que llegaban marcados "Unsupported message type": los mensajes de "ver una vez" y
  los de "mensajes temporales" (ephemeral) nunca se desenvolvían, así que caían siempre al caso
  desconocido en vez de mostrarse como imagen/video/texto. **Commit:** `a0328d7`
- Vista previa de enlaces (ej. links de portales inmobiliarios) rota con error CORS en consola:
  la miniatura tenía `crossOrigin="anonymous"` sin necesitarlo (no se lee el pixel de la imagen
  en ningún lado), lo que exigía que el sitio externo mandara cabeceras CORS que la mayoría no
  manda. Se sacó el atributo. **Commit:** `488c788`

---

## Pendientes

### Fotos de perfil: extracción gradual

Bajar el tope de 300 a **250** por sincronización y, en vez de cortar en seco al llegar al
límite, que un proceso de fondo vaya sacando las que faltan mientras el número esté conectado
(~90 por hora, sin ráfagas).

Necesita una columna nueva `contacts.avatar_fetch_attempted_at` para no reintentar
eternamente a los contactos que no tienen foto o la tienen en privado.

### De la auditoría inicial, sin resolver

Comparación entre el snapshot de producción `zinto-app` y este repo — 19 hallazgos.
Lo que sigue abierto:

| Prioridad | Qué |
|---|---|
| 🔴 | Faltan 3 migraciones de pgvector (`2026-05-22-pgvector-foundation.sql` y dos más). El esquema y cuatro servicios las asumen, pero no existen → la base de conocimiento no funciona en una instalación nueva |
| 🔴 | `server/index.ts`: el `catch` de las migraciones está **vacío** — si una falla, el servidor arranca igual y en silencio |
| 🔴 | `server/utils/secure-env.ts`: las validaciones de arranque son cuerpos vacíos, no validan nada |
| 🔴 | `docker-compose.yml` con contraseñas, `SESSION_SECRET` y `ADMIN_PASSWORD` escritos en el archivo, y `FORCE_INSECURE_COOKIE=true` |
| 🟠 | `.gitignore` no protege `.env` ni certificados |
| 🟠 | `docker compose up --build` falla en un clon limpio: ningún Dockerfile ejecuta `npm run build` |
| 🟠 | 83 bloques `catch { }` vacíos en `server/` |
| 🟠 | Los 4 scripts de test de `package.json` apuntan a archivos que no existen |

---

## Notas para quien siga

- **Nada de esto se probó contra una conexión real de WhatsApp.** Los switches nuevos vienen
  apagados por defecto justamente por eso.
- Las migraciones corren solas al arrancar el servidor, no en el deploy. Y como el `catch` está
  vacío (ver pendientes), si una falla **no te vas a enterar**.
- El deploy se dispara automático al pushear a `main` (GitHub Actions → SSH al VPS →
  `npm run build` + `pm2 restart zinto`). Tarda ~2 minutos.
