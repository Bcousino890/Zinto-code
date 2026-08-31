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

**Found but deliberately NOT touched — needs a decision, ask before changing:**
1. **`server/services/emergency-reset.ts:4`** —
   `EMERGENCY_SECRET = 'PointerSoftwareSystems@923059002132'`. A hardcoded
   password (containing the old vendor's name + what looks like a real phone
   number) that gates an "emergency admin access" HTTP route. This is a real
   security exposure independent of branding — anyone who knows/guesses this
   string can hit that endpoint. Should be rotated to a random secret sourced
   from an environment variable, not hardcoded in source. Not changed because
   swapping it silently could lock out whoever currently relies on it, and moving
   it to an env var requires that var to be set in production before deploy.
2. **`server/services/plan-expiration-service.ts:121`** —
   `company.name === 'BotHive Admin' || company.slug === 'bothive-admin'` bypasses
   plan-expiration checks entirely for a company with that exact name/slug. Unknown
   whether such a row still exists in production and is still needed. Don't rename
   the string without first checking the `companies` table and deciding what (if
   anything) replaces this bypass.
3. **`server/services/google-drive-service.ts`** — backup folder is named
   `'BotHive Backups'` (`ensureBackupFolder()`), found/created by exact name.
   Renaming the string starts a *new* Drive folder going forward; existing backups
   stay in the old-named folder (not lost, just split across two folders unless
   handled explicitly).
4. **`server/services/auto-update-service.ts:41`** —
   `releaseApiUrl = 'https://releases.bothiveapp.net/updates'`. The app's
   auto-update mechanism points at a domain owned by the original platform vendor.
   Need to know whether this is still a real, relied-upon update channel (leave
   alone / point at Zinto's own release server) or dead code (safe to remove).
5. **The "BotHive" infra footprint (~90 files)**: env var names, `.env*` files,
   `docker-compose*.yml`, `Dockerfile*`, deploy/migration shell scripts under
   `scripts/`, `server/utils/secure-env.ts`, `server/services/license-validator.ts`,
   the npm package scope `@bothive/pointer-odontogram-module`. This is the
   underlying platform's infrastructure naming, not just display text — renaming
   risks breaking secret decryption, license validation, auto-update, or deployed
   container/volume names. **Not touched.** Only pursue this with an explicit,
   tested migration plan, not a find-and-replace.
6. **Committed `.env` / `.env.development` / `server/.env`** are tracked in git
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
