# Zinto CRM Integration API v2 quickstart

This guide covers the public routes mounted by the current implementation. The API base URL is `https://crm.zinto.app/api/v2`.

## Rutas disponibles en esta versión

| Area | Public v2 status | Notes |
| --- | --- | --- |
| Contacts | Available | Create or update a contact by external ID. |
| Messages | Available | Send CRM-originated text messages through an existing company channel. |
| Campaigns | Not mounted | La sincronización bidireccional de campañas aún no tiene una ruta pública v2. No automatice campañas mediante esta API. |
| Appointments | Available | Upsert an appointment for an existing tenant contact. |
| Deals | Available | Upsert a deal for an existing tenant contact and pipeline. |
| Outbound webhooks | Delivery contract only | The signing/delivery helper exists; no public endpoint configures or receives these webhooks. |

Do not construct requests for the unavailable areas from internal service names or declared scopes. The `campaigns:*` and `webhooks:manage` scopes may be returned by the capabilities route, but scopes do not themselves make routes available.

## Prerequisites

Obtain an active Zinto API key for the target company and ensure it has the permissions required below. API keys have the format `pcp_` followed by 64 lowercase hexadecimal characters. For a contact sync, obtain the numeric integration ID associated with that company.

Set these values in your client:

```bash
BASE_URL='https://crm.zinto.app/api/v2'
API_KEY='pcp_replace_with_your_api_key'
INTEGRATION_ID='1'
```

The included [Postman collection](zinto-crm-integration.postman_collection.json) has equivalent variables.

## Consultar el contrato publicado

`GET /openapi.json` publica el contrato OpenAPI que corresponde a las rutas
montadas. Úselo como referencia de integración y no infiera rutas a partir de
permisos o nombres de servicios internos:

```bash
curl "$BASE_URL/openapi.json"
```

## Check availability

`GET /health` is the sole unauthenticated route:

```bash
curl "$BASE_URL/health"
```

It returns:

```json
{ "status": "ok", "version": "v2" }
```

## Inspect integration capabilities

`GET /capabilities` requires the `integrations:manage` permission:

```bash
curl "$BASE_URL/capabilities" \
  -H "Authorization: Bearer $API_KEY"
```

The response identifies the v2 scope vocabulary and reports the outbound webhook signature format. It is useful for permission discovery, but is not an endpoint catalog.

## Create or update a contact

`PUT /contacts/{externalId}` requires `contacts:write`. `externalId` is the stable identifier from the CRM. Repeating the request with the same external ID updates the mapped contact.

```bash
curl --request PUT "$BASE_URL/contacts/crm-contact-123" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "Ada Lovelace",
    "phone": "+15551234567",
    "email": "ada@example.com",
    "company": "Analytical Engines",
    "tags": ["vip"],
    "customFields": { "crm_tier": "gold" }
  }'
```

`name` is required and must be nonempty. The route accepts optional string `phone`, `email`, and `company`, optional array `tags`, and optional object `customFields`. It returns `201` when it creates the mapping/contact and `200` when it updates one:

```json
{ "data": { "...": "contact returned by Zinto" }, "created": true }
```

## Send a CRM-originated message

`POST /messages` requires `messages:send`. `channelId` identifies an existing
channel belonging to the API key's company; the message is delivered through
the established Zinto message service and retained with CRM-origin metadata.

```bash
curl --request POST "$BASE_URL/messages" \
  -H "Authorization: Bearer $API_KEY" \
  -H "X-Zinto-Integration-Id: $INTEGRATION_ID" \
  -H "Content-Type: application/json" \
  --data '{
    "channelId": 42,
    "recipient": "+15551234567",
    "text": "Your appointment is confirmed.",
    "external_message_id": "crm-message-123"
  }'
```

`recipient` and `text` must be nonempty strings, and `channelId` must be a
positive integer. The optional `external_message_id` is returned unchanged in
the accepted response and stored as CRM metadata; it is not a replay key.

## Upsert appointments and deals

`PUT /appointments/{externalId}` requires `appointments:write` and an
`Idempotency-Key`. Its body must provide an existing tenant `contactId`, a
nonempty `title`, ISO `startsAt` and `endsAt`, and a Zinto appointment status.
The external ID maps subsequent requests to the same Zinto appointment.

`POST /deals` requires `deals:write` and an `Idempotency-Key` of 8–128
characters. Its body must include the CRM `externalId`, plus existing tenant
`contactId` and `pipelineId`, `title`, supported `stage`, and integer `value`.
The API verifies every referenced record belongs to the authenticated company
before creating or updating the mapped deal.

