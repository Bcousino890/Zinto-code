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
    tags: [{ name: 'Disponibilidad' }, { name: 'Administración' }, { name: 'Contactos' }, { name: 'Mensajes' }, { name: 'Campañas' }, { name: 'Agenda' }, { name: 'Pipeline' }, { name: 'Sincronización' }],
    paths: {
      '/health': { get: { tags: ['Disponibilidad'], summary: 'Comprobar disponibilidad', responses: { '200': { description: 'API disponible', content: json({ $ref: '#/components/schemas/Health' }) } } } },
      '/openapi.json': { get: { tags: ['Disponibilidad'], summary: 'Descargar contrato OpenAPI', responses: { '200': { description: 'Documento OpenAPI JSON' } } } },
      '/postman.json': { get: { tags: ['Disponibilidad'], summary: 'Descargar colección Postman', responses: { '200': { description: 'Colección Postman JSON' } } } },
      '/guide.md': { get: { tags: ['Disponibilidad'], summary: 'Descargar guía Markdown', responses: { '200': { description: 'Guía completa en Markdown' } } } },
      '/capabilities': { get: { tags: ['Administración'], summary: 'Consultar permisos y eventos', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Capacidades de la integración' }, ...errorResponses } } },
      '/contacts/{externalId}': { put: { tags: ['Contactos'], summary: 'Crear o actualizar contacto', security: [{ bearerAuth: [] }], parameters: [{ name: 'externalId', in: 'path', required: true, schema: { type: 'string' } }, integrationHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/ContactInput' }) }, responses: { '200': { description: 'Contacto actualizado' }, '201': { description: 'Contacto creado' }, ...errorResponses } } },
      '/messages': { post: { tags: ['Mensajes'], summary: 'Enviar mensaje desde el CRM', security: [{ bearerAuth: [] }], parameters: [integrationHeader, idempotencyHeader], requestBody: { required: true, content: json({ $ref: '#/components/schemas/MessageInput' }) }, responses: { '202': { description: 'Mensaje aceptado para entrega' }, ...errorResponses } } },
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
        MessageInput: { type: 'object', required: ['channelId', 'recipient', 'text'], properties: { channelId: { type: 'integer', minimum: 1 }, recipient: { type: 'string' }, text: { type: 'string', maxLength: 4096 }, external_message_id: { type: 'string' } } },
        CampaignBatchInput: { type: 'object', required: ['campaigns'], properties: { campaigns: { type: 'array', maxItems: 100, items: { type: 'object', additionalProperties: true } } } },
        AppointmentInput: { type: 'object', required: ['title', 'startsAt', 'endsAt'], properties: { title: { type: 'string' }, startsAt: { type: 'string', format: 'date-time' }, endsAt: { type: 'string', format: 'date-time' }, contactExternalId: { type: 'string' } } },
        DealInput: { type: 'object', required: ['externalId', 'name', 'stage'], properties: { externalId: { type: 'string' }, name: { type: 'string' }, stage: { type: 'string' }, amount: { type: 'number' }, contactExternalId: { type: 'string' } } },
        SyncJobInput: { type: 'object', required: ['resources'], properties: { resources: { type: 'array', items: { type: 'string', enum: ['contacts', 'appointments', 'deals', 'campaigns'] } }, mode: { type: 'string', enum: ['dry_run', 'apply'], default: 'dry_run' } } },
        Error: { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' }, request_id: { type: 'string' } } } } },
      },
    },
  };
}
