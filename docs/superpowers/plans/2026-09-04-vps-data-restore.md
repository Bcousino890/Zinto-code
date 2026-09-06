# VPS Data Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the validated 13 August Zinto backup into the production VPS while preserving the current application source code and a tested rollback path.

**Architecture:** Restore the PostgreSQL dump and filesystem archives into isolated staging names, validate them against the current application, then perform a short PM2 maintenance cutover by renaming the database and directories. Preserve the current `.env`, source tree, build, and deployment configuration; retain timestamped pre-restore database and filesystem copies for rollback.

**Tech Stack:** PostgreSQL 17, `pg_dump`/`pg_restore`, Node.js, PM2, Bash, gzip/tar, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-04-vps-data-restore-design.md`

## Global Constraints

- Do not replace or edit application source code as part of the data restore.
- Do not import the backup `.env`, Docker configuration, PM2 configuration, or historical migration files into production.
- Do not print database URLs, credentials, app settings values, personal data, or WhatsApp session contents.
- Every destructive-looking cutover action requires a verified pre-restore backup and an explicit rollback command.
- Keep the current database and directories until post-cutover verification passes.
- Disable or replace historical third-party secrets before enabling restored integrations.

---

### Task 1: Capture the production baseline and immutable restore inputs

**Files:**
- Read: `/home/deploy/zinto/.env`
- Read: `/home/deploy/zinto/package.json`
- Read: `/home/deploy/zinto/uploads/`
- Read: `/home/deploy/zinto/whatsapp-sessions/`
- Input: `/home/deploy/.codex/attachments/b2be23f8-af0c-461b-a73a-eeec0b8af068/zinto-bcousinoprop-respaldo-completo.tar.gz`
- Create: `/home/deploy/zinto/backups/restore-<UTC timestamp>/`

**Interfaces:**
- Consumes: Current PM2 process `zinto` and `DATABASE_URL` from the active `.env`.
- Produces: `RESTORE_RUN`, a private run directory containing the validated source archive, baseline metadata, database dump, uploads archive, and WhatsApp archive.

- [ ] **Step 1: Create a private timestamped run directory**

```bash
cd /home/deploy/zinto
RESTORE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RESTORE_RUN="/home/deploy/zinto/backups/restore-${RESTORE_STAMP}"
install -d -m 700 "$RESTORE_RUN/input" "$RESTORE_RUN/current" "$RESTORE_RUN/staged"
```

- [ ] **Step 2: Validate and copy the uploaded backup**

```bash
SOURCE_BACKUP="/home/deploy/.codex/attachments/b2be23f8-af0c-461b-a73a-eeec0b8af068/zinto-bcousinoprop-respaldo-completo.tar.gz"
gzip -t "$SOURCE_BACKUP"
cp --preserve=mode,timestamps "$SOURCE_BACKUP" "$RESTORE_RUN/input/"
sha256sum "$RESTORE_RUN/input/zinto-bcousinoprop-respaldo-completo.tar.gz" > "$RESTORE_RUN/input/archive.sha256"
chmod 600 "$RESTORE_RUN/input/"*
```

- [ ] **Step 3: Record a secret-free operational baseline**

```bash
git rev-parse HEAD > "$RESTORE_RUN/current/git-head.txt"
pm2 pid zinto > "$RESTORE_RUN/current/pm2-pid.txt"
pm2 show zinto | sed -E '/(env|secret|token|password|key)/Id' > "$RESTORE_RUN/current/pm2-summary.txt"
du -sb uploads whatsapp-sessions > "$RESTORE_RUN/current/filesystem-sizes.txt"
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9000/ >/dev/null
```

- [ ] **Step 4: Create recoverable production backups before staging**

```bash
set -a
. /home/deploy/zinto/.env
set +a
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$RESTORE_RUN/current/database-before.dump"
tar -czf "$RESTORE_RUN/current/uploads-before.tar.gz" -C /home/deploy/zinto uploads
tar -czf "$RESTORE_RUN/current/whatsapp-sessions-before.tar.gz" -C /home/deploy/zinto whatsapp-sessions
gzip -t "$RESTORE_RUN/current/uploads-before.tar.gz"
gzip -t "$RESTORE_RUN/current/whatsapp-sessions-before.tar.gz"
pg_restore --list "$RESTORE_RUN/current/database-before.dump" >/dev/null
sha256sum "$RESTORE_RUN/current/"*.dump "$RESTORE_RUN/current/"*.tar.gz > "$RESTORE_RUN/current/SHA256SUMS"
```

- [ ] **Step 5: Commit the operational plan before changing production data**

```bash
git add -f docs/superpowers/plans/2026-09-04-vps-data-restore.md
git commit -m "docs: plan production VPS data restore"
```

### Task 2: Restore and validate an isolated staging database

**Files:**
- Extract: `$RESTORE_RUN/input/zinto-bcousinoprop-respaldo-completo.tar.gz`
- Create: PostgreSQL database `zinto_restore_<UTC timestamp>`
- Create: `$RESTORE_RUN/staged/sensitive-app-settings.csv`

**Interfaces:**
- Consumes: `RESTORE_RUN` from Task 1 and active `DATABASE_URL`.
- Produces: `STAGE_DB` and `STAGE_URL`, a restored database that has passed structural and data checks.

- [ ] **Step 1: Extract only into the private run directory and verify bundled checksums**

```bash
tar -xzf "$RESTORE_RUN/input/zinto-bcousinoprop-respaldo-completo.tar.gz" -C "$RESTORE_RUN/input"
BACKUP_ROOT="$RESTORE_RUN/input/zinto-bcousinoprop-20260813-005148"
(cd "$BACKUP_ROOT" && sed 's#  .*/#  #' SHA256SUMS | sha256sum -c -)
```

- [ ] **Step 2: Derive a staging URL without displaying its password**

```bash
STAGE_DB="zinto_restore_$(date -u +%Y%m%d%H%M%S)"
STAGE_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/"+process.argv[1];process.stdout.write(u.toString())' "$STAGE_DB")"
printf '%s\n' "$STAGE_DB" > "$RESTORE_RUN/staged/database-name.txt"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v stage="$STAGE_DB" -c 'CREATE DATABASE :"stage"'
```

- [ ] **Step 3: Restore the full dump without historical ownership or grants**

```bash
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$STAGE_URL" "$BACKUP_ROOT/database-full.dump"
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -c 'ANALYZE;'
```

- [ ] **Step 4: Replace historical sensitive settings with current production values**

```bash
SENSITIVE_KEYS="payment_stripe,payment_paypal,google_calendar_oauth,google_sheets_oauth,zoho_calendar_oauth,calendly_oauth,smtp_config,ses_config,google_maps_api_key"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v keys="$SENSITIVE_KEYS" -c "\copy (SELECT * FROM app_settings WHERE key = ANY(string_to_array(:'keys', ','))) TO '$RESTORE_RUN/staged/sensitive-app-settings.csv' CSV"
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -v keys="$SENSITIVE_KEYS" -c "DELETE FROM app_settings WHERE key = ANY(string_to_array(:'keys', ','));"
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -c "\copy app_settings FROM '$RESTORE_RUN/staged/sensitive-app-settings.csv' CSV"
chmod 600 "$RESTORE_RUN/staged/sensitive-app-settings.csv"
```

- [ ] **Step 5: Verify restored companies and plans exactly**

```bash
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT id||':'||slug||':'||active FROM companies WHERE id IN (2,3) ORDER BY id" | diff -u - <(printf '2:zinto:true\n3:bcousinoprop:true\n')
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT name||':'||price FROM plans WHERE id IN (2,3,4,5) ORDER BY id" | diff -u - <(printf 'Inicial:39.00\nPro:99.00\nPremium:199.00\nBusiness:399.00\n')
psql "$STAGE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM pg_constraint WHERE NOT convalidated" | grep -qx '0'
```

- [ ] **Step 6: Compare migration state with the current code**

```bash
DATABASE_URL="$STAGE_URL" npm run db:migrate:status
DATABASE_URL="$STAGE_URL" npm run db:migrate:validate
```

If validation reports migrations required by the current code, run only the repository's migration runner against staging and repeat validation:

```bash
DATABASE_URL="$STAGE_URL" npm run db:migrate
DATABASE_URL="$STAGE_URL" npm run db:migrate:validate
```

### Task 3: Stage and validate uploads and WhatsApp sessions

**Files:**
- Read: `$BACKUP_ROOT/uploads.tar.gz`
- Read: `$BACKUP_ROOT/whatsapp-sessions.tar.gz`
- Create: `$RESTORE_RUN/staged/uploads/`
- Create: `$RESTORE_RUN/staged/whatsapp-sessions/`

**Interfaces:**
- Consumes: Validated nested archives from Task 2.
- Produces: Private filesystem trees ready for atomic cutover.

- [ ] **Step 1: Reject unsafe archive members**

```bash
python3 - "$BACKUP_ROOT/uploads.tar.gz" "$BACKUP_ROOT/whatsapp-sessions.tar.gz" <<'PY'
import pathlib, sys, tarfile
for path in sys.argv[1:]:
    with tarfile.open(path, "r:gz") as archive:
        for member in archive:
            name = pathlib.PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or member.issym() or member.islnk():
                raise SystemExit(f"unsafe archive member in {path}")
