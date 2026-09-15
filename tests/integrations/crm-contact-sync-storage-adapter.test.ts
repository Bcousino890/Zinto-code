import assert from 'node:assert/strict';
import test from 'node:test';

import { createCrmContactSyncStorageAdapter } from '../../server/services/crm-contact-sync-storage-adapter';
import type { Contact } from '../../shared/schema';

const BASE_URL = process.env.BASE_URL;

function fakeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 91,
    name: 'Andrea Díaz',
    phone: '+56912345678',
    email: null,
    company: null,
    tags: null,
    notes: null,
    customFields: null,
    avatarUrl: null,
    ...overrides,
  } as Contact;
}

test('exposes avatarUrl as an absolute, authenticated v2 download URL when the contact has a WhatsApp photo', async () => {
  process.env.BASE_URL = 'https://crm.zinto.app';
  try {
    const port = createCrmContactSyncStorageAdapter({
      crmIntegrationBelongsToCompany: async () => true,
      getContactByCrmExternalId: async () => undefined,
      createContact: async () => fakeContact({ avatarUrl: '/media/profile_pictures/56912345678_170000.jpg' }),
      updateContact: async () => fakeContact({ avatarUrl: '/media/profile_pictures/56912345678_170000.jpg' }),
      saveCrmContactMapping: async () => {},
    });

    const created = await port.createContact({ companyId: 12, name: 'Andrea Díaz' });
    assert.equal(created.avatarUrl, 'https://crm.zinto.app/api/v2/media?type=profile_pictures&filename=56912345678_170000.jpg');

    const updated = await port.updateContact(91, { name: 'Andrea Díaz' });
    assert.equal(updated.avatarUrl, 'https://crm.zinto.app/api/v2/media?type=profile_pictures&filename=56912345678_170000.jpg');
  } finally {
    if (BASE_URL === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = BASE_URL;
  }
});

test('omits avatarUrl entirely when Zinto has no photo for the contact', async () => {
  const port = createCrmContactSyncStorageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getContactByCrmExternalId: async () => undefined,
    createContact: async () => fakeContact({ avatarUrl: null }),
    updateContact: async () => fakeContact({ avatarUrl: null }),
    saveCrmContactMapping: async () => {},
  });

  const created = await port.createContact({ companyId: 12, name: 'Andrea Díaz' });
  assert.equal(created.avatarUrl, undefined);
  assert.ok(!('avatarUrl' in JSON.parse(JSON.stringify(created))));
});

test('normalizes the rest of the contact fields unchanged, avatarUrl aside', async () => {
  const port = createCrmContactSyncStorageAdapter({
    crmIntegrationBelongsToCompany: async () => true,
    getContactByCrmExternalId: async () => fakeContact({
      id: 91,
      email: 'andrea@example.com',
      company: 'Analytical Engines',
      tags: ['vip'],
      notes: 'Called back',
      customFields: { crm_tier: 'gold' },
    }),
    createContact: async () => { throw new Error('must not create'); },
    updateContact: async () => { throw new Error('must not update'); },
    saveCrmContactMapping: async () => { throw new Error('must not map'); },
  });

  const found = await port.findByExternalId({ companyId: 12, integrationId: 3, externalId: 'crm-441' });
  assert.deepEqual(found, {
    id: 91,
    name: 'Andrea Díaz',
    phone: '+56912345678',
    email: 'andrea@example.com',
    company: 'Analytical Engines',
    tags: ['vip'],
    notes: 'Called back',
    customFields: { crm_tier: 'gold' },
    avatarUrl: undefined,
  });
});
