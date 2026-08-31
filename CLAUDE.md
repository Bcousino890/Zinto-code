# Zinto CRM — repo knowledge base

This file exists so future sessions don't have to re-explore the whole repo from
scratch. Keep it updated as things change; it's a map, not a spec.

## What this is

A white-label, multi-tenant CRM / multi-channel inbox / AI chatbot / ERP platform.
The underlying (unreleased-to-end-users) platform name baked into the codebase as
defaults is **"BotHive"** / **"BotHivePlus"**. **"Zinto"** is this deployment's brand
(company: presumably "ZINTO TECHNOLOGIES LTD" — confirm exact legal name before using
it in legal text). The platform was originally built by a vendor called **"Pointer
Software"** (domain `pointer.pk`); a developer there, **"Abid Shafi"**, left personal
example data (name, phone `+923059002132`, `@pointer.pk` emails) scattered through demo
seeds, CSV examples, and test fixtures — being cleaned out (see "Rebrand" below).
The user has said they bought the complete codebase outright — full rebrand and
deeper changes are authorized, not just cosmetic text swaps, but still weigh
operational risk (see the "needs a decision" list below) before touching anything
that could break a live deployment.

**Live URLs**: marketing site `https://zinto.app/`, CRM app `https://crm.zinto.app/`
(login: `/auth`, signup: `/register`). Use `crm.zinto.app` for Google Cloud Console
OAuth redirect URIs (e.g. `https://crm.zinto.app/api/google/sheets/callback`,
`https://crm.zinto.app/api/google/calendar/callback`) and any other "our own app
domain" reference. Real contact details for default/legal page templates:
`support@zinto.app`, `pagos@zinto.app`, `contacto@zinto.app`, phone
`+34 641 457 123`.

Stack: Node/Express server (`server/`), React client (`client/src/`), Drizzle/Postgres
(`shared/schema.ts`, `migrations/`), Vite build, `npm run check` for a full-repo `tsc`
typecheck (no separate `client`/`server` tsconfigs — one root check).

Local dep note: `packages/pointer-odontogram-module` (npm scope `@zinto/...`, renamed
from `@bothive/...` — it's a local `file:` dependency, not a published registry
package, so the rename was a same-repo, low-risk `npm install`) is a real,
still-used dental odontogram UI package — must be built once via
`npm run build:odontogram` before `tsc`/`vite` can resolve it in a fresh clone
(no prebuilt `dist/` is committed).

**Deployment**: user is provisioning a new dedicated VPS (netcup VPS-1000 G12 IV) for
this specific Zinto deployment — no existing production server's env/DB names need to
be preserved for compatibility, which is why the round-3 infra rename below (docker,
env var names, DB name) was safe to do outright rather than just flagged.

## Branding system (important — read before touching "logo" or "app name" requests)

Branding is **dynamic and DB-driven**, not hardcoded image files:
- `client/src/contexts/branding-context.tsx` fetches `app_settings` rows keyed
  `branding`, `branding_logo`, `branding_favicon`, `branding_admin_auth_background`,
  `branding_user_auth_background` via `GET /public/branding` (or `/api/branding`),
  and applies them to `document.title`, `<link rel="icon">`, and CSS custom
  properties (`--brand-primary-color` etc.) at runtime, live-updated over the `/ws`
  socket (`settingsUpdated` events).
- `DEFAULT_BRANDING` in that file is only the fallback shown before settings load /
  if none are configured. `appName` default was `"BotHive"`, now `"Zinto"`.
- **Uploading the actual logo/favicon images is an Admin Settings UI action**
  (Admin → Settings → Branding), not a code change — an admin uploads files there
  and they're stored as the `branding_logo` / `branding_favicon` setting values
  (URLs). There is no static `/client/public/logo.png` to swap.
- `client/src/components/auth/BrandingLogo.tsx` renders `branding.logoUrl` if set,
  else a letter-avatar using `branding.appName.charAt(0)`.
- Google Cloud Console credentials for OAuth verification (see below) need their
  own separately-uploaded app icon; that's a Console-only step, not a repo file.