PY
```

- [ ] **Step 2: Extract the staged filesystem trees**

```bash
install -d -m 750 "$RESTORE_RUN/staged/uploads"
install -d -m 700 "$RESTORE_RUN/staged/whatsapp-sessions"
tar -xzf "$BACKUP_ROOT/uploads.tar.gz" -C "$RESTORE_RUN/staged/uploads"
tar -xzf "$BACKUP_ROOT/whatsapp-sessions.tar.gz" -C "$RESTORE_RUN/staged/whatsapp-sessions"
find "$RESTORE_RUN/staged/uploads" -type f -readable | wc -l | tee "$RESTORE_RUN/staged/uploads-count.txt"
find "$RESTORE_RUN/staged/whatsapp-sessions" -type f -readable | wc -l | tee "$RESTORE_RUN/staged/whatsapp-files-count.txt"
test -f "$RESTORE_RUN/staged/uploads/branding/logo-1767368805986-132544329.png"
test -f "$RESTORE_RUN/staged/uploads/companies/3/logo.png"
```

- [ ] **Step 3: Apply restrictive runtime ownership and permissions**

```bash
chown -R deploy:deploy "$RESTORE_RUN/staged/uploads" "$RESTORE_RUN/staged/whatsapp-sessions"
find "$RESTORE_RUN/staged/uploads" -type d -exec chmod 750 {} +
find "$RESTORE_RUN/staged/uploads" -type f -exec chmod 640 {} +
find "$RESTORE_RUN/staged/whatsapp-sessions" -type d -exec chmod 700 {} +
find "$RESTORE_RUN/staged/whatsapp-sessions" -type f -exec chmod 600 {} +
```

### Task 4: Perform the reversible production cutover

**Files:**
- Rename: `/home/deploy/zinto/uploads` to `/home/deploy/zinto/uploads.pre-restore-<timestamp>`
- Rename: `/home/deploy/zinto/whatsapp-sessions` to `/home/deploy/zinto/whatsapp-sessions.pre-restore-<timestamp>`
- Install: staged `uploads` and `whatsapp-sessions`
- Rename: database `zinto` to `zinto_pre_restore_<timestamp>`
- Rename: staged database to `zinto`

**Interfaces:**
- Consumes: `STAGE_DB`, staged filesystem trees, and verified current backups.
- Produces: Production application connected to restored data with old state retained under timestamped names.

- [ ] **Step 1: Take a final write-consistent database dump and stop PM2**

```bash
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > "$RESTORE_RUN/current/database-at-cutover.dump"
pg_restore --list "$RESTORE_RUN/current/database-at-cutover.dump" >/dev/null
pm2 stop zinto
```

- [ ] **Step 2: Terminate database connections and atomically rename databases**

```bash
MAINT_URL="$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/postgres";process.stdout.write(u.toString())')"
OLD_DB="zinto_pre_restore_${RESTORE_STAMP}"
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -v stage="$STAGE_DB" -v old="$OLD_DB" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('zinto', :'stage') AND pid <> pg_backend_pid();
ALTER DATABASE zinto RENAME TO :"old";
ALTER DATABASE :"stage" RENAME TO zinto;
SQL
printf '%s\n' "$OLD_DB" > "$RESTORE_RUN/current/rollback-database-name.txt"
```

- [ ] **Step 3: Swap filesystem directories without deleting the old data**

```bash
cd /home/deploy/zinto
mv uploads "uploads.pre-restore-${RESTORE_STAMP}"
mv whatsapp-sessions "whatsapp-sessions.pre-restore-${RESTORE_STAMP}"
mv "$RESTORE_RUN/staged/uploads" uploads
mv "$RESTORE_RUN/staged/whatsapp-sessions" whatsapp-sessions
```

- [ ] **Step 4: Start production and capture immediate health evidence**

```bash
pm2 start zinto
pm2 save
for attempt in 1 2 3 4 5 6; do
  curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9000/ >/dev/null && break
  sleep 5
