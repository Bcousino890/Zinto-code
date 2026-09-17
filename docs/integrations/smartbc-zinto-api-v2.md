# Integración SmartBC ↔ Zinto (API v2)

Guía para el equipo de desarrollo de SmartBC. La integración es bidireccional:
SmartBC escribe en Zinto mediante API y Zinto informa a SmartBC mediante
webhooks.

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

## Rutas

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | `/health` | Público |
| GET | `/openapi.json` | Público |
| GET | `/postman.json` | Público |
| GET | `/guide.md` | Público |
| GET | `/capabilities` | `integrations:manage` |
| PUT | `/contacts/{externalId}` | `contacts:write` |
| POST | `/messages` | `messages:send` (+ `media:upload` si incluye `media`) |
| POST | `/media/upload` | `media:upload` |
| GET | `/media` | `media:read` |
| GET | `/channels` | `channels:read` |
| GET | `/conversations` | `conversations:read` |
| GET | `/messages/{messageId}/status` | `messages:read` |
| POST | `/campaigns/batch` | `campaigns:write` |
| PUT | `/appointments/{externalId}` | `appointments:write` |
| POST | `/deals` | `deals:write` |
| POST | `/sync-jobs` | `integrations:manage` |

Todas las rutas de recursos protegidas requieren `Authorization` y
`X-Zinto-Integration-Id`. `/capabilities` requiere solo `Authorization`.
`/campaigns/batch`, `/appointments`, `/deals` y `/sync-jobs` deben incluir
además `Idempotency-Key` según el contrato OpenAPI.

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
# {"data":[{"id":42,"name":"WhatsApp Ventas","type":"whatsapp_official","status":"active","phoneNumber":"+56912345678","displayName":"Ventas"}]}
```

Requiere `channels:read`.

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