## Authentication and permissions

Send `Authorization: Bearer <API_KEY>` on every route except `/health`. The authenticated v2 router checks API-key validity, active status, expiry, and any configured IP allow-list before handling the route. A missing or invalid key returns `401`; a valid key without the route's permission returns `403`.

The contact route also requires `X-Zinto-Integration-Id` to be a positive integer. It is tenant-scoped through the API key's company; do not send a company ID in the request body or headers.

### Permisos editables

Un administrador de la empresa puede crear, activar, desactivar y editar una
clave desde **Configuración → Acceso API**. Las operaciones administrativas de
claves usan la sesión de Zinto (no son parte de la API pública v2):

| Acción de integración | Permiso mínimo de la clave |
| --- | --- |
| Consultar capacidades | `integrations:manage` |
| Crear/actualizar contactos | `contacts:write` |
| Enviar mensajes desde el CRM | `messages:send` |
| Crear/actualizar agenda | `appointments:write` |
| Crear/actualizar negocios | `deals:write` |

Asigne el mínimo necesario. Una clave sin permiso recibe `403`; una clave
inactiva, expirada o inválida recibe `401`. Cambiar permisos o desactivar una
clave afecta las solicitudes posteriores; guarde el valor completo de la clave
solo al crearla, porque no se vuelve a mostrar.

## Idempotency

Contact, appointment, and deal upserts use their stable CRM `externalId` mappings to identify the existing Zinto record. Appointment and deal routes additionally require `Idempotency-Key`; use a stable key for a retry. Message retries can create a new delivery; `external_message_id` preserves CRM correlation only. Campaign requests are not mounted.

## Outbound webhook signature contract

When the integration webhook delivery helper is used by the application, it emits a JSON body and these headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Zinto-Event-Id` | Event UUID |
| `X-Zinto-Timestamp` | Event `occurred_at` string |
| `X-Zinto-Signature` | `v1=` plus an HMAC-SHA256 digest |

The signed byte sequence is the literal string `timestamp + "." + raw_body`, where `timestamp` is exactly the `X-Zinto-Timestamp` value and `raw_body` is the unmodified JSON request body. The header is `v1=<lowercase hex digest>`.

Example verifier (Node.js):

```js
import crypto from 'node:crypto';

const expected = `v1=${crypto
  .createHmac('sha256', webhookSecret)
  .update(`${timestamp}.${rawBody}`)
  .digest('hex')}`;

const provided = Buffer.from(signature);
const expectedBuffer = Buffer.from(expected);
const valid = provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
```

Verify against the raw body before parsing JSON, use a timing-safe comparison after checking equal buffer lengths, and reject stale timestamps according to your receiver's replay policy. The current public API has no route for registering a webhook URL or secret, so this is a receiver contract—not a self-service webhook setup flow.

## Errors and retries

Errors are JSON objects with `error` and `message` fields. The contact and message routes can return:

| Status | Error | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing/invalid company context, integration ID, external ID, or contact name. |
| 401 | `API_KEY_MISSING`, `API_KEY_INVALID_FORMAT`, `API_KEY_NOT_FOUND`, `API_KEY_INACTIVE`, or `API_KEY_EXPIRED` | Authentication failed. |
| 403 | `INSUFFICIENT_PERMISSIONS` | The API key lacks the required route permission. |
| 500 | `CONTACT_SYNC_FAILED` or `MESSAGE_SYNC_FAILED` | Contact or message synchronization failed. Retry only after investigating the returned message. |

For network failures and `5xx`, use bounded exponential backoff with jitter. Do not retry validation or authorization errors until the request or key configuration changes. The current v2 router does not mount the API-key rate-limit middleware, so no v2 `429` response contract is documented here.

## Sandbox y producción

La base pública actual es la misma: `https://crm.zinto.app/api/v2`. El entorno
de una clave se configura al crearla o editarla en Zinto:

| Entorno | Requisito de URL de webhook |
| --- | --- |
| `sandbox` | `localhost`, `127.0.0.1`, `[::1]`, o un dominio `.test` / `.example` |
| `production` | URL HTTPS y no localhost |

Para sandbox cree una clave independiente, una integración independiente y
contactos/canales de prueba. No reutilice una clave de producción ni datos de
clientes para ensayos. El entorno etiqueta y valida la configuración de la
clave; no crea un host API alternativo ni simula envíos de WhatsApp.
