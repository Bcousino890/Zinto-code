export function getApiV2OpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Zinto CRM Integration API',
      version: '2.0.0',
      description: 'Bidirectional CRM integration and signed webhook platform.',
    },
    servers: [{ url: 'https://crm.zinto.app/api/v2' }],
    paths: {
      '/health': {
        get: {
          summary: 'Check API availability',
          responses: { '200': { description: 'API is available' } },
        },
      },
      '/capabilities': {
        get: {
          summary: 'List API v2 permissions and webhook contract',
          security: [{ bearerAuth: [] }],
          responses: {
            '200': { description: 'Capabilities for an integration administrator' },
            '403': { description: 'Missing integrations:manage permission' },
          },
        },
      },
      '/contacts/{externalId}': {
        put: {
          summary: 'Create or update a CRM contact',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'externalId', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'X-Zinto-Integration-Id', in: 'header', required: true, schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            '200': { description: 'Contact updated' },
            '201': { description: 'Contact created' },
            '400': { description: 'Invalid contact or integration context' },
            '403': { description: 'Missing contacts:write permission' },
          },
        },
      },
      '/messages': {
        post: {
          summary: 'Send a CRM-originated text message',
          security: [{ bearerAuth: [] }],
          parameters: [
            { name: 'X-Zinto-Integration-Id', in: 'header', required: true, schema: { type: 'integer', minimum: 1 } },
          ],
          responses: {
            '202': { description: 'Message accepted for delivery' },
            '400': { description: 'Invalid message or integration context' },
            '403': { description: 'Missing messages:send permission' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}
