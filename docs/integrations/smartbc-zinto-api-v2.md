# Integración SmartBC ↔ Zinto (API v2)

Guía para el equipo de desarrollo de SmartBC. La integración es bidireccional:
SmartBC escribe en Zinto mediante API y Zinto informa a SmartBC mediante
webhooks.

## Novedades recientes (ya activas en producción, no en desarrollo)

- **Templates de WhatsApp** — `POST /messages` acepta un campo opcional
  `template` (mutuamente excluyente con `media`), para contactar a alguien
  que no escribió en las últimas 24hs. Ver la sección "Plantilla de WhatsApp
  a un lead inactivo" más abajo.
- **Tres endpoints de lectura nuevos** — `GET /channels`, `GET /conversations`
  y `GET /messages/{messageId}/status`. Resuelven, entre otras cosas, cómo
  descubrir el `channelId` sin pedirlo a mano. Ver la sección "Canales,
  conversaciones y estado de un mensaje" más abajo.
- **Foto de perfil de WhatsApp** (`avatarUrl` en `PUT /contacts` y
  `data.contact.avatar_url` en webhooks) y **media** (imagen/vídeo/audio/
  documento) en mensajes salientes y entrantes — ver sus secciones
  correspondientes más abajo.

Todo lo de esta sección ya está documentado en detalle en el resto de esta
guía; esta lista es solo para ubicar rápido qué es nuevo.

## Arquitectura

```text
SmartBC ──API v2──> Zinto ──WhatsApp──> Cliente
SmartBC <─webhook── Zinto <─WhatsApp── Cliente
```

Un mensaje enviado desde SmartBC se entrega por el canal de Zinto y sus estados
(`message.sent`, `message.delivered`, `message.read`, `message.failed`) llegan
al webhook. Una respuesta del cliente llega primero a Zinto y después como
`message.received`; SmartBC debe guardarla y no reenviarla a Zinto. Los mensajes
enviados desde la bandeja de Zinto siguen el mismo flujo hacia SmartBC.

## Credenciales y aislamiento

En Zinto, un administrador crea una API Key y una integración en
`Configuración → Acceso API → Integraciones CRM`. La API Key y el Integration
ID son valores distintos. En cada petición protegida envíe:

```http
Authorization: Bearer pcp_REEMPLAZAR_CON_API_KEY
X-Zinto-Integration-Id: UUID_DE_INTEGRACION
Content-Type: application/json
```

El Integration ID es un UUID aleatorio y debe tratarse siempre como texto. En
el portal SmartBC el campo debe ser `type="text"`: nunca use `type="number"`,
flechas numéricas, `Number()` ni elimine los guiones. No envíe `companyId`; la
empresa se determina por la API Key y Zinto valida que el UUID pertenezca a esa
empresa. Nunca coloque la API Key, el UUID o el secreto en la URL.

El secreto del webhook se obtiene en la tarjeta de integración con **Ver
secreto** (también se muestra al crear o regenerar). Guárdelo en el gestor de
secretos de SmartBC. Solo se usa para verificar webhooks de Zinto; no se envía
en las peticiones API.

Base URL: `https://crm.zinto.app/api/v2`.

### Diagnóstico de `403` en `/capabilities`

`GET /capabilities` solo necesita `Authorization: Bearer $API_KEY` y que la
clave tenga `integrations:manage`; el header `X-Zinto-Integration-Id` puede
omitirse en esta ruta. La clave y la integración deben pertenecer a la misma
empresa (tenant), pero no existe una asociación directa entre ambas. Si la
respuesta es `INSUFFICIENT_PERMISSIONS`, un administrador debe editar la API
Key en **Configuración → Acceso API → Claves API**, activar
`integrations:manage` y repetir la prueba. No active v2 para resolver este
error: v1 seguirá funcionando mientras se corrige el permiso.

### Configurar el webhook desde SmartBC (self-service)

Alternativa a hacerlo desde el panel de Zinto. `GET /webhook` (requiere
`webhooks:manage`) devuelve la URL configurada y si hay un secreto
(`secretConfigured`) — nunca el secreto en sí.