## Google OAuth integrations (Calendar + Sheets)

- `server/services/google-calendar.ts`: `SCOPES` const (top of file) — narrowed to
  `calendar.events` + `calendar.calendarlist.readonly` + `calendar.freebusy`
  (was the full `.../auth/calendar` scope; changed 2026-08 to match the Google
  verification "sensitive scopes" justification: check availability, let the user
  pick a calendar, create/edit/delete appointments — not calendar management/ACLs).
- `server/services/google-sheets.ts`: `SCOPES` const — `spreadsheets` + `drive.file`
  (was `spreadsheets` + `drive.readonly`). The old "Fetch my sheets" dropdown used
  `drive.files.list` to browse the whole Drive (needed the broad scope); it's been
  replaced with **Google Picker** (`client/src/lib/googlePicker.ts`, wired into
  `client/src/components/flow-builder/GoogleSheetsNode.tsx`). Backend exposes
  `GET /api/google/sheets/picker-config` (short-lived access token + Picker API key)
  via `GoogleSheetsService.getPickerConfig()`. The Picker API key is an admin
  setting (`google_sheets_oauth.picker_api_key`, set in Admin Settings →
  Integrations → Google Sheets) — needs a Browser API key from Google Cloud
  Console with the Picker API enabled, restricted to the app's domain.
- Both services follow the same admin-setting pattern: `app_settings` row keyed
  `google_calendar_oauth` / `google_sheets_oauth` = `{enabled, client_id,
  client_secret, redirect_uri, ...}`, managed from
  `client/src/pages/admin/settings/index.tsx` (search `googleSheetsOAuthForm` /
  `googleCalendarOAuthForm`) via `server/admin-routes.ts`
  (`/api/admin/settings/integrations/google-{sheets,calendar}`).
- Existing already-connected users keep whatever scope they originally granted
  until they reconnect — narrowing `SCOPES` only affects new authorizations.

## Rebrand status (BotHive/Pointer Software → Zinto) — as of 2026-08-31

**Fixed** (cosmetic, zero functional risk — literal default strings/labels):
default `appName` fallbacks across branding/landing/website-settings/password-reset/
email-verification/storage/routes/admin-routes, `X-Title` headers sent to OpenRouter,
PayPal `brand_name`, SMTP `fromName` default, invite-email copy, plan-expiration
user-facing block messages, browser notification text, 404-page support email
(`support@zinto.app`), sender-email fallback (`noreply@zinto.app`), OAuth
callback/test-page copy, webhook User-Agent string, a `flow-executor` webhook
`source` field, assorted code comments, and demo/example data that leaked the
original vendor's employee name/phone/email (`Abid Shafi`, `+923059002132`,
`*@pointer.pk` → generic `Jane Doe` / `example.com`-style placeholders) across
CSV examples, ERP demo seed, flow-builder doc examples, and translation strings.

**Fixed in round 2** (user confirmed they own the full codebase — authorized going
beyond pure cosmetics):
- `server/services/emergency-reset.ts` — rotated `EMERGENCY_SECRET` off the old
  vendor's name+phone string to a freshly generated random value, with an
  `EMERGENCY_RESET_SECRET` env var override available (not required).
- `server/services/plan-expiration-service.ts` — bypass check now looks for
  `company.name === 'Zinto Admin'` / `slug === 'zinto-admin'` (was
  `'BotHive Admin'`/`'bothive-admin'`). **If a company row already exists in the
  DB under the old name/slug relying on this bypass, it must be renamed to match
  or it silently loses the bypass** — nobody has DB access from this environment
  to check/fix that row directly.
- `server/services/google-drive-service.ts` — backup folder renamed to
  `'Zinto Backups'`. Existing backups stay in the old `'BotHive Backups'` folder
  in each user's Drive (not lost, just split across two folders going forward).
