# Task 3 report: Stripe catalog sync service

## RED / GREEN

- RED: `node --import tsx --test tests/stripe-catalog-sync-service.test.ts` failed with `ERR_MODULE_NOT_FOUND` for `stripe-catalog-sync-service`, as expected before implementation.
- GREEN: the focused test passes 7/7 using an in-memory Stripe fake; it makes no network requests and uses no credentials.

## Decisions

- The service receives storage and a narrow Stripe client as dependencies. This keeps HTTP and real Stripe configuration outside the service and makes reconciliation testable.
- Product and price creation includes `zinto_plan_id`; coupon and promotion-code creation includes `zinto_coupon_id`, plus environment and schema-version metadata.
- Idempotency keys are deterministic from entity, operation, and catalog fingerprint. Immutable Stripe price/coupon changes create replacements and deactivate prior price/promotion-code objects.
- The current Stripe price and coupon store their immutable-field fingerprint in metadata, allowing text-only product changes to avoid replacement prices.
- Dry runs return planned actions and never call Stripe or persist local Stripe IDs. The client provider requires explicit storage, rejects incomplete `payment_stripe` configuration with a generic error, and sanitizes credential-shaped fragments.

## Verification

- Focused service/provider suite: 7 passing tests.
- Relevant Task 1–2 plus Task 3 suites: 37 passing tests.
- `NODE_OPTIONS=--max-old-space-size=4096 npm run check`: exit 0.
- `git diff --check`: exit 0.

## Risks / follow-up

- Task 4 must construct `StripeClientProvider(storage)` only in the worker/admin composition root and record sanitized failures through the outbox.
- Stripe coupons cannot be hard-deleted under this design; obsolete coupon redemption is prevented by deactivating its promotion code. Existing coupon objects remain for historical reference.
- A live reconciliation remains deliberately out of scope; it must start with the dry-run review described in the plan.

## Round 1 review fixes

### RED / GREEN

- RED: the expanded focused suite failed for the missing plan-discount coupon, inactive plan price, promotion-code lifecycle, metadata reconciliation, JPY conversion, and remote dry-run isolation cases.
- GREEN: `node --import tsx --test tests/stripe-catalog-sync-service.test.ts` passes 13/13 after the fixes.

### Implemented findings

1. Plan discount fields and dates now participate in the catalog fingerprint. Active discounts create/reuse a Stripe coupon with `zinto_plan_id`, replacement coupons mark their predecessors archived in metadata, and `stripePlanCouponId` is persisted or cleared outside its validity window.
2. Deactivating a plan archives both the mapped/reconciled price and product before recording the local synchronized state.
3. Coupon start/end/activity fields participate in its fingerprint. Promotion codes are created inactive outside the window and are updated inactive when a coupon is disabled or expires.
4. Missing local mappings are recovered by Zinto metadata and immutable fingerprints using bounded cursor pagination. Tests simulate a persistence failure and recover product, price, coupon, and promotion-code mappings without additional creates.
5. Plan price fingerprints and Stripe price payloads use the normalized configured currency; the suite verifies JPY as a zero-decimal currency.
6. Dry-run returns a local plan only. It does not call retrieve, list, create, update, or storage persistence, including when Stripe IDs already exist.

### Round 1 verification

- Focused service/provider suite: 13 passing tests.
- Relevant Tasks 1–3 suites: 44 passing tests.
- `NODE_OPTIONS=--max-old-space-size=4096 npm run check`: exit 0.
- `git diff --check`: exit 0.

## Re-review fixes

### Availability reconciliation contract

- `syncPlan` and `syncCoupon` calculate availability from one captured current time per invocation and include that calculated state in their synchronization fingerprint. A clock-only transition therefore reaches Stripe even when catalog fields are unchanged: a plan-discount coupon is created or archived, and a coupon promotion code is activated or deactivated.
- `StripeCatalogSyncService.reconcileAvailability(entityType, entityId)` is the reusable entry point for Task 5. Task 5's periodic worker must call it for plans and coupons whose start or end boundary is due (or sweep all eligible catalog entities often enough to cross each boundary). This service intentionally owns no background timer or scheduler.

### Stripe lifecycle and coupon duration

- When an active plan reuses an archived mapped price with the same immutable fingerprint, the service updates that price to `active: true`; a fingerprint mismatch still creates a replacement price and archives the previous one.
- Plan `discountDuration` is validated and mapped to Stripe coupon semantics: `permanent` and `limited_time` use `forever` (the latter is bounded for redemption by `redeem_by`), `first_month` uses `once`, and `first_year` uses `repeating` with `duration_in_months: 12`. Unknown values fail before a coupon is created.

### Re-review verification

- Focused service/provider suite: 17 passing tests using only the in-memory Stripe fake; no Stripe API calls or credentials.
