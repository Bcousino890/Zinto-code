-- Admin-issued provisional passwords that coexist with a user's real password.
-- Login accepts either the real password or a non-expired temporary one, so
-- granting support access never invalidates what the user already knows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMP;
