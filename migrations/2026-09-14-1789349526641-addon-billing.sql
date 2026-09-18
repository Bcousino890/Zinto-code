-- Migration: addon-billing
-- Paid add-ons (extra user seat, extra WhatsApp connection) a company can purchase on top of its
-- plan. Each purchase grants `quantity` units for `validity_days` days, paid up front,
-- non-refundable (a manual Stripe refund/dispute still revokes it via webhook — see
-- server/services/addon-purchase-service.ts). Additive and reversible: only adds a nullable column
-- and two new tables, nothing existing is altered or dropped.
BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS country TEXT;

CREATE TABLE IF NOT EXISTS addons (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  unit_price_eur NUMERIC(10, 2) NOT NULL,
  unit_price_usd NUMERIC(10, 2) NOT NULL,
  validity_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT true,

  stripe_product_id TEXT,
  stripe_price_id_eur TEXT,
  stripe_price_id_usd TEXT,
  stripe_sync_status TEXT NOT NULL DEFAULT 'pending',
  stripe_sync_error TEXT,
  stripe_synced_at TIMESTAMP,
  stripe_sync_fingerprint TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addons_stripe_sync_status_check'
      AND conrelid = to_regclass(format('%I.%I', current_schema(), 'addons'))
  ) THEN
    ALTER TABLE addons
      ADD CONSTRAINT addons_stripe_sync_status_check
      CHECK (stripe_sync_status IN ('pending', 'synced', 'failed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS addon_purchases (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  addon_id INTEGER NOT NULL REFERENCES addons(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency TEXT NOT NULL CHECK (currency IN ('EUR', 'USD')),
  unit_amount_minor INTEGER NOT NULL,
  total_amount_minor INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'failed', 'expired', 'revoked')),

  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_charge_id TEXT,

  auto_renew BOOLEAN NOT NULL DEFAULT false,
  renewed_from_id INTEGER REFERENCES addon_purchases(id),

  purchased_at TIMESTAMP,
  expires_at TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_reason TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- At most one uncompleted checkout/renewal attempt per company+addon at a time (blocks
-- double-click / double-submit from creating two concurrent Checkout Sessions).
CREATE UNIQUE INDEX IF NOT EXISTS addon_purchases_one_pending_per_company_addon
  ON addon_purchases (company_id, addon_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS addon_purchases_active_lookup_idx
  ON addon_purchases (company_id, addon_id, status, expires_at);

-- Seed the fixed 2-row catalog, reusing the Stripe Products already created for these add-ons
-- (prod_TUXz9uFD0h9eQT / prod_TUXuCrxvZ5oN0P) so AddonCatalogSyncService adopts them instead of
-- creating duplicates. Their existing Prices are recurring+metered and share one Stripe Meter
-- across both products (unused by any app code, almost certainly a copy-paste mistake) — the sync
-- service creates fresh one-time EUR/USD prices and deactivates those instead of reusing them.
INSERT INTO addons (key, name, description, unit_price_eur, unit_price_usd, stripe_product_id)
VALUES
  (
    'extra_user',
    'Usuario adicional',
    'Usuario adicional para cualquier plan. Permite añadir un agente (usuario) más a tu cuenta.',
    12.00,
    12.00,
    'prod_TUXz9uFD0h9eQT'
  ),
  (
    'extra_whatsapp_connection',
    'Conexión adicional de WhatsApp',
    'Conexión adicional de WhatsApp para cualquier plan. Permite añadir un número extra de WhatsApp a tu cuenta.',
    15.00,
    15.00,
    'prod_TUXuCrxvZ5oN0P'
  )
ON CONFLICT (key) DO NOTHING;

COMMIT;
