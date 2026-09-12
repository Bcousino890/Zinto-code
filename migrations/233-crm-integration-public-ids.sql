-- Public CRM integration identifiers must not be enumerable. Internal serial IDs
-- remain unchanged for foreign keys and joins; clients use public_id instead.
ALTER TABLE crm_integrations ADD COLUMN IF NOT EXISTS public_id UUID;
UPDATE crm_integrations SET public_id = gen_random_uuid() WHERE public_id IS NULL;
ALTER TABLE crm_integrations ALTER COLUMN public_id SET DEFAULT gen_random_uuid();
ALTER TABLE crm_integrations ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS crm_integrations_public_id_uidx ON crm_integrations(public_id);
