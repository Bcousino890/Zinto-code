-- Per-company switch for inbound WhatsApp (unofficial) group message support.
-- Off by default: group chats are ignored entirely unless a company opts in.

BEGIN;

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS whatsapp_groups_enabled BOOLEAN DEFAULT FALSE;

COMMIT;
