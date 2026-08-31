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

Local dep note: `packages/pointer-odontogram-module` (npm scope `@bothive/...`) is a
real, still-used dental odontogram UI package — must be built once via
`npm run build:odontogram` before `tsc`/`vite` can resolve it in a fresh clone
(no prebuilt `dist/` is committed).

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

**Still found, deliberately NOT touched — ask before changing:**
1. **`server/services/license-validator.ts:12`** —
   `ENCRYPTION_KEY = 'bothive-license-key-2024-secur'` is a real AES-256-CBC key
   used to encrypt/decrypt license data (not just display text). Rotating it
   would make any existing encrypted license data unreadable unless it's
   re-encrypted with the new key at the same time. Also unclear whether, now that
   the user owns the code outright, they even want to keep a license-gating
   mechanism at all versus removing it — that's a product decision, not a rename.
2. **The "BotHive" infra footprint (~90 files)**: env var *names*, `.env*` files,
   `docker-compose*.yml`, `Dockerfile*`, deploy/migration shell scripts under
   `scripts/`, the npm package scope `@bothive/pointer-odontogram-module`.
   Renaming env var names in code without simultaneously updating the actual
   values set on the live server would break the app on next restart — this
   environment has no access to that live server config to do both sides at
   once. Only pursue with an explicit migration plan (rename in code + deploy
   config together), not a find-and-replace.
3. **Committed `.env` / `.env.development` / `server/.env`** are tracked in git
   (not gitignored). They currently hold what look like local/dev values
   (`DATABASE_URL` points at `localhost`), not obviously live production secrets,
   but committing secret-shaped keys (`ENCRYPTION_KEY`, `SESSION_SECRET`) at all is
   bad practice — worth reviewing/rotating and gitignoring regardless of the
   rebrand work.

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
