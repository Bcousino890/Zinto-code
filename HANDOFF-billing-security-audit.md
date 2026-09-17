# Handoff: Billing/Stripe security audit — 2026-09-17

Session ran out of usage mid-work. This document is the single source of truth for
what's done, what's committed-but-not-deployed, and what's still open. Read this
fully before touching anything.

## 0. Environment facts you need first

- Production runs from `/home/deploy/zinto` directly (pm2 process `zinto`, `dist/index.js`).
  There is no separate deploy step — build here, `pm2 restart zinto`, done.
- **This directory is shared with other concurrent Claude Code sessions.** Always run
  `git status` and `git branch --show-current` before doing anything — the checked-out
  branch and uncommitted files can change under you between your own tool calls.
  Before any `git checkout/reset/clean` or destructive command, stash or commit what's
  there first, don't discard it.
- `npm run build` has been failing the last ~4 attempts, always at the same point
  (`vite build` → "rendering chunks..." → silent death, no error message, matches the
  pattern of the OS OOM-killing the process on this memory-constrained host when other
  sessions are also active). It succeeded reliably earlier in this same session. **Retry
  it a few times, ideally when other sessions on this box are quiet; if it keeps failing,
  check `free -h` and consider `NODE_OPTIONS="--max-old-space-size=4096" npm run build`.**
  This is an infra issue, not something introduced by the code changes below.
- The GitHub App/token connected to this session can push branches but gets a `403
  Resource not accessible by integration` on every PR-creation attempt (tried ~5 times,
  different branches, always the same error). PRs must be opened by a human clicking the
  compare link on github.com — this isn't fixable from here.
- Two other **independent, concurrent Claude sessions** did real work on this exact repo
  during today's session:
  1. One shipped PR #5 (CRM v2 media/image/video/audio support) — already merged into
     `security/port-fase1-fase2-fixes`, already live.
  2. Another hit the *same* usage-limit wall doing a **separate** security audit (v2 API
     IDOR/enumeration issues, not billing) and left a checkpoint commit `a8ca343` on the
     branch `feature/crm-v2-security-hardening` with a detailed "done vs. not-wired-yet"
     breakdown in its own commit message (`git show a8ca343`). **This session's 3 billing
     fixes are committed on top of that same branch** (see §2) — the branch now carries
     both people's work. Read `a8ca343`'s commit message before deploying that branch;
     it explicitly says some of its fixes are logic-only, not wired into routes yet.

## 1. What's confirmed LIVE in production right now

Everything on `security/port-fase1-fase2-fixes` as of commit `c722a36` — this includes,
from earlier in this session: the CRM v2 webhook producer fix (events were never firing),
webhook failure-reason logging, uncapped event counts in the ops panel, API rate-limit
defaults raised 5x, subscription-expiration enforcement fix (expired accounts no longer
silently kept access), an IDOR fix on `/api/email/messages/:messageId/attachments`, a
Stripe checkout promo-code fix, and the plan-comparison-table admin UI. All deployed and
verified working. Also live: PR #5 (CRM v2 media support) and several other sessions'
commits (`034b656`, `458357e`, `b9ad543`, `aec2f42`) — see `git log --oneline -10`.

## 2. Committed but NOT yet deployed — do this first

**Commit `9a58434`, branch `feature/crm-v2-security-hardening`** (already pushed to
origin). Three fixes closing the most trivially-exploitable "get paid access for free"
holes found by this session's audit (see §3 for the full list — these were the top 3
picked for being safe/fast to fix without a bigger redesign):

1. `POST /api/enhanced-subscription/verify-bank-transfer-renewal` — no longer trusts a
   client-supplied `verified: true`. Now always records the transfer as pending; only
   the existing admin-gated `PATCH /api/admin/payments/transactions/:id/status` can
   actually complete it.
2. `POST /api/enhanced-subscription/grace-period/recover` — `transactionId` is now
   validated (must be a real, `completed` transaction owned by the caller's company)
   instead of being trusted as an unchecked label.
3. `POST /api/enhanced-subscription/change-plan` — disabled (403), same pattern as the
   already-disabled `/renew` endpoint. It never actually charged anything (logged a
   `pending` payment_transactions row and swapped `planId` unconditionally) and isn't
   called by any client UI today.

Verified: `npx esbuild server/routes/enhanced-subscription.ts --outfile=/dev/null` clean;
`node --import tsx --test tests/integrations/*.test.ts` → 204/204 pass. **Not yet built
or deployed** — the build kept failing (see §0). To finish:

```bash
cd /home/deploy/zinto
git status   # confirm branch/state before anything else
npm run build   # retry until it succeeds
pm2 restart zinto --update-env
sleep 6 && pm2 list && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:9000/
```

Then decide whether to merge `feature/crm-v2-security-hardening` back into
`security/port-fase1-fase2-fixes` (it's already based on that branch's tip, so it should
be a clean fast-forward or trivial merge) and push.

## 3. Found but NOT yet fixed — full audit results

Four parallel agents audited: (1) signup/first purchase, (2) renewal/grace
period/auto-renewal, (3) upgrade/downgrade/pause/cancellation, (4) Stripe webhook
integrity system-wide. Full agent transcripts are in this session's history if you need
the complete reasoning/file:line trail; below is the actionable summary.

### CRITICAL — still open

- **Plan resource limits don't exist.** `server/services/plan-limits-service.ts:571-599`
  — `getCurrentUserCount`/`getCurrentContactCount`/`getCurrentChannelCount`/
  `getCurrentFlowCount`/`getCurrentCampaignCount` are hardcoded `return 0`. Every
  `checkPlanLimit()` call (contact/channel/user/campaign creation routes) always passes.
  `maxFlows` isn't even checked anywhere. Fix: implement real counts (a working, unused
  reference implementation already exists in `usage-tracking-service.ts` — it's just
  never called from the actual creation routes).
