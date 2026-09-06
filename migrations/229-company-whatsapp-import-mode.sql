-- Per-company WhatsApp (unofficial) history import policy.
-- disabled     = never create contacts/chats from the native history payload
-- contacts_only = create contacts, but not conversations (default)
-- full_chat    = create contacts + conversations, and ingest messages with no time window

BEGIN;

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS whatsapp_import_mode TEXT DEFAULT 'contacts_only';

ALTER TABLE companies
DROP CONSTRAINT IF EXISTS chk_companies_whatsapp_import_mode;

ALTER TABLE companies
ADD CONSTRAINT chk_companies_whatsapp_import_mode
CHECK (whatsapp_import_mode IN ('disabled', 'contacts_only', 'full_chat'));

COMMIT;
