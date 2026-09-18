import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../migrations/234-stripe-catalog-sync.sql', import.meta.url),
  'utf8',
);

test('la migración agrega correspondencias y deduplicación de trabajos', () => {
  assert.match(sql, /ALTER TABLE plans[\s\S]*stripe_product_id/i);
  assert.match(sql, /ALTER TABLE plans[\s\S]*stripe_price_id/i);
  assert.match(sql, /ALTER TABLE plans[\s\S]*stripe_plan_coupon_id/i);
  assert.match(sql, /ALTER TABLE plans[\s\S]*stripe_sync_error[\s\S]*stripe_synced_at[\s\S]*stripe_sync_fingerprint/i);
  assert.match(sql, /ALTER TABLE coupon_codes[\s\S]*stripe_coupon_id/i);
  assert.match(sql, /ALTER TABLE coupon_codes[\s\S]*stripe_promotion_code_id/i);
  assert.match(sql, /ALTER TABLE coupon_codes[\s\S]*stripe_sync_error[\s\S]*stripe_synced_at[\s\S]*stripe_sync_fingerprint/i);
  assert.match(sql, /CHECK\s*\(stripe_sync_status IN \('pending', 'synced', 'failed'\)\)/i);
  assert.match(sql, /conname = 'plans_stripe_sync_status_check'[\s\S]*conrelid = to_regclass\(format\('%I\.%I', current_schema\(\), 'plans'\)\)/i);
  assert.match(sql, /conname = 'coupon_codes_stripe_sync_status_check'[\s\S]*conrelid = to_regclass\(format\('%I\.%I', current_schema\(\), 'coupon_codes'\)\)/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS stripe_catalog_sync_jobs/i);
  assert.match(sql, /revision[\s\S]*attempts[\s\S]*next_attempt_at[\s\S]*locked_at[\s\S]*locked_by[\s\S]*claim_token/i);
  assert.match(sql, /UNIQUE\s*\(entity_type, entity_id, fingerprint, revision\)/is);
  assert.match(sql, /CREATE INDEX[\s\S]*status[\s\S]*next_attempt_at/i);
});