done
pm2 show zinto | rg 'status|uptime|restarts'
pm2 logs zinto --lines 100 --nostream | rg -i 'error|fatal|panic|migration|database' || true
```

### Task 5: Verify production and either accept or roll back

**Files:**
- Read: production database and application endpoints.
- Preserve: `$RESTORE_RUN/current/` and the timestamped pre-restore directories.

**Interfaces:**
- Consumes: Cut-over production environment from Task 4.
- Produces: Verified restored production or a verified rollback to the former production state.

- [ ] **Step 1: Verify database identity and required commercial records**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT id||':'||slug||':'||active FROM companies WHERE id IN (2,3) ORDER BY id" | diff -u - <(printf '2:zinto:true\n3:bcousinoprop:true\n')
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -Atqc "SELECT name||':'||price FROM plans WHERE id IN (2,3,4,5) ORDER BY id" | diff -u - <(printf 'Inicial:39.00\nPro:99.00\nPremium:199.00\nBusiness:399.00\n')
```

- [ ] **Step 2: Verify HTTP, uploads, and process stability**

```bash
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9000/ >/dev/null
test -f /home/deploy/zinto/uploads/branding/logo-1767368805986-132544329.png
test -f /home/deploy/zinto/uploads/companies/3/logo.png
test "$(pm2 pid zinto)" -gt 0
sleep 30
pm2 show zinto | rg 'online'
```

