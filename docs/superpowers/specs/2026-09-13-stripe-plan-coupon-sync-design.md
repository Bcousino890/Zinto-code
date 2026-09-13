# Stripe Plan and Coupon Synchronization Design

## Objective

Make Zinto the source of truth for subscription plans and coupon codes while keeping Stripe's live catalog synchronized automatically. Changes made in `/admin/plans` and `/admin/coupons` must propagate safely to Stripe without duplicating products, prices, coupons, promotion codes, subscriptions, or charges.

## Scope

- Synchronize all existing plans and coupons to Stripe through an explicit initial reconciliation.
- Automatically synchronize subsequent create, update, deactivate, and delete operations.
- Use the application's configured Stripe account and its configured live/test mode.
- Apply synchronized Stripe prices and discounts in both initial checkout and renewal flows.
- Expose synchronization state and actionable errors to super administrators.
- Test idempotency, amount calculations, lifecycle transitions, webhook handling, and secret handling.

## Source of Truth and Pricing Rules

Zinto remains authoritative. Stripe object IDs and sync state are stored on the corresponding Zinto records.

For a discounted plan, `originalPrice` is the Stripe recurring unit amount and the plan-level discount is represented by a Stripe Coupon attached during checkout/subscription creation. When no plan-level discount is active, `price` is the Stripe recurring unit amount. The customer-visible and charged total must equal Zinto's calculated final amount.

Standalone coupon codes in `/admin/coupons` are synchronized as Stripe Coupons plus Promotion Codes. Checkout applies at most one standalone coupon in addition to any plan-level discount only if Zinto currently permits stacking; because the current model has no stacking policy, the initial implementation will not stack discounts. A user-provided coupon overrides the plan-level promotional discount only when it produces a lower final amount; otherwise the plan discount is retained. The server calculates and validates the winner before creating Checkout.

Fixed-amount coupons use the application's configured currency (currently EUR). Percentage coupons are currency-independent. Trial days are stored on the plan metadata and applied when creating a Stripe subscription, not embedded in the Price.

## Stripe Object Mapping

Each plan stores:

- `stripeProductId`
- `stripePriceId`
- `stripePlanCouponId` when the plan has a built-in discount
- `stripeSyncStatus`: `pending`, `synced`, or `failed`
- `stripeSyncError`
- `stripeSyncedAt`
- a deterministic sync fingerprint covering billable fields

Each coupon stores:

- `stripeCouponId`
- `stripePromotionCodeId`
- the same sync status, error, timestamp, and fingerprint fields

Stripe metadata includes `zinto_plan_id` or `zinto_coupon_id`, environment, and schema version. These identifiers support reconciliation if local IDs are missing.

## Plan Lifecycle

### Create

After the database transaction creates a plan, enqueue an idempotent sync. The worker creates one Stripe Product and one active recurring Price. Supported Zinto intervals map to Stripe interval and interval count. `lifetime` plans use a one-time Price. Unsupported custom durations fail synchronization with a visible error rather than silently choosing a different billing schedule.

### Update

Name, description, and active state update the existing Product. Stripe Prices are immutable: changing amount, currency, or interval creates a new Price, sets it as the Product default, records the new ID, and deactivates the old Price. Existing subscriptions keep their old Price unless an explicit migration is added later; no customer is repriced silently.

Changing a built-in discount creates a replacement Stripe Coupon because monetary Coupon fields are immutable, updates future checkout usage, and retires the previous promotion object where applicable.

### Deactivate or Delete

Zinto deactivation makes the Stripe Product and current Price inactive. Deletion performs the same archival operation before removing the local record. Historical Stripe objects are never hard-deleted. If Stripe archival fails, deletion is rejected so the systems cannot diverge silently.

## Coupon Lifecycle

Creating a coupon creates a Stripe Coupon and Promotion Code using the same public code. Updates to immutable discount fields create replacements and deactivate the previous Promotion Code. Changes to activation dates, maximum redemptions, active status, and eligible products update or replace the Promotion Code as Stripe permits.

