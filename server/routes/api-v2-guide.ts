export const API_V2_GUIDE_MARKDOWN = `# Zinto CRM API v2 — Guía completa

Base de producción: https://crm.zinto.app/api/v2

## Autenticación

Incluya la clave API en el encabezado de cada petición protegida. Nunca la incluya en la URL, en parámetros de consulta ni en el código del navegador.

~~~http
Authorization: Bearer TU_API_KEY
X-Zinto-Integration-Id: ID_DE_INTEGRACION
Content-Type: application/json
Idempotency-Key: una-clave-unica-por-operacion
~~~

La clave se crea en Configuración → Acceso API → Crear clave API. Seleccione Sandbox para pruebas y Producción para datos reales. Conceda solo los permisos necesarios.

## Obtener el Integration ID

La API Key y el Integration ID son credenciales diferentes. El Integration ID identifica la conexión CRM de una empresa y debe enviarse en la cabecera \`X-Zinto-Integration-Id\`; no se coloca en la URL ni se inventa a partir del ejemplo de esta guía.

1. En Zinto, abra **Configuración → Acceso API → Integraciones CRM**.
2. Pulse **Crear integración**, indique el nombre y proveedor, configure el webhook HTTPS y seleccione los permisos mínimos.
3. Active la integración cuando la URL y el receptor del webhook estén listos.
4. Copie el identificador UUID aleatorio mostrado como **Integration ID**. El secreto del webhook se muestra una sola vez; guárdelo en un gestor de secretos.
5. Cree o asocie una API Key para esa empresa y sustituya \`TU_API_KEY\` e \`ID_DE_INTEGRACION\` en su integración.

El ID pertenece a la empresa autenticada. Un ID de otra empresa, un ID inactivo o un valor ficticio será rechazado; nunca envíe \`companyId\` para intentar cambiar el alcance.

## Flujo bidireccional

1. El CRM envía un mensaje a POST /messages.
2. Zinto lo entrega por el canal configurado y responde con 202 Accepted.
3. Zinto envía al webhook del CRM los eventos message.sent, message.delivered, message.read o message.failed.
4. Cuando el cliente responde, Zinto envía message.received; el CRM guarda el mensaje y no lo reenvía a Zinto.
5. Los cambios de contactos, agenda, pipeline y campañas se sincronizan mediante los endpoints PUT y POST y sus eventos correspondientes.

## Endpoints

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | /health | Público |
| GET | /openapi.json | Público |
| GET | /postman.json | Público |
| GET | /guide.md | Público |
| GET | /capabilities | integrations:manage |
| PUT | /contacts/{externalId} | contacts:write |
| POST | /messages | messages:send |
| POST | /campaigns/batch | campaigns:write |
| PUT | /appointments/{externalId} | appointments:write |
| POST | /deals | deals:write |
| POST | /sync-jobs | integrations:manage |

## Ejemplo: enviar desde el CRM

~~~bash
curl -X POST https://crm.zinto.app/api/v2/messages \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":1,"recipient":"+56912345678","text":"Hola desde el CRM","external_message_id":"crm-msg-8841"}'
~~~

## Webhooks y seguridad

Configure una URL HTTPS que responda en menos de 10 segundos. Verifique X-Zinto-Signature con HMAC-SHA256 sobre X-Zinto-Timestamp.raw_request_body, compare en tiempo constante y rechace marcas de tiempo con más de cinco minutos. Deduplique por X-Zinto-Event-Id.

Zinto entrega al menos una vez; responda 2xx después de persistir el evento y use una cola para trabajo lento. Respete 429 y Retry-After con espera exponencial.

## Errores

~~~json
{"error":{"code":"INSUFFICIENT_SCOPE","message":"Missing messages:send","request_id":"req_123"}}
~~~

Los códigos habituales son API_KEY_MISSING, API_KEY_INVALID, INSUFFICIENT_SCOPE, VALIDATION_ERROR, IDEMPOTENCY_CONFLICT, RATE_LIMITED e INTERNAL_ERROR. Para soporte entregue request_id o event_id, nunca claves ni secretos.

## Descargas

- OpenAPI: GET /api/v2/openapi.json
- Postman: GET /api/v2/postman.json
- Esta guía: GET /api/v2/guide.md
`;
