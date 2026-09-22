type PostmanRequest = {
  method: string;
  header?: Array<{ key: string; value: string; type: 'text' }>;
  body?:
    | { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } }
    | { mode: 'formdata'; formdata: Array<{ key: string; type: 'file' | 'text'; src?: string; value?: string }> };
  url: { raw: string; host: string[]; path: string[]; query?: Array<{ key: string; value: string }> };
  description?: string;
};

type PostmanItem = { name: string; request: PostmanRequest };

const jsonBody = (body: unknown) => ({
  mode: 'raw' as const,
  raw: JSON.stringify(body, null, 2),
  options: { raw: { language: 'json' as const } },
});

const url = (path: string) => ({
  raw: `{{baseUrl}}/api/v2${path}`,
  host: ['{{baseUrl}}'],
  path: ['api', 'v2', ...path.split('/').filter(Boolean)],
});

const queryUrl = (path: string, query: Record<string, string>) => ({
  ...url(path),
  raw: `{{baseUrl}}/api/v2${path}?${new URLSearchParams(query).toString()}`,
  query: Object.entries(query).map(([key, value]) => ({ key, value })),
});

const authenticatedHeaders = (integration = true) => [
  { key: 'Authorization', value: 'Bearer {{apiKey}}', type: 'text' as const },
  ...(integration ? [{ key: 'X-Zinto-Integration-Id', value: '{{integrationId}}', type: 'text' as const }] : []),
  { key: 'Content-Type', value: 'application/json', type: 'text' as const },
];

const item = (
  name: string,
  method: string,
  path: string,
  options: Pick<PostmanRequest, 'body' | 'description'> = {},
): PostmanItem => ({
  name,
  request: {
    method,
    header: authenticatedHeaders(method !== 'GET'),
    url: url(path),
    ...options,
  },
});

