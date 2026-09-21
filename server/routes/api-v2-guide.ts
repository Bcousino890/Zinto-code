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
3. Zinto envía al webhook del CRM los eventos message.sent, message.delivered, message.read o message.failed. message.read depende de que el destinatario tenga activados los recibos de lectura en WhatsApp: si los desactivó, ese mensaje nunca disparará message.read aunque message.delivered sí llegue con normalidad.
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
| POST | /messages | messages:send (+ media:upload si incluye \`media\`; \`template\` no requiere permiso adicional) |
| POST | /media/upload | media:upload |
| GET | /media | media:read |
| GET | /channels | channels:read |
| GET | /conversations | conversations:read |
| GET | /messages/{messageId}/status | messages:read |
| GET | /templates | templates:read |
| GET | /templates/{templateId} | templates:read |
| POST | /templates | templates:write |
| PATCH | /templates/{templateId} | templates:write |
| DELETE | /templates/{templateId} | templates:write |
| POST | /campaigns/batch | campaigns:write |
| PUT | /appointments/{externalId} | appointments:write |
| POST | /deals | deals:write |
| POST | /sync-jobs | integrations:manage |

El payload de \`PUT /contacts/{externalId}\` admite \`name\`, \`phone\`, \`email\`, \`company\`, \`tags\` (arreglo de strings) y \`notes\` (texto libre). No existen los scopes \`notes:*\` ni \`tags:write\` de v1: ambos campos se escriben con el permiso \`contacts:write\` y se devuelven junto al resto de datos del contacto cuando se consulta con \`contacts:read\`.

La respuesta de \`PUT /contacts/{externalId}\` puede incluir además \`avatarUrl\` (URL absoluta) con la foto de perfil de WhatsApp del contacto: es un campo de solo salida — nunca se envía en el payload de entrada — y se omite cuando Zinto no dispone de la foto. Es un dato best-effort: solo se completa para contactos del canal WhatsApp no oficial (QR), se obtiene una única vez al crear el contacto y solo si WhatsApp la entregó en ese momento (muchos usuarios tienen la foto oculta por privacidad); no se actualiza si el contacto cambia su foto después. En el canal oficial de WhatsApp Cloud API nunca está presente.

## Ejemplo: enviar desde el CRM

\`channelId\` identifica un canal de mensajería ya configurado en la empresa; use \`GET /channels\` (ver la sección Lectura más abajo) para listarlos y descubrir su \`id\`.

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

## Enviar una plantilla de WhatsApp

Fuera de la ventana de 24 horas desde el último mensaje del cliente, WhatsApp exige una plantilla pre-aprobada; el texto y la media libres se rechazan en ese caso. Use \`template\` en vez de \`media\` en \`POST /messages\` (son mutuamente excluyentes, nunca ambos a la vez); no se necesita ningún permiso adicional, sigue bastando \`messages:send\`. Esta ruta envía una plantilla ya aprobada en Zinto — no crea ni somete plantillas a aprobación.

~~~bash
curl -X POST https://crm.zinto.app/api/v2/messages \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":1,"recipient":"+56912345678","template":{"name":"appointment_reminder","language":"es","components":[{"type":"body","parameters":[{"type":"text","text":"mañana 10:00"}]}]},"external_message_id":"crm-msg-8843"}'
~~~

\`template.name\` y \`template.language\` son obligatorios; \`template.components\` es opcional y se omite por completo si la plantilla no tiene variables. Cada componente es \`{type: 'header'|'body'|'button', parameters: [...]}\`, donde cada parámetro es una cadena simple o \`{type: 'text', text: string}\`.

## Plantillas de WhatsApp: crear, listar y administrar

Esta sección crea y administra las plantillas en sí (someterlas a aprobación de Meta). Para **enviar** una plantilla ya aprobada, use \`POST /messages\` con \`template\` (ver la sección anterior) — esa ruta no requiere \`templates:*\`.

\`GET /templates\` (requiere \`templates:read\`) lista las plantillas de la empresa. \`GET /templates/{templateId}\` (mismo permiso) devuelve una sola.

\`POST /templates\` (requiere \`templates:write\` e \`Idempotency-Key\`) crea una plantilla y la somete a Meta para aprobación — la clave de idempotencia evita someter dos veces la misma plantilla si su cliente reintenta la petición (p. ej. por timeout). \`connectionId\` debe ser un canal WhatsApp Official de la empresa (use \`GET /channels\` para listarlos); \`name\` solo admite minúsculas, números y guion bajo. El estado inicial suele ser \`pending\` — consulte \`GET /templates/{templateId}\` más tarde para ver si Meta la aprobó o rechazó.

~~~bash
curl -X POST https://crm.zinto.app/api/v2/templates \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION" \\
  -H "Idempotency-Key: crm-template-welcome-v1" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"appointment_reminder","content":"Su cita es mañana a las {{1}}","connectionId":42,"whatsappTemplateCategory":"utility","whatsappTemplateLanguage":"es","variables":[{}]}'
# {"data":{"id":501,"name":"appointment_reminder","whatsappTemplateStatus":"pending", ...}}
~~~

\`PATCH /templates/{templateId}\` (requiere \`templates:write\`) solo permite editar \`description\` e \`isActive\` — el contenido ya sometido a Meta no se puede modificar; elimine la plantilla y cree una nueva si necesita cambiar el texto. \`DELETE /templates/{templateId}\` (mismo permiso) la elimina de Zinto (no de Meta). Ambas devuelven \`404 {"error":"NOT_FOUND", ...}\` si la plantilla no existe o pertenece a otra empresa.

## Lectura: canales, conversaciones y estado de mensajes

v2 expone tres rutas de solo lectura, todas limitadas a la empresa de la API Key.

\`GET /channels\` (requiere \`channels:read\`) lista los canales de mensajería de la empresa; es la forma de descubrir el \`channelId\` que se usa en \`POST /messages\` y en el filtro de \`GET /conversations\`.

~~~bash
curl https://crm.zinto.app/api/v2/channels \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION"
# {"data":[{"id":42,"name":"WhatsApp Ventas","type":"whatsapp_official","status":"active","phoneNumber":"+56912345678","displayName":"Ventas"}]}
~~~

\`GET /conversations\` (requiere \`conversations:read\`) admite los filtros opcionales \`channelId\`, \`status\` e \`isGroup\` (\`true\`/\`false\`), y paginación \`page\`/\`limit\` (por defecto 20, máximo 100).

~~~bash
curl "https://crm.zinto.app/api/v2/conversations?channelId=42&status=open&limit=20" \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION"
# {"data":[{"id":501,"contactId":123,"channelId":42,"channelType":"whatsapp_official","status":"open","isGroup":false,"lastMessageAt":"2026-09-10T14:00:00Z","createdAt":"2026-08-01T10:00:00Z"}],"total":1}
~~~

\`GET /messages/{messageId}/status\` (requiere \`messages:read\`) — \`messageId\` es el \`data.id\` devuelto por \`POST /messages\`.

~~~bash
curl https://crm.zinto.app/api/v2/messages/98765/status \\
  -H "Authorization: Bearer TU_API_KEY" \\
  -H "X-Zinto-Integration-Id: ID_DE_INTEGRACION"
# {"data":{"status":"delivered","timestamp":"2026-09-10T14:00:05Z"}}
~~~

Devuelve \`404 {"error":"NOT_FOUND", ...}\` si el mensaje no existe o pertenece a otra empresa (misma respuesta en ambos casos, sin distinguirlos).

## Webhooks y seguridad

Configure una URL HTTPS que responda en menos de 10 segundos. Verifique X-Zinto-Signature con HMAC-SHA256 sobre \`X-Zinto-Timestamp + "." + raw_request_body\`, compare en tiempo constante y rechace marcas de tiempo con más de cinco minutos. Deduplique por X-Zinto-Event-Id.

El campo \`data\` de los eventos \`message.*\` incluye \`conversation_id\`, \`channel_type\`, \`channel_id\`, \`channel_name\` (el nombre visible del canal, p. ej. "WhatsApp Chile"), \`channel_account_id\` (identificador de la cuenta/número en el proveedor) y \`contact\` (\`id\`, \`name\`, \`phone\`, \`email\`) — v2 no tiene un GET para resolver estos IDs por su cuenta, así que se entregan resueltos en cada evento.

Cuando el mensaje tiene un adjunto, \`data\` además trae \`media\`: \`{"url": "https://crm.zinto.app/api/v2/media?type=image&filename=xyz789.jpg", "type": "image", "mime_type": "image/jpeg"}\`. \`media.type\` coincide con el \`type\` general del mensaje (\`image\`/\`video\`/\`audio\`/\`document\`); no hay un campo de caption aparte — si el cliente escribió uno, viaja en \`content\` (con fallback al nombre del archivo en documentos, o a un texto fijo en audio, que WhatsApp no permite subtitular). \`media\` se omite por completo en mensajes de solo texto.

El objeto \`contact\` de estos mismos eventos puede incluir además \`avatar_url\` (URL absoluta) con la foto de perfil de WhatsApp, descargable con el mismo mecanismo de \`GET /media\` que los adjuntos de mensajes (\`type=profile_pictures\`). Es un dato best-effort: solo se completa para contactos del canal WhatsApp no oficial (QR), se obtiene una única vez al crear el contacto y solo si WhatsApp la entregó en ese momento; no se actualiza si el contacto cambia su foto después, y nunca está presente en el canal oficial de WhatsApp Cloud API. \`avatar_url\` se omite por completo cuando Zinto no tiene la foto.

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
