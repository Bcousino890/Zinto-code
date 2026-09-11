import type { IStorage } from '../storage';
import type { CrmContactSyncPort } from './crm-contact-sync-service';
import type { Contact } from '../../shared/schema';

type StoredContact = NonNullable<Awaited<ReturnType<CrmContactSyncPort['findByExternalId']>>>;

function normalizeContact(contact: Contact): StoredContact {
  const customFields = contact.customFields;

  return {
    id: contact.id,
    name: contact.name,
    phone: contact.phone ?? undefined,
    email: contact.email ?? undefined,
    company: contact.company ?? undefined,
    tags: contact.tags ?? undefined,
    customFields: customFields && typeof customFields === 'object' && !Array.isArray(customFields)
      ? customFields as Record<string, unknown>
      : undefined,
  };
}

export function createCrmContactSyncStorageAdapter(storage: Pick<IStorage,
  'crmIntegrationBelongsToCompany' | 'getContactByCrmExternalId' | 'createContact' | 'updateContact' | 'saveCrmContactMapping'
>): CrmContactSyncPort {
  return {
    integrationBelongsToCompany: ({ companyId, integrationId }) => storage.crmIntegrationBelongsToCompany(companyId, integrationId),
    findByExternalId: async ({ companyId, integrationId, externalId }) => {
      const contact = await storage.getContactByCrmExternalId(companyId, integrationId, externalId);
      return contact ? normalizeContact(contact) : undefined;
    },
    createContact: async (input) => normalizeContact(await storage.createContact(input)),
    updateContact: async (id, input) => normalizeContact(await storage.updateContact(id, input)),
    saveMapping: ({ companyId, integrationId, externalId, zintoId }) =>
      storage.saveCrmContactMapping(companyId, integrationId, externalId, zintoId),
  };
}
