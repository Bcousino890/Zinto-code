export const API_V2_GUIDE_MARKDOWN = `# Zinto CRM API v2 — Guía completa

Base de producción: https://crm.zinto.app/api/v2

## Autenticación

Incluya la clave API en el encabezado de cada petición protegida. Nunca la incluya en la URL, en parámetros de consulta ni en el código del navegador.

~~~http
Authorization: Bearer TU_API_KEY
X-Zinto-Integration-Id: ID_DE_INTEGRACION
Content-Type: application/json
~~~

La clave se crea en Configuración → Acceso API → Crear clave API. Seleccione Sandbox para pruebas y Producción para datos reales. Conceda solo los permisos necesarios.

## Obtener el Integration ID

La API Key y el Integration ID son credenciales diferentes. El Integration ID identifica la conexión CRM de una empresa, es un UUID aleatorio y debe tratarse siempre como texto. Envíelo en la cabecera \`X-Zinto-Integration-Id\`; no se coloca en la URL ni se inventa a partir del ejemplo de esta guía. En el portal SmartBC, use un campo de texto (nunca \`type=number\`, \`Number()\` ni un selector numérico) para conservar todos los caracteres y guiones.

1. En Zinto, abra **Configuración → Acceso API → Integraciones CRM**.
2. Pulse **Crear integración**, indique el nombre y proveedor, configure el webhook HTTPS y seleccione los permisos mínimos.
3. Active la integración cuando la URL y el receptor del webhook estén listos.
4. Copie el identificador UUID aleatorio mostrado como **Integration ID**. En la tarjeta de la integración pulse **Ver secreto** para consultarlo; **Regenerar secreto** invalida el anterior y muestra uno nuevo. Guárdelo en un gestor de secretos.
5. Cree o asocie una API Key para esa empresa y sustituya \`TU_API_KEY\` e \`ID_DE_INTEGRACION\` en su integración.

El ID pertenece a la empresa autenticada. Un ID de otra empresa, un ID inactivo o un valor ficticio será rechazado; nunca envíe \`companyId\` para intentar cambiar el alcance. El secreto del webhook solo sirve para verificar firmas entrantes; no sustituye a la API Key.

### Si /capabilities devuelve 403

\`GET /capabilities\` solo requiere \`Authorization: Bearer TU_API_KEY\` y el permiso \`integrations:manage\`; el encabezado \`X-Zinto-Integration-Id\` es opcional en esta ruta. Las API Keys se vinculan al tenant de la empresa, no a un Integration ID individual: Zinto valida el UUID en las rutas de recursos y comprueba el scope en la API Key. Si recibe \`INSUFFICIENT_PERMISSIONS\`, edite la clave en **Configuración → Acceso API**, añada \`integrations:manage\` y repita la prueba sin activar v2.

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
| POST | /messages | messages:send (+ media:upload si incluye \`media\`) |
| POST | /media/upload | media:upload |
| GET | /media | media:read |
| POST | /campaigns/batch | campaigns:write |
| PUT | /appointments/{externalId} | appointments:write |
| POST | /deals | deals:write |
| POST | /sync-jobs | integrations:manage |

El payload de \`PUT /contacts/{externalId}\` admite \`name\`, \`phone\`, \`email\`, \`company\`, \`tags\` (arreglo de strings) y \`notes\` (texto libre). No existen los scopes \`notes:*\` ni \`tags:write\` de v1: ambos campos se escriben con el permiso \`contacts:write\` y se devuelven junto al resto de datos del contacto cuando se consulta con \`contacts:read\`.

## Ejemplo: enviar desde el CRM

~~~bash
curl -X POST https://crm.zinto.app/api/v2/messages \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":1,"recipient":"+56912345678","text":"Hola desde el CRM","external_message_id":"crm-msg-8841"}'
~~~

## Media: enviar y recibir imagen, vídeo, audio o documento

Envío: si el archivo aún no tiene una URL http(s) pública, súbalo primero con \`POST /media/upload\` (\`multipart/form-data\`, campo \`file\`, máx. 10 MB; requiere \`media:upload\`) y use la \`url\` devuelta en \`POST /messages\` dentro de \`media\`. \`text\` es opcional junto con \`media\` y se usa como caption.

~~~bash
curl -X POST https://crm.zinto.app/api/v2/media/upload \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -F "file=@foto-propiedad.jpg"
# {"data":{"url":"https://crm.zinto.app/media/image/abc123.jpg","type":"image","filename":"foto-propiedad.jpg","size":48213,"mimeType":"image/jpeg"}}

curl -X POST https://crm.zinto.app/api/v2/messages \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":1,"recipient":"+56912345678","text":"¿Le interesa esta propiedad?","media":{"url":"https://crm.zinto.app/media/image/abc123.jpg","type":"image"},"external_message_id":"crm-msg-8842"}'
~~~

Recepción: cuando el cliente envía una foto/vídeo/audio/documento por WhatsApp, el evento \`message.received\` incluye un campo \`data.media\` adicional (ver más abajo). Descargue el archivo con \`GET /media\` (requiere \`media:read\`), pasando el \`type\` y \`filename\` tal como llegan en \`data.media.url\` — solo la empresa dueña del mensaje puede leerlo.

~~~bash
curl "https://crm.zinto.app/api/v2/media?type=image&filename=xyz789.jpg" \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -o foto-recibida.jpg
~~~

## Webhooks y seguridad

Configure una URL HTTPS que responda en menos de 10 segundos. Verifique X-Zinto-Signature con HMAC-SHA256 sobre \`X-Zinto-Timestamp + "." + raw_request_body\`, compare en tiempo constante y rechace marcas de tiempo con más de cinco minutos. Deduplique por X-Zinto-Event-Id.

El campo \`data\` de los eventos \`message.*\` incluye \`conversation_id\`, \`channel_type\`, \`channel_id\`, \`channel_name\` (el nombre visible del canal, p. ej. "WhatsApp Chile"), \`channel_account_id\` (identificador de la cuenta/número en el proveedor) y \`contact\` (\`id\`, \`name\`, \`phone\`, \`email\`) — v2 no tiene un GET para resolver estos IDs por su cuenta, así que se entregan resueltos en cada evento.

Cuando el mensaje tiene un adjunto, \`data\` además trae \`media\`: \`{"url": "https://crm.zinto.app/api/v2/media?type=image&filename=xyz789.jpg", "type": "image", "mime_type": "image/jpeg"}\`. \`media.type\` coincide con el \`type\` general del mensaje (\`image\`/\`video\`/\`audio\`/\`document\`); no hay un campo de caption aparte — si el cliente escribió uno, viaja en \`content\` (con fallback al nombre del archivo en documentos, o a un texto fijo en audio, que WhatsApp no permite subtitular). \`media\` se omite por completo en mensajes de solo texto.

Zinto entrega al menos una vez; responda 2xx después de persistir el evento y use una cola para trabajo lento. Respete 429 y Retry-After con espera exponencial.

## Errores

~~~json
{"error":"INSUFFICIENT_PERMISSIONS","message":"Missing messages:send"}
~~~

Los códigos habituales son API_KEY_MISSING, API_KEY_INVALID, INSUFFICIENT_SCOPE, VALIDATION_ERROR, IDEMPOTENCY_CONFLICT, RATE_LIMITED e INTERNAL_ERROR. Para soporte entregue request_id o event_id, nunca claves ni secretos.

## Descargas

- OpenAPI: GET /api/v2/openapi.json
- Postman: GET /api/v2/postman.json
- Esta guía: GET /api/v2/guide.md
`;
