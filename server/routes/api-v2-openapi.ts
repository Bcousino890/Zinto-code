const json = (schema: Record<string, unknown>) => ({ 'application/json': { schema } });

const errorResponses = {
  '400': { description: 'Solicitud inválida', content: json({ $ref: '#/components/schemas/Error' }) },
  '401': { description: 'Clave API ausente o inválida', content: json({ $ref: '#/components/schemas/Error' }) },
  '403': { description: 'Permiso insuficiente', content: json({ $ref: '#/components/schemas/Error' }) },
  '429': { description: 'Límite de frecuencia excedido', content: json({ $ref: '#/components/schemas/Error' }) },
};

const integrationHeader = { name: 'X-Zinto-Integration-Id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Identificador público aleatorio de la integración CRM creada en Zinto.' };
const idempotencyHeader = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128 }, description: 'Clave única para reintentos seguros durante 24 horas.' };

export function getApiV2OpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Zinto CRM — API bidireccional',
      version: '2.0.0',
      description: 'Contrato oficial para sincronizar contactos, conversaciones, mensajes, agenda, pipeline y campañas entre un CRM y Zinto. Antes de realizar peticiones protegidas, un administrador debe crear una integración CRM en Configuración → Acceso API → Integraciones CRM, copiar su Integration ID y asociar una API Key con los permisos mínimos necesarios.',
    },
    servers: [{ url: 'https://crm.zinto.app/api/v2', description: 'Producción' }, { url: 'https://sandbox.crm.zinto.app/api/v2', description: 'Sandbox (si está habilitado)' }],
    tags: [{ name: 'Disponibilidad' }, { name: 'Administración' }, { name: 'Contactos' }, { name: 'Mensajes' }, { name: 'Media' }, { name: 'Campañas' }, { name: 'Agenda' }, { name: 'Pipeline' }, { name: 'Sincronización' }],
    paths: {
      '/health': { get: { tags: ['Disponibilidad'], summary: 'Comprobar disponibilidad', responses: { '200': { description: 'API disponible', content: json({ $ref: '#/components/schemas/Health' }) } } } },
      '/openapi.json': { get: { tags: ['Disponibilidad'], summary: 'Descargar contrato OpenAPI', responses: { '200': { description: 'Documento OpenAPI JSON' } } } },
      '/postman.json': { get: { tags: ['Disponibilidad'], summary: 'Descargar colección Postman', responses: { '200': { description: 'Colección Postman JSON' } } } },
      '/guide.md': { get: { tags: ['Disponibilidad'], summary: 'Descargar guía Markdown', responses: { '200': { description: 'Guía completa en Markdown' } } } },
      '/capabilities': { get: { tags: ['Administración'], summary: 'Consultar permisos y eventos', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Capacidades de la integración' }, ...errorResponses } } },
      '/contacts/{externalId}': { put: { tags: ['Contactos'], summary: 'Crear o actualizar contacto', security: [{ bearerAuth: [] }], parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }, integrationHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/ContactInput' }) }, responses: { '200': { description: 'Contacto actualizado (la respuesta puede incluir avatarUrl si Zinto tiene la foto de perfil de WhatsApp del contacto)' }, '201': { description: 'Contacto creado (la respuesta puede incluir avatarUrl si Zinto tiene la foto de perfil de WhatsApp del contacto)' }, ...errorResponses } } },
      '/messages': { post: { tags: ['Mensajes'], summary: 'Enviar mensaje (texto y/o media) desde el CRM', description: 'Requiere `messages:send`. Si se incluye `media`, además requiere `media:upload`. Debe enviarse `text`, `media`, o ambos (media con `text` usa `text` como caption).', security: [{ bearerAuth: [] }], parameters: [integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/MessageInput' }) }, responses: { '202': { description: 'Mensaje aceptado para entrega' }, ...errorResponses } } },
      '/media/upload': { post: { tags: ['Media'], summary: 'Subir un archivo y obtener su URL', description: 'Requiere `media:upload`. multipart/form-data con el campo `file` (imagen, vídeo, audio o documento; máx. 10&nbsp;MB). Use la `url` devuelta en `POST /messages` (`media.url`) para enviarla por WhatsApp.', security: [{ bearerAuth: [] }], parameters: [integrationHeader], requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { '201': { description: 'Archivo subido', content: json({ $ref: '#/components/schemas/MediaUploadOutput' }) }, ...errorResponses } } },
      '/media': { get: { tags: ['Media'], summary: 'Descargar un archivo multimedia recibido o una foto de perfil', description: 'Requiere `media:read`. `type` y `filename` llegan ya resueltos en `data.media.url` de `message.received` o en `avatarUrl`/`data.contact.avatar_url`; solo es accesible para la empresa dueña del mensaje o contacto.', security: [{ bearerAuth: [] }], parameters: [{ name: 'type', in: 'query', required: true, schema: { type: 'string', enum: ['image', 'video', 'audio', 'document', 'profile_pictures'] } }, { name: 'filename', in: 'query', required: true, schema: { type: 'string' } }, integrationHeader], responses: { '200': { description: 'Contenido binario del archivo' }, ...errorResponses, '404': { description: 'Archivo inexistente o de otra empresa', content: json({ $ref: '#/components/schemas/Error' }) } } } },
      '/campaigns/batch': { post: { tags: ['Campañas'], summary: 'Sincronizar lote de campañas', security: [{ bearerAuth: [] }], parameters: [integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/CampaignBatchInput' }) }, responses: { '202': { description: 'Lote aceptado' }, ...errorResponses } } },
      '/appointments/{externalId}': { put: { tags: ['Agenda'], summary: 'Crear o actualizar cita', security: [{ bearerAuth: [] }], parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }, integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/AppointmentInput' }) }, responses: { '200': { description: 'Cita actualizada' }, '201': { description: 'Cita creada' }, ...errorResponses } } },
      '/deals': { post: { tags: ['Pipeline'], summary: 'Crear o actualizar oportunidad', security: [{ bearerAuth: [] }], parameters: [integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/DealInput' }) }, responses: { '200': { description: 'Oportunidad actualizada' }, '201': { description: 'Oportunidad creada' }, ...errorResponses } } },
      '/sync-jobs': { post: { tags: ['Sincronización'], summary: 'Planificar sincronización inicial', security: [{ bearerAuth: [] }], parameters: [integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/SyncJobInput' }) }, responses: { '202': { description: 'Plan de sincronización creado' }, ...errorResponses } } },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'API key', description: 'Use Authorization: Bearer TU_API_KEY. Nunca envíe la clave en la URL. En las operaciones de recursos incluya también X-Zinto-Integration-Id con el Integration ID UUID que aparece en Configuración → Acceso API → Integraciones CRM.' } },
      schemas: {
        Health: { type: 'object', required: ['status', 'version'], properties: { status: { type: 'string', example: 'ok' }, version: { type: 'string', example: 'v2' } } },
        ContactInput: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, phone: { type: 'string' }, email: { type: 'string', format: 'email' }, company: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } }, customFields: { type: 'object', additionalProperties: true } } },
        MessageInput: { type: 'object', required: ['channelId', 'recipient'], description: 'Debe incluirse `text`, `media`, o ambos (con media, `text` se usa como caption).', properties: { channelId: { type: 'integer', minimum: 1 }, recipient: { type: 'string' }, text: { type: 'string', maxLength: 4096 }, media: { $ref: '#/components/schemas/MessageMediaInput' }, external_message_id: { type: 'string' } } },
        MessageMediaInput: { type: 'object', required: ['url', 'type'], description: 'Requiere el permiso media:upload además de messages:send.', properties: { url: { type: 'string', format: 'uri', description: 'URL http(s) pública del archivo — use la `url` devuelta por POST /media/upload si el archivo no está ya alojado.' }, type: { type: 'string', enum: ['image', 'video', 'audio', 'document'] }, filename: { type: 'string', description: 'Nombre visible del archivo; relevante sobre todo para document.' } } },
        MediaUploadOutput: { type: 'object', required: ['url', 'type', 'filename', 'size', 'mimeType'], properties: { url: { type: 'string', format: 'uri' }, type: { type: 'string', enum: ['image', 'video', 'audio', 'document'] }, filename: { type: 'string' }, size: { type: 'integer' }, mimeType: { type: 'string' } } },
        CampaignBatchInput: { type: 'object', required: ['campaigns'], properties: { campaigns: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: true } } } },
        AppointmentInput: { type: 'object', required: ['title', 'startsAt', 'endsAt'], properties: { title: { type: 'string' }, startsAt: { type: 'string', format: 'date-time' }, endsAt: { type: 'string', format: 'date-time' }, contactExternalId: { type: 'string' } } },
        DealInput: { type: 'object', required: ['externalId', 'name', 'stage'], properties: { externalId: { type: 'string' }, name: { type: 'string' }, stage: { type: 'string' }, amount: { type: 'number' }, contactExternalId: { type: 'string' } } },
        SyncJobInput: { type: 'object', required: ['resources'], properties: { resources: { type: 'array', items: { type: 'string', enum: ['contacts', 'appointments', 'deals', 'campaigns'] } }, mode: { type: 'string', enum: ['dry_run', 'apply'], default: 'dry_run' } } },
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' } } } } },
      },
    },
  };
}