```bash
curl -X PATCH "$BASE_URL/webhook" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://portal.smartbc.cl/api/webhooks/zinto"}'
# {"data":{"url":"https://portal.smartbc.cl/api/webhooks/zinto","secretConfigured":true,"secret":"zinto_whsec_..."}}
```

`secret` solo viene en la respuesta cuando se generó uno nuevo en esa misma
llamada (primera vez que se configura `url`, o `rotateSecret: true`) —
guárdelo ahí mismo, no se puede volver a consultar después.

## Rutas

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | `/health` | Público |
| GET | `/openapi.json` | Público |
| GET | `/postman.json` | Público |
| GET | `/guide.md` | Público |
| GET | `/capabilities` | `integrations:manage` |
| GET | `/webhook` | `webhooks:manage` |
| PATCH | `/webhook` | `webhooks:manage` |
| PUT | `/contacts/{externalId}` | `contacts:write` |
| POST | `/messages` | `messages:send` (+ `media:upload` si incluye `media`) |
| POST | `/media/upload` | `media:upload` |
| GET | `/media` | `media:read` |
| GET | `/channels` | `channels:read` |
| GET | `/conversations` | `conversations:read` |
| GET | `/messages/{messageId}/status` | `messages:read` |
| POST | `/messages/{messageId}/read` | `messages:send` |
| GET | `/templates` | `templates:read` |
| GET | `/templates/{templateId}` | `templates:read` |
| POST | `/templates` | `templates:write` |
| PATCH | `/templates/{templateId}` | `templates:write` |
| DELETE | `/templates/{templateId}` | `templates:write` |
| POST | `/campaigns/batch` | `campaigns:write` |
| PUT | `/appointments/{externalId}` | `appointments:write` |
| POST | `/deals` | `deals:write` |
| POST | `/sync-jobs` | `integrations:manage` |

Todas las rutas de recursos protegidas requieren `Authorization` y
`X-Zinto-Integration-Id`. `/capabilities` requiere solo `Authorization`.
`POST /campaigns/batch`, `/appointments`, `/deals`, `POST /templates` y
`/sync-jobs` deben incluir además `Idempotency-Key` según el contrato
OpenAPI.

## Ejemplos

### Comprobar salud

```bash
curl -fsS https://crm.zinto.app/api/v2/health
# {"status":"ok","version":"v2"}
```

### Contacto (upsert)

```bash
curl -X PUT "$BASE_URL/contacts/smartbc-contact-123" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada Lovelace","phone":"+56912345678","email":"ada@example.com","customFields":{"smartbc_tipo":"vip"}}'
```

El mismo `externalId` actualiza el vínculo. Devuelve `201` al crear y `200` al
actualizar.

La respuesta puede incluir además `avatarUrl` (URL absoluta) con la foto de
perfil de WhatsApp del contacto — es un campo de solo salida, nunca se envía
en el payload. Se omite si Zinto no tiene la foto. Es un dato best-effort:
solo existe para contactos del canal WhatsApp no oficial (QR), se obtiene una
única vez al crear el contacto (si WhatsApp la entregó en ese momento) y no
se actualiza después; en el canal oficial de WhatsApp Cloud API nunca está
presente.

### Mensaje SmartBC → WhatsApp

```bash
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","text":"Hola desde SmartBC","external_message_id":"smartbc-msg-8841"}'
```

La respuesta es `202` y contiene el ID de Zinto. `channelId` debe pertenecer a
la empresa de la API Key. Use `GET /channels` (vea la sección de solo lectura
más abajo) para listar los canales disponibles y descubrir su `channelId`.

### Plantilla de WhatsApp a un lead inactivo (fuera de 24 horas)

Cuando un lead de SmartBC no ha escrito en las últimas 24 horas, WhatsApp
rechaza texto o media libres — solo se puede reabrir la conversación con una
plantilla ya aprobada. Use `template` en vez de `media` en `POST /messages`
(son mutuamente excluyentes, nunca ambos a la vez); sigue bastando el permiso
`messages:send`, no se introdujo ningún scope nuevo. Esta ruta envía una
plantilla ya aprobada en Zinto — no la crea ni la somete a aprobación.

