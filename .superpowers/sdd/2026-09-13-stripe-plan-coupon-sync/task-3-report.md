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