export function getApiV2PostmanCollection() {
  return {
    info: {
      _postman_id: '0c8324db-5703-49a0-825c-d3ad14d9b53f',
      name: 'Zinto CRM Integration API v2',
      description: 'Colección oficial para integrar contactos, mensajes, agenda, pipeline, campañas y sincronización bidireccional con Zinto. Antes de enviar peticiones protegidas, un administrador debe crear la integración en Configuración → Acceso API → Integraciones CRM y reemplazar apiKey e integrationId por valores reales. El identificador UUID de ejemplo no es válido.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'https://crm.zinto.app', type: 'string' },
      { key: 'apiKey', value: 'REEMPLAZAR_CON_SU_CLAVE_API', type: 'string' },
      { key: 'integrationId', value: 'REEMPLAZAR_CON_ID_DE_INTEGRACION', type: 'string' },
      { key: 'externalContactId', value: 'crm-contact-123', type: 'string' },
      { key: 'externalAppointmentId', value: 'crm-appointment-123', type: 'string' },
    ],
    item: [
      {
        name: 'Disponibilidad',
        item: [{ name: 'Comprobar salud', request: { method: 'GET', header: [], url: url('/health'), description: 'No requiere autenticación.' } }],
      },
      {
        name: 'Administración de integración',
        item: [
          item('Consultar capacidades y permisos', 'GET', '/capabilities', { description: 'Requiere integrations:manage.' }),
          item('Consultar configuración del webhook', 'GET', '/webhook', { description: 'Requiere webhooks:manage. Nunca devuelve el secreto en sí, solo si hay uno configurado.' }),
          item('Configurar URL del webhook', 'PATCH', '/webhook', {
            body: jsonBody({ url: 'https://smartbc.example.com/webhooks/zinto' }),
            description: 'Requiere webhooks:manage. El secreto solo se devuelve cuando se genera uno nuevo (primera vez que se configura url, o rotateSecret: true) — guárdelo entonces.',
          }),
          item('Rotar el secreto del webhook', 'PATCH', '/webhook', {
            body: jsonBody({ rotateSecret: true }),
            description: 'Requiere webhooks:manage. Invalida el secreto anterior.',
          }),
        ],
      },
      {
        name: 'Contactos',
        item: [item('Crear o actualizar contacto', 'PUT', '/contacts/{{externalContactId}}', {
          body: jsonBody({ name: 'Ada Lovelace', phone: '+15551234567', email: 'ada@example.com', company: 'Analytical Engines', tags: ['vip'], customFields: { crm_tier: 'gold' } }),
          description: 'Requiere contacts:write. Idempotente por externalContactId.',
        })],
      },
      {
        name: 'Mensajes',
        item: [
          item('Enviar mensaje desde CRM', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', text: 'Hola desde mi CRM', external_message_id: 'crm-msg-8841' }),
            description: 'Requiere messages:send. Zinto devuelve 202 y entrega estados por webhook.',
          }),
          item('Enviar plantilla de WhatsApp', 'POST', '/messages', {
            body: jsonBody({
              channelId: 1,
              recipient: '+56912345678',
              template: {
                name: 'appointment_reminder',
                language: 'es',
                components: [{ type: 'body', parameters: [{ type: 'text', text: 'mañana 10:00' }] }],
              },
              external_message_id: 'crm-msg-8843',
            }),
            description: 'Requiere messages:send (mismo permiso, sin scope adicional). Use template en vez de media (son mutuamente excluyentes) para contactar a un destinatario fuera de la ventana de 24 horas, donde WhatsApp exige una plantilla ya aprobada.',
          }),
          item('Reaccionar a un mensaje', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', reaction: { messageId: 98765, emoji: '👍' } }),
            description: 'Requiere messages:send. Solo canales WhatsApp Official. messageId es el data.id de un mensaje propio de esta empresa. emoji vacío ("") quita una reacción ya enviada.',
          }),
          item('Enviar ubicación', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', location: { latitude: -33.45, longitude: -70.66, name: 'Oficina central' } }),
            description: 'Requiere messages:send. Solo canales WhatsApp Official.',
          }),
          item('Responder citando un mensaje', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', text: 'Sí, mañana a las 10', context: { messageId: 98765 } }),
            description: 'Requiere messages:send. Solo admitido junto con text (no con media/template/reaction/location/interactive) y solo en canales WhatsApp Official. messageId es el data.id del mensaje propio que se cita.',
          }),
          item('Enviar botones interactivos', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', interactive: { type: 'button', body: '¿Confirmamos la cita?', buttons: [{ id: 'yes', title: 'Sí' }, { id: 'no', title: 'No' }] } }),
            description: 'Requiere messages:send. Solo canales WhatsApp Official. buttons: 1 a 3 elementos.',
          }),
          item('Enviar lista interactiva', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', interactive: { type: 'list', body: 'Elija un plan', list: { button: 'Ver planes', sections: [{ title: 'Planes', rows: [{ id: 'basic', title: 'Básico' }, { id: 'pro', title: 'Pro', description: 'Hasta 10 usuarios' }] }] } } }),
            description: 'Requiere messages:send. Solo canales WhatsApp Official.',
          }),
          {
            name: 'Marcar mensaje como leído',
            request: {
              method: 'POST',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: url('/messages/{messageId}/read'),
              description: 'Requiere messages:send. Reemplace {messageId} por el data.id de un mensaje recibido (no enviado) de esta empresa. Solo canales WhatsApp Official.',
            },
          },
        ],
      },
      {
        name: 'Media',
        item: [
          {
            name: 'Subir archivo',
            request: {
              method: 'POST',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: url('/media/upload'),
              body: { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: '' }] },
              description: 'Requiere media:upload. multipart/form-data, campo file (máx. 10 MB). Devuelve una url para usar como media.url en POST /messages.',
            },
          },
          item('Enviar mensaje con media', 'POST', '/messages', {
            body: jsonBody({ channelId: 1, recipient: '+56912345678', text: 'Esta es la propiedad que consultó', media: { url: 'https://crm.zinto.app/media/image/abc123.jpg', type: 'image' }, external_message_id: 'crm-msg-8842' }),
            description: 'Requiere messages:send y media:upload. text es opcional junto con media y se usa como caption.',
          }),
          {
            name: 'Descargar archivo recibido',
            request: {
              method: 'GET',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: queryUrl('/media', { type: 'image', filename: 'xyz789.jpg' }),
              description: 'Requiere media:read. type y filename llegan resueltos en data.media.url del evento message.received.',
            },
          },
        ],
      },
      {
        name: 'Lectura',
        item: [
          {
            name: 'Listar canales',
            request: {
              method: 'GET',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: url('/channels'),
              description: 'Requiere channels:read. Útil para descubrir el channelId usado en POST /messages y en el filtro channelId de GET /conversations.',
            },
          },
          {
            name: 'Listar conversaciones',
            request: {
              method: 'GET',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: queryUrl('/conversations', { channelId: '42', status: 'open', isGroup: 'false', page: '1', limit: '20' }),
              description: 'Requiere conversations:read. channelId, status, isGroup, page y limit son opcionales (limit por defecto 20, máximo 100).',
            },
          },
          {
            name: 'Consultar estado de un mensaje',
            request: {
              method: 'GET',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: url('/messages/{messageId}/status'),
              description: 'Requiere messages:read. Reemplace {messageId} por el data.id devuelto por POST /messages. Devuelve 404 NOT_FOUND si el mensaje no existe o pertenece a otra empresa.',
            },
          },
        ],
      },
      {
        name: 'Plantillas',
        item: [
          item('Listar plantillas', 'GET', '/templates', { description: 'Requiere templates:read.' }),
          item('Consultar una plantilla', 'GET', '/templates/{templateId}', { description: 'Requiere templates:read. Reemplace {templateId} por el data.id devuelto al crear o listar. Devuelve 404 NOT_FOUND si la plantilla no existe o pertenece a otra empresa.' }),
          {
            name: 'Crear plantilla',
            request: {
              method: 'POST',
              header: [...authenticatedHeaders(true), { key: 'Idempotency-Key', value: 'crm-template-welcome-v1', type: 'text' }],
              url: url('/templates'),
              body: jsonBody({ name: 'appointment_reminder', content: 'Su cita es mañana a las {{1}}', connectionId: 42, whatsappTemplateCategory: 'utility', whatsappTemplateLanguage: 'es', variables: [{}] }),
              description: 'Requiere templates:write e Idempotency-Key. connectionId debe ser un canal WhatsApp Official de la empresa (ver GET /channels). Somete la plantilla a aprobación de Meta; el estado inicial suele ser pending.',
            },
          },
          item('Actualizar plantilla', 'PATCH', '/templates/{templateId}', {
            body: jsonBody({ isActive: false }),
            description: 'Requiere templates:write. Solo admite description e isActive.',
          }),
          {
            name: 'Eliminar plantilla',
            request: {
              method: 'DELETE',
              header: authenticatedHeaders(true).filter((header) => header.key !== 'Content-Type'),
              url: url('/templates/{templateId}'),
              description: 'Requiere templates:write. Elimina la plantilla de Zinto (no de Meta).',
            },
          },
        ],
      },
      {
        name: 'Campañas',
        item: [item('Sincronizar lote de campañas', 'POST', '/campaigns/batch', {
          body: jsonBody({ campaigns: [{ externalId: 'campaign-123', name: 'Campaña bienvenida', status: 'active' }] }),
          description: 'Requiere campaigns:write. Máximo 100 campañas por lote.',
        })],
      },
      {
        name: 'Agenda',
        item: [item('Crear o actualizar cita', 'PUT', '/appointments/{{externalAppointmentId}}', {
          body: jsonBody({ title: 'Consulta inicial', startsAt: '2026-10-01T14:00:00Z', endsAt: '2026-10-01T14:30:00Z', contactExternalId: '{{externalContactId}}' }),
          description: 'Requiere appointments:write e Idempotency-Key.',
        })],
      },
      {
        name: 'Pipeline',
        item: [item('Crear o actualizar oportunidad', 'POST', '/deals', {
          body: jsonBody({ externalId: 'deal-123', name: 'Oportunidad demo', stage: 'qualified', amount: 1000, contactExternalId: '{{externalContactId}}' }),
          description: 'Requiere deals:write e Idempotency-Key.',
        })],
      },
      {
        name: 'Sincronización inicial',
        item: [item('Planificar sincronización inicial', 'POST', '/sync-jobs', {
          body: jsonBody({ resources: ['contacts', 'appointments', 'deals', 'campaigns'], mode: 'dry_run' }),
          description: 'Requiere integrations:manage e Idempotency-Key. Use dry_run antes de importar producción.',
        })],
      },
    ],
  };
}