```bash
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","template":{"name":"appointment_reminder","language":"es","components":[{"type":"body","parameters":[{"type":"text","text":"mañana 10:00"}]}]},"external_message_id":"smartbc-msg-8843"}'
```

`template.name` (obligatorio) es el nombre de una plantilla ya aprobada en
Zinto. `template.language` (obligatorio) es el código de idioma de
WhatsApp/Meta (p. ej. `es`, `en_US`). `template.components` es opcional;
omítalo por completo si la plantilla no tiene variables.

### Reaccionar, enviar ubicación y responder citando un mensaje

Solo canales WhatsApp Official. Cada capacidad usa su propio campo en `POST
/messages`, mutuamente excluyente con `text`/`media`/`template` (salvo
`context`, que se combina con `text`); sigue bastando `messages:send`.

```bash
# Reaccionar (emoji vacío quita una reacción ya enviada)
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","reaction":{"messageId":98765,"emoji":"👍"}}'

# Ubicación estructurada
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","location":{"latitude":-33.45,"longitude":-70.66,"name":"Oficina central"}}'

# Responder citando un mensaje
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","text":"Sí, mañana a las 10","context":{"messageId":98765}}'
```

En los tres casos, `messageId` es el `data.id` de un mensaje propio de esta
empresa (recibido o enviado) — no un identificador interno de WhatsApp.

### Botones/lista interactiva y marcar como leído

Solo canales WhatsApp Official. `buttons` (1 a 3) es obligatorio con
`type: "button"`; `list` es obligatorio con `type: "list"` — nunca ambos.

```bash
curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","interactive":{"type":"button","body":"¿Confirmamos la cita?","buttons":[{"id":"yes","title":"Sí"},{"id":"no","title":"No"}]}}'
```

La respuesta del cliente llega como `message.received` con `data.button` o
`data.list` (ver webhooks más abajo).

```bash
curl -X POST "$BASE_URL/messages/98765/read" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID"
```

`messageId` debe ser un mensaje **recibido** (no enviado) de esta empresa.

### Crear una plantilla de WhatsApp

Esto crea la plantilla en sí y la somete a aprobación de Meta (distinto de
*enviar* una plantilla ya aprobada — ver la sección anterior). Requiere
`templates:write` e `Idempotency-Key` (evita someter dos veces la misma
plantilla si SmartBC reintenta la petición); `connectionId` debe ser un canal
WhatsApp Official de la empresa (use `GET /channels` para listarlos y
descubrir su `id`).

```bash
curl -X POST "$BASE_URL/templates" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Idempotency-Key: smartbc-template-welcome-v1" \
  -H "Content-Type: application/json" \
  -d '{"name":"appointment_reminder","content":"Su cita es mañana a las {{1}}","connectionId":42,"whatsappTemplateCategory":"utility","whatsappTemplateLanguage":"es","variables":[{}]}'
# {"data":{"id":501,"name":"appointment_reminder","whatsappTemplateStatus":"pending", ...}}
```

El estado inicial suele ser `pending`; consulte `GET /templates/{templateId}`
(requiere `templates:read`) más tarde para ver si Meta la aprobó o rechazó.
`PATCH /templates/{templateId}` solo admite `description` e `isActive` — el
contenido ya sometido no se puede editar. Ambas rutas, junto con `DELETE
/templates/{templateId}`, devuelven `404 NOT_FOUND` si la plantilla no existe
o pertenece a otra empresa.

### Foto de una propiedad → WhatsApp (media)

Si el archivo no tiene ya una URL http(s) pública, súbalo primero:

```bash
curl -X POST "$BASE_URL/media/upload" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -F "file=@casa-las-condes.jpg"
# {"data":{"url":"https://crm.zinto.app/media/image/abc123.jpg","type":"image","filename":"casa-las-condes.jpg","size":184320,"mimeType":"image/jpeg"}}

curl -X POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  -d '{"channelId":42,"recipient":"+56912345678","text":"Esta es la propiedad que consultó","media":{"url":"https://crm.zinto.app/media/image/abc123.jpg","type":"image"},"external_message_id":"smartbc-msg-8842"}'
```