- **Downgrade enforces nothing.** Buying a cheaper plan doesn't deactivate excess
  users/channels/flows (only excess contacts get archived, via
  `plan-downgrade-service.ts`, and that service isn't even wired to the real checkout
  path — `payment-routes.ts` never calls it). Combined with the point above, a company
  can run at top-tier scale on the cheapest plan indefinitely. Needs a product decision
  (hard block downgrade until under limits? soft-deactivate excess resources? grace
  period?) before it can be coded.
- **Pause doesn't block access, and resuming extends the paid-through date for free.**
  `server/services/subscription-pausing-service.ts` — `'paused'` is never special-cased
  by `ensureActiveSubscription`/`checkSubscriptionExpiration`, so a paused company keeps
  full access; `resumeSubscription()` then pushes `subscriptionEndDate` forward by the
  exact pause duration. Repeatable, no cooldown. The scheduler also skips `'paused'`
  companies entirely so they're never even attempted for billing during the pause. Two
  separate bugs: (a) add `'paused'` to the access-block list, (b) decide if "extend by
  pause duration" is even the right design for a company that keeps full access anyway —
  probably it should either truly block access (matching the UI's own copy, which
  already claims it does) or not extend the date.
- **Refunds never revoke access.** No `charge.refunded`/`charge.dispute.created` handler
  anywhere touches `subscriptionStatus`/`planId`/`subscriptionEndDate` — confirmed for
  Mercado Pago (`admin-routes.ts:3305-3320`, updates only the transaction row) and
  structurally true for Stripe (no dispute handler exists at all, see below).
- **Trials never expire in the enforcement path.** `plan-limits-service.ts`'s expiration
  check never compares `trialEndDate` to `now`; only a manual superadmin sweep
  (`POST /api/admin/trials/process-expired`, `server/trial-routes.ts:36`) ends a trial,
  and nothing ever calls it automatically. Fix: either wire that sweep into the
  scheduler's cron, or add a direct `trialEndDate < now` check to
  `checkSubscriptionExpiration`.
- **The Stripe webhook endpoint actually configured in the admin UI has zero replay
  protection.** `server/admin-routes.ts:3146-3250` (`/api/webhooks/stripe` — confirmed
  via `client/src/pages/admin/settings/index.tsx:598,3364` that this is the URL the
  admin panel tells operators to paste into Stripe's dashboard, not the other,
  better-built handler in `subscription-webhooks.ts` which is very likely dead code in
  production). Every Stripe retry of `payment_intent.succeeded` re-extends
  `subscriptionEndDate = now + 30 days` — from *now*, not from the existing end date —
  on every redelivery. Fix: add the same idempotency pattern already proven correct in
  `server/services/subscription-webhooks.ts:99-148` (unique `eventId` insert inside the
  same transaction as the state change), and fix the date math to stack onto the
  existing end date like `activateSubscriptionAfterPayment` already does correctly.
- **No Stripe-side cancellation/dispute awareness for plan subscriptions at all.**
  `charge.dispute.created` has zero occurrences anywhere in `server/`. A customer who
  disputes their card charge with their bank keeps full access for the rest of the paid
  period regardless — nothing in the live request path or the periodic reconciliation
  job can ever learn about it.
- **Moyasar fails open.** `server/payment-routes.ts:1352-1411,1484-1553` — treats a
  `account_inactive_error` from Moyasar as "payment verified," including against a
  client-supplied `paymentId` with no prior validation.
