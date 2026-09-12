type PostmanRequest = {
  method: string;
  header?: Array<{ key: string; value: string; type: 'text' }>;
  body?: { mode: 'raw'; raw: string; options: { raw: { language: 'json' } } };
  url: { raw: string; host: string[]; path: string[] };
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
      description: 'Colección oficial para integrar contactos, mensajes, agenda, pipeline, campañas y sincronización bidireccional con Zinto.',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: 'https://crm.zinto.app', type: 'string' },
      { key: 'apiKey', value: 'REEMPLAZAR_CON_SU_CLAVE_API', type: 'string' },
      { key: 'integrationId', value: '1', type: 'string' },
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
        item: [item('Consultar capacidades y permisos', 'GET', '/capabilities', { description: 'Requiere integrations:manage.' })],
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
        item: [item('Enviar mensaje desde CRM', 'POST', '/messages', {
          body: jsonBody({ channelId: 1, recipient: '+56912345678', text: 'Hola desde mi CRM', external_message_id: 'crm-msg-8841' }),
          description: 'Requiere messages:send. Zinto devuelve 202 y entrega estados por webhook.',
        })],
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