`media.type` es `image`, `video`, `audio` o `document`. Con `media`, `text` es
opcional y se usa como caption. Enviar `media` requiere además el permiso
`media:upload` (no solo `messages:send`).

Cuando el cliente responde con una foto/vídeo/audio/documento por WhatsApp,
`message.received` trae un campo `data.media` adicional — vea la sección de
webhooks más abajo. Descárguelo con:

```bash
curl "$BASE_URL/media?type=image&filename=xyz789.jpg" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -o foto-recibida.jpg
```

Requiere `media:read`; solo la empresa dueña del mensaje puede descargarlo.

### Canales, conversaciones y estado de un mensaje (solo lectura)

v2 ahora expone tres rutas de solo lectura, scoped a la empresa de la API
Key; antes de esto la única forma de conocer un `channelId` o el estado de
una entrega era mirar los eventos de webhook.

```bash
curl "$BASE_URL/channels" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID"
# {"data":[{"id":42,"name":"WhatsApp Ventas","type":"whatsapp_official","status":"active","phoneNumber":"+56912345678","displayName":"Ventas","qualityRating":"green","messagingLimitTier":"TIER_1K"}]}
```

Requiere `channels:read`. `qualityRating`/`messagingLimitTier` (según Meta,
refrescados cada hora) solo aparecen en canales WhatsApp Official.

```bash
curl "$BASE_URL/conversations?channelId=42&status=open&limit=20" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID"
# {"data":[{"id":501,"contactId":123,"channelId":42,"channelType":"whatsapp_official","status":"open","isGroup":false,"lastMessageAt":"2026-09-10T14:00:00Z","createdAt":"2026-08-01T10:00:00Z"}],"total":1}
```

Requiere `conversations:read`. Admite los filtros opcionales `channelId`,
`status` e `isGroup` (`true`/`false`), y paginación `page`/`limit` (por
defecto 20, máximo 100).

```bash
curl "$BASE_URL/messages/98765/status" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID"
# {"data":{"status":"delivered","timestamp":"2026-09-10T14:00:05Z"}}
```

Requiere `messages:read`. `messageId` es el `data.id` devuelto por
`POST /messages`. Devuelve `404 {"error":"NOT_FOUND", ...}` si el mensaje no
existe o pertenece a otra empresa (misma respuesta en ambos casos, sin
distinguirlos).

### Cita y oportunidad

```bash
curl -X PUT "$BASE_URL/appointments/smartbc-cita-123" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Idempotency-Key: smartbc-cita-123-v1" -H "Content-Type: application/json" \
  -d '{"contactId":123,"title":"Consulta inicial","startsAt":"2026-10-01T14:00:00Z","endsAt":"2026-10-01T14:30:00Z","status":"scheduled"}'

curl -X POST "$BASE_URL/deals" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Idempotency-Key: smartbc-deal-123-v1" -H "Content-Type: application/json" \
  -d '{"externalId":"smartbc-deal-123","contactId":123,"pipelineId":7,"name":"Venta SmartBC","stage":"qualified","value":1000}'
```

### Campañas y sincronización inicial

```bash
curl -X POST "$BASE_URL/campaigns/batch" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Idempotency-Key: smartbc-campanas-2026-01" \
  -H "Content-Type: application/json" \
  -d '{"campaigns":[{"externalId":"smartbc-camp-1","name":"Bienvenida","status":"active"}]}'

curl -X POST "$BASE_URL/sync-jobs" \
  -H "Authorization: Bearer $API_KEY" -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Idempotency-Key: smartbc-initial-sync-v1" -H "Content-Type: application/json" \
  -d '{"resources":["contacts","appointments","deals","campaigns"],"mode":"dry_run"}'
```

Ejecute `dry_run`, revise recuentos y mapeos, y use `apply` solo después de la
aprobación del responsable.

