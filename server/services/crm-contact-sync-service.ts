export interface CrmContactInput {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  tags?: string[];
  customFields?: Record<string, unknown>;
}

interface StoredContact extends CrmContactInput {
  id: number;
}

export interface CrmContactSyncPort {
  integrationBelongsToCompany(input: { companyId: number; integrationId: number }): Promise<boolean>;
  findByExternalId(input: { companyId: number; integrationId: number; externalId: string }): Promise<StoredContact | undefined>;
  createContact(input: CrmContactInput & { companyId: number }): Promise<StoredContact>;
  updateContact(id: number, input: Partial<CrmContactInput>): Promise<StoredContact>;
  saveMapping(input: { companyId: number; integrationId: number; externalId: string; zintoId: number }): Promise<void>;
}

export class CrmContactSyncService {
  constructor(private readonly port: CrmContactSyncPort) {}

  async upsert(input: {
    companyId: number;
    integrationId: number;
    externalId: string;
    contact: CrmContactInput;
  }): Promise<{ contact: StoredContact; created: boolean }> {
    if (!await this.port.integrationBelongsToCompany(input)) {
      throw new Error('Integration does not belong to this company');
    }
    const existing = await this.port.findByExternalId(input);
    if (existing) {
      const contact = await this.port.updateContact(existing.id, input.contact);
      return { contact, created: false };
    }

    const contact = await this.port.createContact({ companyId: input.companyId, ...input.contact });
    await this.port.saveMapping({
      companyId: input.companyId,
      integrationId: input.integrationId,
      externalId: input.externalId,
      zintoId: contact.id,
    });
    return { contact, created: true };
  }
}