- **`activateSubscriptionAfterPayment` has no idempotency guard at all**
  (`server/routes/enhanced-subscription.ts:1959-2014`). Currently dormant only because
  `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are unset in `.env` (so
  `payment-callbacks.ts`'s webhook and its unauthenticated `GET /stripe/success` replay
  path both fail closed today) — **this will start misbehaving the moment those env vars
  get configured**, which is likely imminent given the in-flight addon-billing work. Fix
  before enabling Stripe fully: make this function idempotent, e.g. by checking
  `subscriptionEvents` for a prior `subscription_renewed` row with the same `paymentId`
  before extending again (no schema migration needed — that table already exists and is
  already queried the same way elsewhere in this file).

### MODERATE — lower priority, but real

- Outstanding-balance check (`enhanced-subscription.ts:1350-1372`, from another
  session's recent commit `458357e`) can silently return "no balance" when a renewal
  failure was recorded via the in-app status-poll path instead of a webhook (no matching
  `payment_transactions` row to find). Also architecturally disconnected from access
  control — it only gates `/initiate-renewal`, which none of the critical bypasses above
  even go through.
- Grace-period start/reset (`grace-period-service.ts:75-97`,
  `subscription-manager.ts:404-411`) is not idempotent — two uncoordinated dunning
  trackers can each independently reset `gracePeriodEnd`, extending the grace window
  repeatedly across one non-payment episode.
- Scheduler's automatic renewal produces duplicate `'completed'` `payment_transactions`
  rows per real billing cycle (24h lookahead vs. 6h poll cadence, no unique constraint
  catches it) — doesn't over-extend subscription time (that's correctly bounded by
  Stripe's own `current_period_end`), but corrupts revenue reporting.
- Zinto's own coupon system (`coupon_codes`/`couponUsage`) is fully orphaned from every
  real checkout/renewal path — not exploitable for over-discounting (it discounts
  nothing), but it's dead code with its own "check over a table nobody writes to" bug
  (`currentUsageCount` is never incremented anywhere).
- `POST /api/coupons/validate` (preview endpoint) has no auth at all — minor, lets
  anyone probe coupon codes.

### CONFIRMED SAFE — don't waste time re-checking these

First-time Stripe checkout + `/api/payment/verify` (transactionId branch); MercadoPago /
Paystack / MPESA verification; all `ensureSuperAdmin`-gated admin routes; cancellation's
access revocation (`'cancelled'` is correctly treated as immediately expired); AI
token/usage billing (real, DB-backed, actually enforced — contrast with the fake plan
limits above); the scheduler's Stripe-subscription auto-renewal (time comes from
Stripe's `current_period_end`, never app arithmetic); no cross-tenant metadata
tampering anywhere in `stripe.checkout.sessions.create()` calls.

## 4. Two pending PRs (add-ons / "planes extra" feature) — unrelated to the security work above

These were split into two so the base infra could be reviewed independently of the
add-ons feature built on top of it. **Neither needs the security fixes above merged
first, and vice versa — independent tracks.**

**PR A (merge this one first, zero conflicts):**
`https://github.com/Bcousino890/Zinto-code/compare/security/port-fase1-fase2-fixes...feature/stripe-catalog-sync`
Stripe product/price catalog sync for plans & coupons, background worker (off by default,
`STRIPE_CATALOG_AUTO_SYNC` flag), CSRF middleware for the new admin routes. Tested:
232/232 + 3/3 (`tests/csrf-protection.test.ts tests/stripe-catalog-*.test.ts
tests/integrations/*.test.ts` + `tests/subscription-expiration.test.ts`).

**PR B (merge after A; will auto-shrink to just the add-ons-specific diff once A lands):**
`https://github.com/Bcousino890/Zinto-code/compare/security/port-fase1-fase2-fixes...feature/addon-billing`
Extra-user-seat / extra-WhatsApp-connection paid add-ons, full purchase/webhook/
auto-renewal flow, customer-facing UI already wired into Settings → Billing. Has exactly
**one textual conflict**, in `server/index.ts` (two different fixes for the same
"webhooks need the raw body" problem). Resolution — delete everything between
`<<<<<<<` and `>>>>>>>` and replace with:
```ts
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })(req, res, next);
```
(Both Stripe webhook handlers already read `req.rawBody`, not `req.body` — no separate
`express.raw()` carve-out is needed.) Tested against the branch's current tip: 294/294
pass. **The user explicitly asked to combine PR A + PR B into one PR before merging** —
not yet done as of this handoff; either merge A first then open a fresh combined PR of
`feature/addon-billing` (which already contains all of A's commits) against
`security/port-fase1-fase2-fixes`, or ask GitHub support / repo admin about the 403 on
PR creation so Claude can do it directly next time.

**Important, found during review of PR B:** merging it wires `addon-purchase-service.ts`
into real Stripe billing. Before that goes live, either configure `STRIPE_SECRET_KEY`/
`STRIPE_WEBHOOK_SECRET` in `.env` (which will also un-dormant the critical
`activateSubscriptionAfterPayment` idempotency bug above — fix that first) or verify the
add-on purchase flow correctly uses the DB-stored `payment_stripe` setting instead (it
does, via `StripeClientProvider` — confirmed safe on that specific point).

## 5. Suggested order for whoever picks this up

1. Get `feature/crm-v2-security-hardening` (§2) built and deployed — it's done, just
   blocked on the environment's build flakiness.
2. Read `a8ca343`'s commit message in full and finish wiring whatever it left
   partially-done (separate CRM v2 IDOR/enumeration work, not billing).
3. Pick off the CRITICAL items in §3 one at a time — the Stripe webhook idempotency
   fix and the trial-expiration fix are probably the next-highest value for the
   effort involved.
4. Merge PR A, then PR B (§4), after combining them per the user's request.
5. Anything in MODERATE (§3) as time allows.
