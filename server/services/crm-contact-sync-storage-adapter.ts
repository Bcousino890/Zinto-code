import type { IStorage } from '../storage';
import type { CrmContactSyncPort } from './crm-contact-sync-service';

export function createCrmContactSyncStorageAdapter(storage: Pick<IStorage,
  'crmIntegrationBelongsToCompany' | 'getContactByCrmExternalId' | 'createContact' | 'updateContact' | 'saveCrmContactMapping'
>): CrmContactSyncPort {
  return {
    integrationBelongsToCompany: ({ companyId, integrationId }) => storage.crmIntegrationBelongsToCompany(companyId, integrationId),
    findByExternalId: ({ companyId, integrationId, externalId }) =>
      storage.getContactByCrmExternalId(companyId, integrationId, externalId),
    createContact: (input) => storage.createContact(input),
    updateContact: (id, input) => storage.updateContact(id, input),
    saveMapping: ({ companyId, integrationId, externalId, zintoId }) =>
      storage.saveCrmContactMapping(companyId, integrationId, externalId, zintoId),
  };
}
