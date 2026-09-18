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
     branch `feature/crm-v2-security-hardening`. That work was later finished in commit
     `cfab0ad` ("feat: finish CRM API v2 security/gap fixes — read endpoints,
     idempotency, docs") — wired the previously-unconnected read-back ports, added real
     idempotency-key persistence, finished WhatsApp template messages. Tested green
     (213/213) at the point this note was written. **This session's billing fixes are
     committed on top of that same branch** (see §2/2b/2c/2d) — the branch now carries
     multiple sessions' work, all orthogonal (billing/Stripe vs. CRM v2 messaging API).
  3. **`cfab0ad` swept up one unrelated line of mine in `server/storage.ts`**
     (`getPaymentTransactionByPaymentIntentId`, used by §2d's refund fix) purely because
     both sessions happened to be editing that file concurrently — a commit captures the
     whole file's current state, not just the lines one session intended. No harm done
     (verified the method's content survived intact), but it's a concrete example of why
     `git status`/`git diff` before every commit matters here: your own uncommitted work
     can end up folded into someone else's commit, or vice versa.
  4. **`dist/` went missing entirely for a few minutes mid-session** (2026-09-17
     ~16:20 CEST) — almost certainly another concurrent session's build/deploy tooling
     moving it aside as a rollback safety net (see the two `dist.backup-pre-*`
     directories in the repo root) before running its own build, which hadn't produced a
     fresh `dist/` yet at the moment this session checked. Production kept serving from
     the already-running process's in-memory bundle, but a restart in that window would
     have failed hard with nothing to load. If you see this, check for other sessions'
     active build processes (`ps aux | grep -iE "vite|esbuild"`) before assuming
     something broke, and rebuild immediately — don't restore one of the timestamped
     backups, they're multiple security fixes behind this branch.

## 1. What's confirmed LIVE in production right now

Everything on `security/port-fase1-fase2-fixes` as of commit `c722a36` — this includes,
from earlier in this session: the CRM v2 webhook producer fix (events were never firing),
webhook failure-reason logging, uncapped event counts in the ops panel, API rate-limit
defaults raised 5x, subscription-expiration enforcement fix (expired accounts no longer
silently kept access), an IDOR fix on `/api/email/messages/:messageId/attachments`, a
Stripe checkout promo-code fix, and the plan-comparison-table admin UI. All deployed and
verified working. Also live: PR #5 (CRM v2 media support) and several other sessions'
commits (`034b656`, `458357e`, `b9ad543`, `aec2f42`) — see `git log --oneline -10`.

## 2. ~~Committed but NOT yet deployed~~ — DEPLOYED (2026-09-17, ~15:03 CEST)

Built and `pm2 restart`ed successfully; verified 5/5 consecutive HTTP 200s, stable
uptime, no crash-restart, memory/CPU back to normal post-restart. The section below is
kept for the record of what shipped and why.

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

## 2b. Additional fixes deployed after §2 (same session, continued)

- `admin-routes.ts`'s live `/api/webhooks/stripe` handler: added idempotency (skip if
  the transaction is already `'completed'`) and fixed the date math to stack onto
  remaining time via `computeSubscriptionEndDate` instead of a flat `now+30d` on every
  Stripe retry. Commit `0e220a2`.
- Trial expiration: `plan-limits-service.checkSubscriptionExpiration` now actually
  compares `trialEndDate` to `now` for `status==='trial'` companies instead of always
  falling through to `isExpired:false`. Same commit `0e220a2`.
- Pause: `'paused'` now blocks access the same way `'cancelled'`/`'inactive'` already
  did (it was never checked at all before). Commit `955c8c3`. Deliberately left
  `resumeSubscription`'s "extend `subscriptionEndDate` by the pause duration" behavior
  untouched — that's a product call, not purely a bug fix.

All three commits: built, deployed, verified 3/3 HTTP 200 post-restart, tests still
204/204 (+3/3 for `subscription-expiration.test.ts`, which needs
`node --require dotenv/config --import tsx --test ...` to run standalone — a
pre-existing environment quirk, not a bug).

## 2c. Also deployed, same session

- Moyasar's two verification branches no longer treat `account_inactive_error` as
  "payment verified" (one of them was verifying against a client-supplied `paymentId`
  from `req.body` with no ownership check at all). Commit `1ea4468`.
- Plan resource limits are now real. `getCurrentUserCount`/`ContactCount`/`ChannelCount`/
  `FlowCount`/`CampaignCount` in `plan-limits-service.ts` were hardcoded `return 0`;
  replaced with real `COUNT(*)` queries scoped by `companyId` (contacts exclude
  archived/soft-deleted, flows exclude archived status), feeding directly into the
  creation-route enforcement in `routes.ts`/`campaigns.ts` that was already wired but
  always passing. Commit `1ae0c68`. **This is the one fix in this session with real
  customer-impact risk**: any company already over its plan's limits (e.g. more
  contacts than the plan allows) is now blocked from creating more of that resource
  type immediately, with no grace period or warning banner first. Deployed with the
  user's explicit informed approval ("Despliega ya, es lo correcto") after flagging
  that risk before deploying.

Running total this session: 9 distinct CRITICAL findings closed, deployed, verified
healthy (commits `9a58434`, `0e220a2`, `955c8c3`, `1ea4468`, `1ae0c68` on
`feature/crm-v2-security-hardening`).

## 2d. Refund / dispute access revocation

Closed both remaining "money taken back but access never revoked" CRITICAL findings
(commit `0538f58`):

- **Stripe** — the same live `/api/webhooks/stripe` handler fixed for idempotency in
  §2b gets two new cases: `charge.refunded` (full refunds only, via
  `amount_refunded >= amount`; resolves the owning company through the new
  `storage.getPaymentTransactionByPaymentIntentId()`) and `charge.dispute.created`
  (same revocation, immediately on dispute creation rather than waiting for it to
  resolve — the transaction row itself is left alone since a dispute can still be won,
  and `'disputed'` isn't one of its valid status values).
- **Mercado Pago** (`/api/webhooks/mercadopago`) — its existing `status === 'refunded'`
  branch only updated the `payment_transactions` row before; it now also sets the
  owning company's `subscriptionStatus` to `'cancelled'`, mirroring the Stripe fix.
- **Not covered**: PayPal/Moyasar/MPESA webhooks don't branch on refund/chargeback
  event types at all. Didn't chase this further since none of those is confirmed live
  for plan billing specifically (vs. one-off payments) — worth a quick check before
  assuming it's safe to leave.

Built, tested (204/204 on this fix's own diff; the shared working tree briefly showed
213 due to another concurrent session's uncommitted tests, unrelated to this change),
deployed, verified 3/3 HTTP 200 + stable `pm2 list`. See §0 for the `dist/`-went-missing
incident that happened while this fix was being deployed — unrelated to this fix's
content, purely environmental.

Running total this session: 11 distinct CRITICAL findings closed.

## 2e. activateSubscriptionAfterPayment idempotency (commit `e71304a`)

Closed the last purely-technical CRITICAL finding — the "still open" list in §3 is now
down to one item that genuinely needs a product decision first, not a bug fix.

`server/routes/enhanced-subscription.ts`'s `activateSubscriptionAfterPayment` is shared
by 12+ call sites across every payment provider's verification path, with zero
deduplication: a Stripe webhook redelivery, or simply replaying the unauthenticated
`GET /stripe/success?session_id=...` URL from browser history, re-extended
`subscriptionEndDate` every time for one single payment. Added a guard: before
extending, check whether a `subscription_renewed` event already exists in
`subscriptionEvents` for this exact `paymentId` (JSONB lookup on `eventData->>'paymentId'`,
scoped by `companyId`); if so, skip and return the existing end date unchanged.
`paymentId === 'unknown'` (the fallback some callers use when they have no real payment
id) is deliberately excluded from the check — treating it as a dedup key would risk
silently skipping a real, distinct renewal, which is worse than the bug being fixed.

Still dormant today (no `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` configured, verified
via `grep` on `.env` immediately before deploying), but now safe for whenever the
addon-billing launch turns Stripe on for real.

Built, tested (216/216 — 213 from `tests/integrations/*.test.ts` plus 3/3 from
`tests/subscription-expiration.test.ts`, which needs
`node --require dotenv/config --import tsx --test ...` to run standalone), deployed,
verified 3/3 HTTP 200 + stable `pm2 list`. **This build needed 8 attempts** — the host
was unusually memory-constrained this stretch of the session (confirmed genuine OOM via
`Killed` from a direct `vite build` invocation, not a code issue; zero swap is configured
on this host, so any other session's transient memory spike during the ~3-5 minute
"rendering chunks" step can hard-kill the build with no warning, regardless of how clear
memory looks right before starting). If you hit this, there's no real fix beyond
retrying — `NODE_OPTIONS --max-old-space-size` doesn't help since the kill is
OS-level RSS exhaustion, not a V8 heap limit. Given this fix wasn't live-exposed either
way, it was committed and pushed before the build succeeded, rather than leaving tested,
correct, security-relevant code sitting uncommitted in this shared working tree.

Running total this session: 12 distinct CRITICAL findings closed. Only "Downgrade
enforces nothing" (§3) remains open, and it needs a product decision before it can be
coded — flag it to the user rather than guessing at the intended behavior.

## 3. Found but NOT yet fixed — full audit results

Four parallel agents audited: (1) signup/first purchase, (2) renewal/grace
period/auto-renewal, (3) upgrade/downgrade/pause/cancellation, (4) Stripe webhook
integrity system-wide. Full agent transcripts are in this session's history if you need
the complete reasoning/file:line trail; below is the actionable summary.

### CRITICAL — still open

- **Downgrade enforces nothing.** Buying a cheaper plan doesn't deactivate excess
  users/channels/flows (only excess contacts get archived, via
  `plan-downgrade-service.ts`, and that service isn't even wired to the real checkout
  path — `payment-routes.ts` never calls it). Now that real plan-limit enforcement is
  live (§2c), an already-over-limit company that downgrades can't create *more* of that
  resource, but it also isn't forced back into compliance or charged for the excess —
  it just sits over-limit indefinitely. Still needs a product decision (hard block
  downgrade until under limits? soft-deactivate excess resources? grace period?) before
  it can be coded. **This is the only CRITICAL item left open**, and it's a product
  question, not a bug — surface it to the user rather than guessing.

### CRITICAL — fixed this session

Kept in full detail (rather than deleted) so whoever picks this up can verify the fix
against the original problem description. See §2/2b/2c/2d/2e for exactly what changed.

- ~~**`activateSubscriptionAfterPayment` has no idempotency guard at all.**~~ **FIXED,
  commit `e71304a` (§2e).** Was: `server/routes/enhanced-subscription.ts` — this
  shared function (12+ call sites) had no deduplication; a Stripe webhook redelivery, or
  replaying the unauthenticated `GET /stripe/success` URL, re-extended
  `subscriptionEndDate` every time for one payment. Now skips re-processing if a
  `subscription_renewed` event already exists for the same `paymentId`. Still dormant
  today (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` unset in `.env`), but ready for
  when addon-billing turns Stripe on.

- ~~**Plan resource limits don't exist.**~~ **FIXED, commit `1ae0c68` (§2c).** Was:
  `server/services/plan-limits-service.ts:571-599` —
  `getCurrentUserCount`/`getCurrentContactCount`/`getCurrentChannelCount`/
  `getCurrentFlowCount`/`getCurrentCampaignCount` were hardcoded `return 0`, so every
  `checkPlanLimit()` call (contact/channel/user/campaign creation routes) always passed.
- ~~**Pause doesn't block access, and resuming extends the paid-through date for
  free.**~~ **Partially FIXED, commit `955c8c3` (§2b).** `'paused'` now blocks access
  the same way `'cancelled'`/`'inactive'` do. Deliberately NOT touched: whether
  `resumeSubscription()` should keep extending `subscriptionEndDate` by the exact pause
  duration is a product call, not a pure bug — matching the UI's copy now requires
  someone to decide if that behavior is even still wanted once pause truly blocks access.
- ~~**Refunds never revoke access.**~~ **FIXED, commit `0538f58` (§2d).** Was: no
  `charge.refunded`/`charge.dispute.created` handler anywhere touched
  `subscriptionStatus` — confirmed for Mercado Pago (updated only the transaction row)
  and Stripe (no dispute handler existed at all). Now both revoke access. PayPal/
  Moyasar/MPESA still don't — see §2d "Not covered."
- ~~**Trials never expire in the enforcement path.**~~ **FIXED, commit `0e220a2`
  (§2b).** Was: `plan-limits-service.ts`'s expiration check never compared
  `trialEndDate` to `now`; only a manual superadmin sweep
  (`POST /api/admin/trials/process-expired`) ended a trial, and nothing called it
  automatically.
- ~~**The Stripe webhook endpoint actually configured in the admin UI has zero replay
  protection.**~~ **FIXED, commit `0e220a2` (§2b).** Was: every Stripe retry of
  `payment_intent.succeeded` re-extended `subscriptionEndDate = now + 30 days` — from
  *now*, not from the existing end date — on every redelivery. Now has an idempotency
  check and stacks onto the existing end date via `computeSubscriptionEndDate`, matching
  `activateSubscriptionAfterPayment`'s already-correct math.
- ~~**No Stripe-side cancellation/dispute awareness for plan subscriptions at
  all.**~~ **FIXED, commit `0538f58` (§2d).** `charge.dispute.created` now revokes
  access immediately rather than waiting for the dispute to resolve.
- ~~**Moyasar fails open.**~~ **FIXED, commit `1ea4468` (§2c).** Was:
  `server/payment-routes.ts` treated an `account_inactive_error` from Moyasar as
  "payment verified," including against a client-supplied `paymentId` with no prior
  validation.

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

1. ~~Get `feature/crm-v2-security-hardening` (§2) built and deployed~~ — done. 8 of 9
   original CRITICAL findings are now fixed and live (§2/2b/2c/2d/2e).
2. ~~Read `a8ca343`'s commit message and finish wiring whatever it left
   partially-done~~ — done by another session in `cfab0ad` (see §0).
3. ~~Fix `activateSubscriptionAfterPayment`'s idempotency gap~~ — done, §2e. The
   **only** CRITICAL item left is "Downgrade enforces nothing" (§3), and it needs a
   product decision before it can be coded — surface that to the user rather than
   guessing at hard-block vs. soft-deactivate vs. grace-period.
4. Merge PR A, then PR B (§4), after combining them per the user's request; merge
   `feature/crm-v2-security-hardening` itself too (§2/2b/2c/2d/2e, plus the other
   session's `cfab0ad`) — all pushed, none merged, all blocked only on the PR-creation
   403 (§0) needing a human to click the compare link.
5. Anything in MODERATE (§3) as time allows.
6. If `npm run build` starts failing at "rendering chunks..." with no error message,
   see §2e's note before assuming it's a code problem — this host has zero swap, so a
   build can get OOM-killed by another session's transient memory spike partway through,
   even when memory looked clear at the start. Just retry; there's no real fix beyond
   that (confirmed `NODE_OPTIONS --max-old-space-size` doesn't help, since it's an
   OS-level RSS kill, not a V8 heap limit).
