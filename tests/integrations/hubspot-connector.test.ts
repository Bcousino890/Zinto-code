import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHubSpotAuthorizationRequest,
  mapHubSpotInboundProperties,
  validateHubSpotIntegrationConfig,
} from '../../server/services/hubspot-connector';

test('builds an OAuth authorization request without accepting or exposing a credential', () => {
  const request = createHubSpotAuthorizationRequest({
    companyId: 12,
    integrationId: 3,
    clientId: 'hubspot-public-client-id',
    redirectUri: 'https://crm.zinto.app/api/v2/connectors/hubspot/callback',
    state: 'signed-opaque-state',
    scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write'],
  });

  assert.equal(request.provider, 'hubspot');
  assert.equal(request.companyId, 12);
  assert.equal(request.integrationId, 3);
  assert.match(request.url, /^https:\/\/app\.hubspot\.com\/oauth\/authorize\?/);
  assert.match(request.url, /state=signed-opaque-state/);
  assert.doesNotMatch(request.url, /access_token|client_secret/);
});

test('rejects an authorization callback configuration that could cross tenant scope', () => {
  assert.throws(
    () => createHubSpotAuthorizationRequest({
      companyId: 0,
      integrationId: 3,
      clientId: 'hubspot-public-client-id',
      redirectUri: 'https://crm.zinto.app/api/v2/connectors/hubspot/callback',
      state: 'signed-opaque-state',
      scopes: ['crm.objects.contacts.read'],
    }),
    /companyId must be a positive integer/
  );
});

test('maps HubSpot object properties through the configured inbound map only', () => {
  const mapped = mapHubSpotInboundProperties(
    { firstname: 'Andrea', lastname: 'Díaz', phone: '+56912345678', hs_object_id: '441' },
    { name: 'firstname', phone: 'phone' },
  );

  assert.deepEqual(mapped, { name: 'Andrea', phone: '+56912345678' });
});

test('validates a tenant-scoped HubSpot integration without requiring a secret at build time', () => {
  assert.deepEqual(
    validateHubSpotIntegrationConfig({
      companyId: 12,
      integrationId: 3,
      portalId: '123456',
      authorizationMode: 'oauth',
      fieldMappings: { contact: { name: 'firstname' } },
    }),
    {
      companyId: 12,
      integrationId: 3,
      portalId: '123456',
      authorizationMode: 'oauth',
      fieldMappings: { contact: { name: 'firstname' } },
    },
  );
});
