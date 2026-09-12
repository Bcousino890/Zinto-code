# Zinto CRM API v2 — Guía para empresas y desarrolladores

Para el traspaso técnico específico de SmartBC consulte también la [guía
SmartBC ↔ Zinto](smartbc-zinto-api-v2.md), que incluye ejemplos completos,
UUID del Integration ID, secreto de webhook y checklist de puesta en marcha.

## Qué resuelve

Zinto mantiene sincronizados su CRM, agenda, pipeline, campañas y conversaciones con el CRM de su empresa. Zinto es el gateway de WhatsApp: todo mensaje se envía y recibe por Zinto y se replica automáticamente hacia el CRM conectado.

## Antes de comenzar

Un administrador de Zinto debe crear una integración y una clave de producción desde **Configuración > Acceso API**. Conceda únicamente los scopes necesarios. En la tarjeta de la integración use **Ver secreto** para consultar el secreto del webhook; **Regenerar secreto** invalida el anterior. Guárdelo en un gestor de secretos.

Base URL de producción: `https://crm.zinto.app/api/v2`.

## Autenticación

Envíe la clave en cada petición:

```http
Authorization: Bearer pcp_...
X-Zinto-Integration-Id: UUID_DE_INTEGRACION
Content-Type: application/json
```

`Idempotency-Key` es obligatorio en campañas, agenda, oportunidades y
sincronización inicial. Reutilice la misma clave solo al reintentar exactamente
la misma operación; no incluya credenciales en la URL.

## Flujos principales

### Enviar desde el CRM

```http
POST /messages
```

```json
{
  "contact": { "external_id": "hubspot-1204", "phone": "+56912345678" },
  "channel_id": "chn_123",
  "type": "text",
  "text": "Hola, ¿podemos ayudarte?",
  "external_message_id": "crm-msg-8841"
}
```

Zinto devuelve `202 Accepted` con `message.id`. Más tarde entregará `message.sent`, `message.delivered`, `message.read` o `message.failed` al webhook configurado.

### Recibir respuesta del cliente

Cuando un cliente responde, Zinto entrega:

```json
{
  "id": "evt_01J...",
  "type": "message.received",
  "occurred_at": "2026-09-07T02:47:53Z",
  "origin": "zinto",
  "data": {
    "id": "msg_123",
    "conversation_id": "cnv_123",
    "contact": { "id": "cnt_123", "external_id": "hubspot-1204" },
    "text": "Sí, quisiera una hora para mañana"
  }
}
```

Guarde el mensaje en el CRM. No lo reenvíe a Zinto: ya fue recibido desde Zinto.

### Sincronizar contactos, agenda, pipeline y campañas

Use `PUT /contacts/{external_id}`, `PUT /appointments/{external_id}` y `POST
/deals` para crear o actualizar. Para campañas use `POST /campaigns/batch` (hasta
100 elementos). Zinto responderá con los IDs interno y externo vinculados. Las
modificaciones hechas en Zinto llegarán como eventos `contact.updated`,
`appointment.updated`, `deal.stage_changed` o `campaign.updated`.

## Webhooks

Configure una URL HTTPS que responda en menos de 10 segundos. Zinto entrega eventos al menos una vez; deduplique por `X-Zinto-Event-Id` o `body.id`.

Verifique la firma HMAC SHA-256 usando el secreto de la integración y el texto exacto del cuerpo:

```text
payload_to_sign = X-Zinto-Timestamp + "." + raw_request_body
expected = HMAC_SHA256(secret, payload_to_sign)
```

Compare la firma en tiempo constante. Rechace timestamps con más de 5 minutos de antigüedad. Responda `2xx` solo después de persistir el evento; para trabajo lento, guárdelo y procéselo en cola.

Eventos iniciales: `message.received`, `message.sent`, `message.delivered`, `message.read`, `message.failed`, `contact.created`, `contact.updated`, `appointment.created`, `appointment.updated`, `deal.created`, `deal.stage_changed`, `campaign.updated`, `sync.failed` y `conflict.created`.

## Conflictos y origen de datos

Por defecto, el CRM es dueño de contactos, agenda, pipeline y campañas. Zinto es dueño de conversaciones, mensajes y canales. Si ambos sistemas alteran un dato compartido, Zinto aplica la regla configurada para ese campo; si no hay regla, crea un conflicto en vez de sobrescribir silenciosamente.

Para prevenir bucles, conserve `external_id`, `external_message_id`, `origin` y el ID del evento recibido. Una actualización procedente de Zinto se aplica localmente, pero no vuelve a publicarse como una nueva actualización hacia Zinto.

## Errores, límites y soporte

La respuesta de error tiene forma:

```json
{ "error": "INSUFFICIENT_PERMISSIONS", "message": "Missing messages:send" }
```

Respete `429`, lea `Retry-After` y aplique reintentos con espera exponencial. Para soporte, entregue el `request_id` o el `event_id`; Zinto puede rastrear la operación completa sin pedir claves ni secretos.