`usageLimitPerUser` and `minimumPlanValue` remain enforced by Zinto because Stripe Promotion Codes do not express all current Zinto constraints. Zinto validates the coupon before creating Checkout and passes only the synchronized Stripe discount identifier. Coupon usage is recorded only after a verified successful Stripe webhook, never when Checkout is merely opened.

## Synchronization Architecture

A focused `StripeCatalogSyncService` owns Stripe catalog operations and has no HTTP concerns. Plan and coupon routes call an outbox-backed sync coordinator after local validation. An outbox table stores operation type, entity ID, fingerprint, attempt count, last error, and completion time.

The initial sync endpoint is restricted to super administrators and reconciles every plan and coupon. It is idempotent and may be rerun. A small status endpoint supplies counts and failed items to the admin UI. A manual “Sync with Stripe” action retries failed or stale records.

Automatic retries use bounded exponential backoff. Stripe idempotency keys are deterministic from entity, operation, and fingerprint. Concurrent edits serialize per entity, and stale jobs re-read the latest record before calling Stripe.

## Checkout and Payment Integrity

Checkout uses only the `stripePriceId` stored on the selected plan. The server ignores any client-supplied amount, currency, Stripe Price ID, discount ID, or trial value. It loads the plan and coupon from the database, recalculates the final amount, validates activity and eligibility, and creates the Stripe Checkout Session with deterministic metadata.

Webhook processing verifies the raw request body and Stripe signature, deduplicates by Stripe event ID, and validates plan/company metadata before changing subscription state. The expected plan, amount, currency, customer, and payment status are compared against server-side records. Mismatches are logged and quarantined rather than activating access.

Idempotency keys prevent duplicate Checkout/session/subscription creation after retries. Database uniqueness constraints prevent duplicate processing and duplicate active mappings.

## Secrets and Logging

Stripe secret keys and webhook secrets remain server-side and are never returned by catalog or checkout APIs. Logs redact API keys, webhook signatures, customer payment details, and full Stripe payloads. Admin responses return Stripe object IDs and sanitized error messages only.

## Failure Behavior

Plan or coupon saves remain durable if asynchronous synchronization fails, except deletion, which fails closed when Stripe archival cannot be confirmed. Failed entities show `failed` state and an administrator can retry. Checkout is blocked for a paid plan without a current synchronized Price; it must never fall back to accepting a client amount or creating an ad hoc price.

## Database and Migration

Add nullable Stripe mapping and synchronization columns to `plans` and `coupon_codes`, plus a catalog sync outbox table with unique entity/fingerprint constraints. The migration is additive and reversible. Existing records begin as `pending` and are handled by initial reconciliation.

## Admin Experience

The plans and coupons pages display Stripe sync status. A super-admin action starts initial/full reconciliation and reports totals for synchronized, skipped, and failed records. Saving an item shows that the local save succeeded and synchronization is pending; failures include a retry action and a sanitized reason.

## Verification

- Unit tests for amount-to-minor-unit conversion, interval mapping, fingerprints, discount selection, and lifecycle decisions.
- Service tests with a fake Stripe client for create/update/archive, idempotency, retry, and stale-job behavior.
- Route tests proving client-supplied amounts and Stripe IDs are ignored.
- Checkout tests for plan discounts, coupon discounts, non-stacking selection, trials, fixed EUR discounts, inactive/expired coupons, and unsynchronized plans.
- Webhook tests for valid signatures, invalid signatures, duplicate events, mismatched amounts, failed payments, successful activation, renewals, refunds, and cancellation.
- Migration tests and a dry-run reconciliation report before live creation.
- Typecheck and production build.
- Security review of the final working-tree diff, focused on secret exposure, authorization, IDOR, replay, duplicate charges, amount tampering, and fail-open behavior.

## Rollout

1. Deploy schema and code with automatic sync disabled.
2. Run dry-run reconciliation and review the exact products, prices, and coupons that would be created.
3. Run initial live reconciliation once approved.
4. Verify Stripe objects and execute a low-value end-to-end Checkout test.
5. Enable automatic synchronization.
6. Monitor webhook failures and catalog sync errors during the first billing cycle.

No existing subscription is repriced or migrated automatically during this rollout.
