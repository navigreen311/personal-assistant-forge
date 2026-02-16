# Worker 20: Infrastructure Fixes (Docker, CI, Env, CSP, Settings)

## Branch

`ai-feature/p3-w20-infrastructure`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying or creating files within these paths. Do NOT touch any files outside this list:

- `docker-compose.yml` (modify)
- `.env.example` (modify)
- `.github/workflows/ci.yml` (modify)
- `next.config.ts` (modify)
- `src/app/(dashboard)/settings/page.tsx` (modify)
- `tests/unit/settings/danger-zone.test.ts` (create)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `tests/unit/settings/settings-api.test.ts` (already exists, do NOT touch)

## Context (read these first before making changes)

Read each file you will modify to understand the current state:

1. **`docker-compose.yml`** -- Three services: `app` (Next.js on port 3000), `postgres` (PostgreSQL 16-alpine on port 5432), `redis` (Redis 7-alpine on port 6379). The app depends on postgres and redis with health checks. Uses `paf-network` bridge network. Two volumes: `postgres-data` and `redis-data`. Currently **missing** a migration init step — the app starts without running `prisma migrate deploy` first.
2. **`.env.example`** -- 19 environment variables across sections: Database, Auth, AI/LLM, Voice/Telephony, TTS/STT, Integrations, Redis/Queue, Storage, Monitoring. Currently **missing** 6 variables: `EMAIL_FROM`, `SENDGRID_API_KEY`, `VAULT_MASTER_KEY`, `ALLOWED_ORIGIN`, `CORS_ALLOWED_ORIGINS`, `STRIPE_WEBHOOK_SECRET`.
3. **`.github/workflows/ci.yml`** -- Three jobs: `lint-typecheck-test` (lint, typecheck, jest with coverage), `build` (Next.js build), `docker` (Docker build, only on push to master). Currently **missing** security scanning steps (npm audit, security linting).
4. **`next.config.ts`** -- Image optimization config, security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, X-DNS-Prefetch-Control, HSTS, Permissions-Policy), API cache control, logging, experimental server actions. Currently **missing** Content-Security-Policy header.
5. **`src/app/(dashboard)/settings/page.tsx`** -- Full settings page with 7 tabs: Profile, Appearance, Notifications, Regional, Entities, API Keys, Danger Zone. The Danger Zone tab has a "Delete Account" button that opens a confirmation dialog, but the confirmation dialog has placeholder UI — the "Confirm Delete" button does nothing and there is a note: "Account deletion is not yet implemented. This is placeholder UI." The `showDeleteConfirm` state exists but the confirmation flow is incomplete (no "type DELETE to confirm" and no API call).

## Requirements

### 1. Add Migration Init Service to `docker-compose.yml`

Read the existing `docker-compose.yml` first.

Add a new `init` service that runs Prisma migrations before the app starts:

```yaml
  init:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: paf-init
    command: npx prisma migrate deploy
    environment:
      - DATABASE_URL=postgresql://paf_user:paf_password@postgres:5432/paf_dev
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - paf-network
    restart: "no"
```

Update the `app` service to depend on `init`:
```yaml
    depends_on:
      init:
        condition: service_completed_successfully
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
```

### 2. Add Missing Environment Variables to `.env.example`

Read the existing `.env.example` first.

Add the following 6 variables in appropriate sections. Place them after the existing sections or create new section headers:

After the Monitoring section, add:

```
# Email
EMAIL_FROM=noreply@example.com
SENDGRID_API_KEY=SG.your-key-here

# Security / Encryption
VAULT_MASTER_KEY=your-32-byte-hex-key

# CORS
ALLOWED_ORIGIN=http://localhost:3000
CORS_ALLOWED_ORIGINS=http://localhost:3000

# Payments
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret
```

### 3. Add Security Scanning to `.github/workflows/ci.yml`

Read the existing `ci.yml` first.

Add an `npm audit` step in the `lint-typecheck-test` job, immediately after "Install dependencies":

```yaml
      - name: Security audit
        run: npm audit --audit-level=moderate || true
```

Note: The `|| true` ensures the build doesn't fail on audit warnings, but the output is still visible in CI logs.

Add a new `security` job after the `build` job:

```yaml
  security:
    name: Security Scan
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-typecheck-test

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Check for known vulnerabilities
        run: npx --yes audit-ci --high
        continue-on-error: true
```

### 4. Add Content-Security-Policy Header to `next.config.ts`

Read the existing `next.config.ts` first.

Add a CSP header to the existing `source: '/(.*)'` headers array, after the existing `Permissions-Policy` header:

```typescript
{
  key: 'Content-Security-Policy',
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: *.googleapis.com *.gravatar.com *.githubusercontent.com",
    "font-src 'self' fonts.gstatic.com",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
},
```

### 5. Implement Danger Zone Account Deletion in `settings/page.tsx`

Read the existing `settings/page.tsx` first.

