# Inicio rápido: integración CRM de Zinto API v2

Esta guía cubre las rutas públicas disponibles en la implementación actual. La
base de la API es `https://crm.zinto.app/api/v2`.

## Rutas disponibles en esta versión

| Área | Estado público v2 | Notas |
| --- | --- | --- |
| Contactos | Disponible | Crea o actualiza por el identificador externo del CRM. |
| Mensajes | Disponible | Envía mensajes de texto a través de un canal existente de la empresa. |
| Campañas | Disponible | Sincronización por lotes mediante `POST /campaigns/batch`. |
| Agenda | Disponible | Crea o actualiza una cita para un contacto existente. |
| Negocios/pipeline | Disponible | Crea o actualiza una oportunidad y su etapa. |
| Webhooks salientes | Contrato de entrega | La URL se configura en la integración CRM; SmartBC recibe los eventos firmados. |

Use el contrato OpenAPI publicado como fuente de verdad; no construya solicitudes a partir de nombres de servicios internos o scopes no documentados.

## Requisitos previos

Obtenga una API Key activa de Zinto para la empresa objetivo y asígnele los permisos necesarios. Las API Keys tienen el formato `pcp_` seguido de 64 caracteres hexadecimales minúsculos. Obtenga también el `Integration ID` UUID de la integración CRM; es un valor de texto aleatorio, no un número.

Defina estos valores en SmartBC:

```bash
BASE_URL='https://crm.zinto.app/api/v2'
API_KEY='pcp_replace_with_your_api_key'
INTEGRATION_ID='UUID_DE_INTEGRACION'
```

La [colección Postman incluida](zinto-crm-integration.postman_collection.json)
usa variables equivalentes.

## Consultar el contrato publicado

`GET /openapi.json` publica el contrato OpenAPI que corresponde a las rutas
montadas. Úselo como referencia de integración y no infiera rutas a partir de
permisos o nombres de servicios internos:

```bash
curl "$BASE_URL/openapi.json"
```

## Comprobar disponibilidad

`GET /health` es la única ruta sin autenticación:

```bash
curl "$BASE_URL/health"
```

Devuelve:

```json
{ "status": "ok", "version": "v2" }
```

## Inspect integration capabilities

`GET /capabilities` requires the `integrations:manage` permission:

```bash
curl "$BASE_URL/capabilities" \
  -H "Authorization: Bearer $API_KEY"
```

La respuesta identifica los scopes v2 y el formato de firma de webhooks. Es útil para descubrir permisos, pero el catálogo de rutas válido es el contrato OpenAPI.

## Crear o actualizar un contacto

`PUT /contacts/{externalId}` requiere `contacts:write`. `externalId` es el
identificador estable del CRM. Repetir la solicitud con el mismo identificador
actualiza el contacto vinculado.

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

`name` es obligatorio y no puede estar vacío. La ruta acepta las cadenas
opcionales `phone`, `email` y `company`, el arreglo opcional `tags` y el objeto
opcional `customFields`. Devuelve `201` al crear y `200` al actualizar:

```json
{ "data": { "...": "contact returned by Zinto" }, "created": true }
```

## Enviar un mensaje desde el CRM

`POST /messages` requiere `messages:send`. `channelId` identifica un canal
existente de la empresa de la API Key; el mensaje se entrega mediante el
servicio de mensajería de Zinto y conserva metadatos de origen CRM.

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

`recipient` y `text` deben ser cadenas no vacías, y `channelId` debe ser un
entero positivo. `external_message_id` es opcional, se devuelve sin cambios en
la respuesta aceptada y sirve para correlación; no es una clave de reintento.

## Crear o actualizar agenda y oportunidades

`PUT /appointments/{externalId}` requiere `appointments:write` y
`Idempotency-Key`. El cuerpo debe incluir un `contactId` existente, un `title`
no vacío, `startsAt` y `endsAt` ISO, y un estado de cita válido en Zinto. El
identificador externo vincula las solicitudes posteriores con la misma cita.

`POST /deals` requiere `deals:write` y un `Idempotency-Key` de 8–128
caracteres. El cuerpo debe incluir el `externalId` del CRM, además de
`contactId` y `pipelineId` existentes, `title`, `stage` compatible y `value`
entero. La API verifica que cada registro referenciado pertenezca a la empresa
autenticada antes de crear o actualizar la oportunidad.

## Authentication and permissions

Envíe `Authorization: Bearer <API_KEY>` en todas las rutas salvo `/health`.
El router v2 comprueba validez, estado activo, expiración y la lista de IP
permitidas de la API Key antes de procesar la ruta. Una clave ausente o inválida
devuelve `401`; una clave válida sin el permiso requerido devuelve `403`.

Las rutas de recursos también requieren `X-Zinto-Integration-Id` con el UUID completo de la integración. En SmartBC debe almacenarse como texto para no truncar ni transformar los guiones. Los enteros positivos solo se aceptan por compatibilidad histórica y no deben usarse en integraciones nuevas. El alcance se determina por la empresa de la API Key; no envíe un `companyId` en el cuerpo ni en las cabeceras.

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

## Idempotencia

Los upserts de contactos, citas, oportunidades y campañas usan los `externalId`
estables del CRM para identificar el registro de Zinto. Las rutas de citas,
oportunidades, campañas y sincronización inicial requieren además
`Idempotency-Key`; use la misma clave al reintentar una operación. Los
reintentos de mensajes pueden crear una nueva entrega; `external_message_id`
conserva únicamente la correlación con SmartBC.

## Contrato de firma de webhooks salientes

La entrega de webhooks emite un cuerpo JSON y estas cabeceras:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-Zinto-Event-Id` | UUID del evento |
| `X-Zinto-Timestamp` | Cadena `occurred_at` del evento |
| `X-Zinto-Signature` | `v1=` seguido del resumen HMAC-SHA256 |

La secuencia firmada es literalmente `timestamp + "." + raw_body`, donde
`timestamp` es exactamente el valor de `X-Zinto-Timestamp` y `raw_body` es el
cuerpo JSON sin modificar. La cabecera resultante es `v1=<hexadecimal en
minúsculas>`.

Ejemplo de verificación (Node.js):

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

Verifique el cuerpo crudo antes de analizar el JSON, compare en tiempo
constante después de comprobar que las longitudes coinciden y rechace marcas de
tiempo antiguas según la política anti-repetición de SmartBC. La URL y el
secreto se configuran en la integración CRM de Zinto; esta API pública no los
registra automáticamente.

## Errores y reintentos

Los errores son objetos JSON con los campos `error` y `message`. Las rutas de
contactos y mensajes pueden devolver:

| Status | Error | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Contexto de empresa, Integration ID, external ID o nombre de contacto ausente o inválido. |
| 401 | `API_KEY_MISSING`, `API_KEY_INVALID_FORMAT`, `API_KEY_NOT_FOUND`, `API_KEY_INACTIVE` o `API_KEY_EXPIRED` | Falló la autenticación. |
| 403 | `INSUFFICIENT_PERMISSIONS` | La API Key no tiene el permiso de la ruta. |
| 500 | `CONTACT_SYNC_FAILED` o `MESSAGE_SYNC_FAILED` | Falló la sincronización; investigue el mensaje antes de reintentar. |

Para fallos de red y `5xx`, use backoff exponencial acotado con jitter. No
reintente errores de validación o autorización hasta cambiar la solicitud o la
configuración de la clave. Respete `429` y `Retry-After` si el entorno los
devuelve.

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