- [ ] **Step 3: Record non-sensitive entity counts for comparison**

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -AtF, -c "SELECT 'users',count(*) FROM users UNION ALL SELECT 'contacts',count(*) FROM contacts UNION ALL SELECT 'conversations',count(*) FROM conversations UNION ALL SELECT 'messages',count(*) FROM messages ORDER BY 1" | tee "$RESTORE_RUN/staged/production-counts.csv"
```

- [ ] **Step 4: Roll back immediately if any critical verification fails**

```bash
pm2 stop zinto
FAILED_DB="zinto_failed_${RESTORE_STAMP}"
psql "$MAINT_URL" -v ON_ERROR_STOP=1 -v failed="$FAILED_DB" -v old="$OLD_DB" <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('zinto', :'old') AND pid <> pg_backend_pid();
ALTER DATABASE zinto RENAME TO :"failed";
ALTER DATABASE :"old" RENAME TO zinto;
SQL
mv uploads "uploads.failed-${RESTORE_STAMP}"
mv "uploads.pre-restore-${RESTORE_STAMP}" uploads
mv whatsapp-sessions "whatsapp-sessions.failed-${RESTORE_STAMP}"
mv "whatsapp-sessions.pre-restore-${RESTORE_STAMP}" whatsapp-sessions
pm2 start zinto
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9000/ >/dev/null
```

- [ ] **Step 5: Mark a successful restore without deleting rollback assets**

```bash
printf 'restore=%s\ncompleted_utc=%s\nrollback_database=%s\n' "$RESTORE_STAMP" "$(date -u +%FT%TZ)" "$OLD_DB" > "$RESTORE_RUN/RESTORE-COMPLETE.txt"
chmod 600 "$RESTORE_RUN/RESTORE-COMPLETE.txt"
```

### Task 6: Publish the auditable documentation to `main`

**Files:**
- Publish: `docs/superpowers/specs/2026-09-04-vps-data-restore-design.md`
- Publish: `docs/superpowers/plans/2026-09-04-vps-data-restore.md`

**Interfaces:**
- Consumes: Successful Task 5 verification.
- Produces: Remote `main` containing the restoration design and plan; GitHub Actions rebuilds the unchanged application code.

- [ ] **Step 1: Verify the working tree and commits**

```bash
git status --short --branch
git log -3 --oneline
git diff origin/main...HEAD --stat
```

- [ ] **Step 2: Push the audited documentation commits to `main`**

```bash
git push origin main
```

- [ ] **Step 3: Verify the post-push deployment did not regress production**

```bash
git fetch origin main
test "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)"
pm2 show zinto | rg 'online'
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:9000/ >/dev/null
```
