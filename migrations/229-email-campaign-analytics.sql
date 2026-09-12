CREATE TABLE IF NOT EXISTS email_signatures (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id),
  company_id integer NOT NULL REFERENCES companies(id),
  name text NOT NULL,
  html_content text,
  plain_text_content text,
  logo_url text,
  font_family text DEFAULT 'Arial',
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS reply_to text;
ALTER TABLE email_signatures ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE email_signatures ADD COLUMN IF NOT EXISTS font_family text DEFAULT 'Arial';
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS signature_id integer REFERENCES email_signatures(id) ON DELETE SET NULL;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS ab_test_settings jsonb;

ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS variant text CHECK (variant IN ('a', 'b'));
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS tracking_token text;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS opened_at timestamp;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS first_clicked_at timestamp;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS replied_at timestamp;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS bounced_at timestamp;
ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS unsubscribed_at timestamp;
CREATE UNIQUE INDEX IF NOT EXISTS campaign_recipients_tracking_token_unique ON campaign_recipients(tracking_token) WHERE tracking_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS campaign_events (
  id serial PRIMARY KEY,
  campaign_id integer NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  recipient_id integer NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  variant text CHECK (variant IN ('a', 'b')),
  event_type text NOT NULL CHECK (event_type IN ('open', 'click', 'reply', 'bounce', 'unsubscribe')),
  link_id text NOT NULL DEFAULT '',
  destination_url text,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT campaign_events_recipient_event_unique UNIQUE (recipient_id, event_type, link_id)
);
CREATE INDEX IF NOT EXISTS campaign_events_campaign_type_idx ON campaign_events(campaign_id, event_type);
