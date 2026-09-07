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
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' },
      },
    },
  };
}