## Webhooks Zinto → SmartBC

Configure en la integración una URL HTTPS, por ejemplo
`https://portal.smartbc.cl/api/webhooks/zinto`. Zinto firma el cuerpo crudo:

```text
mensaje = X-Zinto-Timestamp + "." + raw_request_body
firma = "v1=" + HMAC_SHA256(WEBHOOK_SECRET, mensaje)
```

Cabeceras: `X-Zinto-Event-Id`, `X-Zinto-Timestamp`,
`X-Zinto-Signature: v1=<hex>` y `Content-Type: application/json`.

Verifique antes de parsear JSON, compare en tiempo constante y rechace
timestamps con más de cinco minutos. Persista el evento o déjelo en una cola
antes de responder `2xx`. La entrega es al menos una vez: deduplique por
`X-Zinto-Event-Id` y tolere reintentos y desorden.

Eventos: `message.received`, `message.sent`, `message.delivered`,
`message.read`, `message.failed`, `contact.created`, `contact.updated`,
`appointment.created`, `appointment.updated`, `deal.created`,
`deal.stage_changed`, `campaign.updated`, `sync.failed` y `conflict.created`.

Cuando el mensaje tiene un adjunto, los eventos `message.*` incluyen además
`data.media`: `{"url": "https://crm.zinto.app/api/v2/media?type=image&filename=xyz789.jpg", "type": "image", "mime_type": "image/jpeg"}`.
`media.type` coincide con el `type` general del mensaje
(`image`/`video`/`audio`/`document`); no hay un campo de caption aparte — si
el cliente escribió uno, viaja en `content`. `media` se omite en mensajes de
solo texto.

El objeto `data.contact` de estos mismos eventos puede incluir además
`avatar_url` con la foto de perfil de WhatsApp del contacto, descargable con
el mismo mecanismo de `GET /media` que los adjuntos de mensajes
(`type=profile_pictures`). Es un dato best-effort: solo se completa para
contactos del canal WhatsApp no oficial (QR), se obtiene una única vez al
crear el contacto y solo si WhatsApp la entregó en ese momento; no se
actualiza si el contacto cambia su foto después. En el canal oficial de
WhatsApp Cloud API nunca está presente, y se omite por completo cuando Zinto
no tiene la foto.

`data` en los eventos `message.*` también trae, cada uno omitido por completo
cuando no aplica: `button`/`list` (respuesta del cliente a un botón o lista
interactiva enviada por Zinto), `reaction` (`{emoji, message_id?}` —
`emoji: null` si se quitó una reacción), `contacts` (tarjetas de contacto
compartidas), `location` (`{latitude, longitude, name?, address?}`) y
`reply_to` (`{message_id}`, cuando el mensaje cita a otro). En todos los
casos `message_id` es el `data.id` de un mensaje propio de esta empresa, no
un identificador de WhatsApp.

## Permisos recomendados

Use solo los scopes necesarios: `contacts:read|write`, `conversations:read|write`,
`messages:read|send`, `channels:read`, `appointments:read|write`,
`deals:read|write`, `campaigns:read|write`, `media:read|upload`,
`webhooks:manage`, `integrations:manage` y `audit:read`.

## Errores y puesta en producción

- `400`: payload, UUID, external ID o idempotencia inválidos.
- `401`: API Key ausente, inválida, inactiva o expirada.
- `403`: falta el permiso requerido.
- `404`: recurso o integración inexistente.
- `429`/`5xx`: reintente con backoff exponencial y jitter; respete
  `Retry-After`.

Antes del corte: pruebe contacto, mensaje ida/vuelta, cita, oportunidad y
campaña; verifique firma y deduplicación; ejecute una sincronización `dry_run`;
guarde API Key y secreto fuera del código; y configure alertas para 401/403,
fallos de webhook, retrasos y conflictos.

## Descargas oficiales

- [OpenAPI](https://crm.zinto.app/api/v2/openapi.json)
- [Postman](https://crm.zinto.app/api/v2/postman.json)
- [Guía Markdown](https://crm.zinto.app/api/v2/guide.md)