- `server/services/auto-update-service.ts` — `checkForUpdates()` now short-circuits
  to `return null` (updates are delivered as files per the user, not fetched from
  a hosted feed); removed the `releaseApiUrl` pointing at the old vendor's
  `releases.bothiveapp.net`. The `/api/auto-update/*` routes and admin "Check for
  updates" UI still exist but will just always report "no updates available."
- `shared/frontend-website-settings.ts` / `client/src/components/pages/PageEditor.tsx`
  — default Contact/About/Privacy page templates now use real Zinto contact info
  (`support@zinto.app`, `contacto@zinto.app`, `+34 641 457 123`) instead of
  `support@example.com` / `+1 (555) 123-4567` placeholders. (Left untouched:
  input-field placeholder hints like `placeholder="support@company.com"` or
  Twilio number format examples — those are format hints for admins typing their
  *own* numbers/emails, not displayed Zinto contact info; and demo/webhook sample
  data like `'Jane Doe' / '+15551234567'` — fake customer data, not a contact
  channel.)

**Fixed in round 3** (new dedicated VPS being provisioned — no existing live
deployment's env/DB names to preserve, so the infra layer was renamed too):
- `docker-compose.yml`: container names → `zinto-postgres`/`zinto-app`, DB name
  `bothive`→`zinto`, named volumes `bothive_*`→`zinto_*`, and the hardcoded
  `SESSION_SECRET=bothive-docker-secret` rotated to a random value (was a
  guessable, publicly-known-in-source session-signing secret).
- `Dockerfile` / `Dockerfile.deploy` / `Dockerfile.simple`: `PGDATABASE` default,
  `ADMIN_EMAIL`/`COMPANY_NAME` build-arg defaults → Zinto values. (`Dockerfile`
  still has a `sed`-based find/replace step that swaps `BotHive`/
  `admin@bothiveapp.net` for the `COMPANY_NAME`/`ADMIN_EMAIL` build args across
  the built `dist` — that's the platform's *original* white-label mechanism for
  branding each customer's build; harmless to leave, now mostly a no-op since
  source no longer contains those literals.)
- `drizzle.config.js`, `init-db.sql`, `migrate.sh`, `docker-entrypoint.sh`,
  `start.js`, `.env`/`.env.development`/`server/.env` — default/local DB name
  and startup-banner text → `zinto`/`Zinto`.
- `server/utils/server-i18n.ts`, `server/services/erp-invoice-pdf-fonts.ts`:
  optional env var overrides `BOTHIVE_APP_ROOT`/`BOTHIVE_TRANSLATIONS_DIR`/
  `BOTHIVE_PDF_FONTS_DIR` → `ZINTO_*` (clean rename, no back-compat shim — these
  are obscure advanced overrides unlikely to be set anywhere yet).
- npm package scope `@bothive/pointer-odontogram-module` → `@zinto/...` (root
  `package.json`, the subpackage's own `package.json` name, the import in
  `client/src/pages/erp/dental/chart.tsx`), then `npm install` to regenerate the
  root lockfile cleanly.
- Misc internal-only identifiers with zero external visibility: browser
  localStorage/IndexedDB key names (`embed-context.ts`, `message-cache.ts`,
  `ActiveChannelContext.tsx`, `emoji-picker.tsx`), the odontogram module's UMD
  global name, WhatsApp echo-dedup in-memory map/type names in
  `channels/whatsapp.ts`, MCP client name, OpenRouter `HTTP-Referer` header
  (→ `https://zinto.app`), backup filename prefix + temp verify-DB name in
  `backup-service.ts`, a Paystack no-email fallback, and comments in a handful
  of migration files.
- `server/auth.ts` — the `SESSION_SECRET` fallback (used only if the env var
  isn't set) was also a guessable hardcoded string; rotated to a random value.

**Fixed in round 4** (user said: rename the persistent-data markers too, despite
the migration risk; and keep + rebrand the multi-instance tooling — they'll run
several VPS at once once they grow):
- `server/services/calendar-contact-privacy.ts` — private-property keys and
  description-text markers now write `zintoContactId`/`zintoContactPhone` /
  `zinto_contact_id:`/`zinto_contact_phone:` going forward, but every read path
  (ownership check, dedup check, customer-facing description sanitizer) still
  also matches the legacy `bothive*` names/markers — so events created before
  this change are still correctly recognized, only new events get the new keys.
- `server/services/google-calendar.ts` — new events get an extended property
  named `zintoIdempotencyKey`. The idempotency lookup
  (`findExistingEventByIdempotencyKey`) now tries `zintoIdempotencyKey` first
  and falls back to a second query by the legacy `bothiveIdempotencyKey` if
  nothing matches, so a retry spanning the rename still finds its event instead
  of creating a duplicate booking.
- `server/routes.ts` (`/api/google/calendar/webhook`) — now reads
  `x-zinto-user-id`/`x-zinto-company-id` first, falling back to the legacy
  `x-bothive-user-id`/`x-bothive-company-id`, then the `?userId`/`?companyId`
  query params. Nothing in this repo was found to actually send the legacy
  headers, but kept the fallback since the real sender (if any) is external
  and unconfirmed.
- The multi-instance reseller tooling (`install.sh`, `deploy-instance.sh`,
  `manage-instance.sh`, `customize-instance.sh`, `customize-migration.sh`,
  `quick-setup.sh`, `validate-setup.sh`, `monitor-resources.sh`,
  `docker-restart-monitor.sh`, `start-with-monitor.sh`,
  `test-docker-autoupdate.sh`, `backup-all.sh`, `manage-migrations.sh`,
  `docker-compose.template.yml`) — kept (user plans multiple simultaneous VPS
  instances once they grow) and rebranded: container/volume/network name
  prefixes, the Postgres user/DB name pattern, and banner/log text all now say
  `zinto`/`Zinto` instead of `bothive`/`BotHive`. Important nuance in
  `customize-instance.sh`/`customize-migration.sh`: these scripts' whole job is
  to `sed`-replace a base placeholder brand with each deployed instance's own
  `COMPANY_NAME` — they used to search for literal `BotHive`/
  `admin@bothiveapp.net`; now they correctly search for `Zinto`/
  `admin@zinto.app` instead (the brand now actually baked into the source), so
  deploying a new white-labeled instance for a future sub-customer still works
  the same way it always did, just rebased on Zinto instead of BotHive.

**Still found, deliberately NOT touched:**
**`server/services/license-validator.ts:12`** and **`scripts/build-licensed.js`**
(same key duplicated in both) — `ENCRYPTION_KEY = 'bothive-license-key-2024-secur'`
is a real AES-256-CBC key used to encrypt/decrypt license data (not just display
text). Rotating it would make any existing encrypted license data unreadable
unless it's re-encrypted with the new key at the same time. Also unclear whether,
now that the user owns the code outright, they even want to keep a license-gating
mechanism at all versus removing it — that's a product decision, not a rename.
**User said: revisit this in ~1 week (asked 2026-08-31); a reminder is scheduled.**

**Confirmed zero hits in this repo**: "PowerChat", "Ninnat", "Megacom" — not found
anywhere in code/translations/config. If the user still sees these names, they're
likely in a different system entirely (Meta/WhatsApp Business Manager app name,
Google Cloud project name, domain registrar, app store listing, DB content) — not
something a code search can find.

## Where to look for things

- Branding/white-label: `client/src/contexts/branding-context.tsx`,
  `client/src/pages/admin/settings/index.tsx` (huge file, many integration sections),
  `shared/frontend-website-settings.ts`, `shared/landing-page-content.ts`.
- Google integrations: `server/services/google-{calendar,sheets,drive-service}.ts`,
  routes registered in `server/routes.ts` under `/api/google/...`.
- WhatsApp/channels: `server/services/channels/*.ts`.
- ERP: `server/services/erp/*`, `server/routes/erp/*`, `client/src/pages/erp/*`.
- Flow builder (chatbot flow automation): `server/services/flow-executor.ts`
  (huge), `client/src/components/flow-builder/*Node.tsx`.
- Translations: `translations/en.json`, `translations/es.json` — flat
  `{key, value}` array, not nested JSON.