Replace the placeholder Danger Zone confirmation dialog with a fully functional implementation:

a. Add a new state variable: `const [deleteConfirmText, setDeleteConfirmText] = useState('');`
b. Add a new state variable: `const [deleting, setDeleting] = useState(false);`

c. Replace the existing `showDeleteConfirm` block with:
- An input field prompting user to type "DELETE" to confirm.
- A "Confirm Delete" button that is disabled until `deleteConfirmText === 'DELETE'`.
- On click, the button calls a `handleDeleteAccount` function that:
  1. Sets `deleting` to true.
  2. Calls `fetch('/api/settings', { method: 'DELETE' })`.
  3. On success, redirects to `/login` using `window.location.href = '/login'`.
  4. On failure, shows an error message.
  5. Sets `deleting` to false in finally block.
- Remove the "Account deletion is not yet implemented" placeholder text.

d. Add the `handleDeleteAccount` async function above the return statement.

e. Reset `deleteConfirmText` when the cancel button is clicked.

### 6. Write Danger Zone Confirmation Test

Create `tests/unit/settings/danger-zone.test.ts`:

Test the confirmation logic (can test as utility functions or use React Testing Library if available):

Test cases (minimum 3):
1. Delete button should only be enabled when confirmation text exactly matches "DELETE"
2. Cancel button should reset the confirmation text and hide the dialog
3. Successful deletion should redirect to `/login`

If React Testing Library (`@testing-library/react`) is not available, test the logic as pure functions:
- Extract the confirmation check (`text === 'DELETE'`) into a testable helper.
- Test the helper function with various inputs.

## Acceptance Criteria

- [ ] `docker-compose.yml` has an `init` service running `npx prisma migrate deploy` before app starts.
- [ ] `app` service depends on `init` with `service_completed_successfully` condition.
- [ ] `.env.example` includes all 6 missing environment variables with placeholder values and comments.
- [ ] `.github/workflows/ci.yml` has `npm audit` step after install.
- [ ] `.github/workflows/ci.yml` has a new `security` job with audit and vulnerability scanning.
- [ ] `next.config.ts` includes Content-Security-Policy header with all specified directives.
- [ ] CSP allows `unsafe-eval` and `unsafe-inline` for Next.js compatibility.
- [ ] Settings Danger Zone has a "type DELETE to confirm" input field.
- [ ] Delete button is disabled until user types "DELETE" exactly.
- [ ] Clicking "Confirm Delete" calls `DELETE /api/settings` and redirects to `/login` on success.
- [ ] `tests/unit/settings/danger-zone.test.ts` exists with 3+ test cases.
- [ ] All tests pass: `npx jest tests/unit/settings --passWithNoTests`.
- [ ] No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or `prisma/schema.prisma`.
- [ ] No modifications to any file outside Owned Paths.

## Implementation Steps

1. Read all Context files listed above.
2. **docker-compose.yml**:
   a. Read the existing file.
   b. Add the `init` service definition between the `app` and `postgres` services.
   c. Update the `app` service `depends_on` to include `init` with `condition: service_completed_successfully`.
3. **.env.example**:
   a. Read the existing file.
   b. Add the 6 missing variables with section headers at the end of the file.
4. **.github/workflows/ci.yml**:
   a. Read the existing file.
   b. Add `npm audit` step after "Install dependencies" in `lint-typecheck-test` job.
   c. Add the new `security` job after `build`.
5. **next.config.ts**:
   a. Read the existing file.
   b. Add the CSP header object to the headers array for `source: '/(.*)'`.
6. **settings/page.tsx**:
   a. Read the existing file carefully.
   b. Add `deleteConfirmText` and `deleting` state variables.
   c. Add `handleDeleteAccount` async function.
   d. Replace the Danger Zone confirmation dialog content.
   e. Remove the placeholder text about not being implemented.
7. **danger-zone.test.ts**:
   a. Create the test file.
   b. Write 3+ test cases for the confirmation logic.
8. Run tests: `npx jest tests/unit/settings --passWithNoTests`.
9. Fix any failures.

## Tests Required

Create and verify:
```bash
npx jest tests/unit/settings/danger-zone.test.ts --passWithNoTests
```

Also verify existing settings tests still pass:
```bash
npx jest tests/unit/settings --passWithNoTests
```

## Commit Strategy

**Commit 1:** `feat: add prisma migration init service to docker-compose`
- Files: `docker-compose.yml`

**Commit 2:** `chore: add missing environment variables to .env.example`
- Files: `.env.example`

**Commit 3:** `feat: add security scanning to CI pipeline`
- Files: `.github/workflows/ci.yml`

**Commit 4:** `feat: add Content-Security-Policy header to next.config`
- Files: `next.config.ts`

**Commit 5:** `feat: implement danger zone account deletion with confirmation`
- Files: `src/app/(dashboard)/settings/page.tsx`, `tests/unit/settings/danger-zone.test.ts`
