# Worker 03: Persist Payments/Subscriptions + Wire Billing Page

## Branch

`ai-feature/p3-w03-payments-billing`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/lib/integrations/payments/subscriptions.ts`
- `src/app/(dashboard)/billing/page.tsx`
- `tests/unit/payments/subscriptions.test.ts`

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/lib/integrations/payments/client.ts`
- `src/lib/integrations/payments/webhooks.ts`
- Any file outside the Owned Paths

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Contains the `Subscription` Prisma model:
   ```
   model Subscription {
     id                   String   @id @default(cuid())
     entityId             String
     entity               Entity   @relation(...)
     planId               String   // "free", "starter", "professional", "enterprise"
     status               String   @default("active") // "active", "past_due", "canceled", "trialing"
     currentPeriodStart   DateTime
     currentPeriodEnd     DateTime
     stripeCustomerId     String?
     stripeSubscriptionId String?
     cancelAtPeriodEnd    Boolean  @default(false)
     metadata             Json?
     createdAt            DateTime @default(now())
     updatedAt            DateTime @updatedAt
     @@index([entityId])
   }
   ```

2. **`src/lib/integrations/payments/subscriptions.ts`** -- Current implementation uses 3 in-memory Maps:
   - `subscriptionStore = new Map<string, Subscription>()` -- subscriptionId -> Subscription
   - `entitySubscriptionIndex = new Map<string, string>()` -- entityId -> subscriptionId
   - `usageStore = new Map<string, UsageMeter[]>()` -- entityId -> usage meters

   Exports: `PLANS` (constant), `_resetStore`, `getPlan`, `getSubscription`, `createSubscription`, `changePlan`, `cancelSubscription`, `resumeSubscription`, `hasFeatureAccess`, `isWithinLimits`, `recordUsage`, `getUsageSummary`.

3. **`src/app/(dashboard)/billing/page.tsx`** -- Current billing page with hardcoded mock data:
   - Hardcoded `PLANS` array (free/pro/enterprise with static pricing).
   - Hardcoded `MOCK_INVOICES` array.
   - Hardcoded `currentPlan` state set to `'pro'`.
   - Hardcoded `usage` object with aiTokens, apiCalls, storage.
   - Plan change buttons show `alert('Plan changes coming soon!')`.
   - Invoice download shows `alert('Invoice download coming soon.')`.
   - Payment method update shows `alert('Payment method update coming soon.')`.
   - Contains a `UsageCard` sub-component for rendering usage bars.

4. **`src/lib/db/index.ts`** -- Exports `prisma` singleton. Import as: `import { prisma } from '@/lib/db'`.
5. **`tests/unit/payments/subscriptions.test.ts`** -- Existing tests that use `_resetStore()` and test all CRUD operations on in-memory Maps.

## Requirements

### 1. Persist `subscriptions.ts` to Database

Replace all 3 in-memory Map stores with Prisma queries against the `Subscription` model.

**Mapping between local types and Prisma model:**
- The local `Subscription` interface has: `id`, `userId`, `entityId`, `planId`, `status`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `stripeSubscriptionId`, `stripeCustomerId`, `createdAt`, `updatedAt`.
- The Prisma `Subscription` model has the same fields except no `userId` column. Store `userId` in the `metadata` JSON field as `{ userId: string }`.
- The local `status` type includes `'cancelled'` (double-l), but the Prisma model uses `'canceled'` (single-l). Normalize to `'canceled'` in DB, but return `'cancelled'` to callers for backward compatibility.

**Functions to update:**

- `getSubscription(entityId)` -- Use `prisma.subscription.findFirst({ where: { entityId }, orderBy: { createdAt: 'desc' } })`. Map DB record back to local `Subscription` type.
- `createSubscription(params)` -- Use `prisma.subscription.create()`. Store `userId` in `metadata`. Return mapped local type.
- `changePlan(params)` -- Use `prisma.subscription.update()`. Look up by `params.subscriptionId`. Keep same validation (SAME_PLAN, PLAN_NOT_FOUND).
- `cancelSubscription(params)` -- Use `prisma.subscription.update()`. Set `status` or `cancelAtPeriodEnd`.
- `resumeSubscription(subscriptionId)` -- Use `prisma.subscription.update()`. Keep same validation logic.
- `hasFeatureAccess(entityId, feature)` -- Query subscription from DB, look up plan features. Make this `async` (it was sync before -- callers should be updated to await, but since this is a lib function, just make it async and the return type becomes `Promise<boolean>`).
- `isWithinLimits(entityId, metric)` -- Query subscription from DB, check plan limits against usage. Make this `async`.
- `recordUsage(params)` -- For usage metering, store in the `metadata` JSON field of the subscription OR keep a separate approach. Since there is no dedicated usage meter Prisma model, keep the usage metering in-memory for now (it resets each billing period anyway) but document this limitation.
- `getUsageSummary(entityId)` -- Return usage meters (keep in-memory for now).
- `_resetStore()` -- In test env, use `prisma.subscription.deleteMany()` and clear the in-memory usage store.

**Keep the `PLANS` constant and `getPlan` function unchanged** -- these are static plan definitions, not DB records.

### 2. Wire Billing Page (`src/app/(dashboard)/billing/page.tsx`)

Replace hardcoded mock data with real API calls.

**Changes required:**

a. **Current subscription:** Fetch from `/api/billing/usage` on mount using `useEffect` + `fetch`. Replace hardcoded `currentPlan` state with real data. Show the actual plan name, price, status, and renewal date from the subscription's `currentPeriodEnd`.

b. **Usage metrics:** Fetch from `/api/billing/usage` (same endpoint). Replace hardcoded `usage` object with real metrics. Keep the `UsageCard` sub-component but feed it real data.

c. **Plan selection:** Keep the `PLANS` display array but update the upgrade/downgrade button to call `/api/billing/budget/check` (POST) with the target plan ID. On success, show a confirmation toast or redirect to a checkout flow. Replace the `alert()` with a real API call.

d. **Invoices:** Replace `MOCK_INVOICES` with data fetched from `/api/finance/invoices`. Show real invoice list. Handle empty state ("No invoices yet."). Handle loading with skeleton rows.

e. **Payment method:** Keep the current UI structure but replace the `alert()` with a call to the Stripe customer portal (if available) or a placeholder that says "Contact support to update payment method."

f. **Loading states:** Add proper loading skeletons for subscription info, usage metrics, and invoice list.

g. **Error handling:** Show user-friendly error messages if API calls fail. Use a try/catch or `.catch()` pattern.

### 3. Update Tests (`tests/unit/payments/subscriptions.test.ts`)

Replace existing tests that rely on in-memory Maps with tests that mock Prisma.

**Mock setup:**
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    subscription: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
```

**Tests to write/update:**
- `getPlan` -- Keep as-is (no DB access, tests static PLANS array).
- `createSubscription` -- Mock `prisma.subscription.create`, verify correct field mapping, verify `userId` stored in metadata.
- `getSubscription` -- Mock `prisma.subscription.findFirst`, verify entityId filter, verify null case.
- `changePlan` -- Mock `prisma.subscription.findFirst` + `update`, verify plan change logic.
- `cancelSubscription` -- Mock `findFirst` + `update`, verify immediate vs end-of-period cancellation.
- `resumeSubscription` -- Mock `findFirst` + `update`, verify validation (already cancelled, not pending cancellation).
- `hasFeatureAccess` -- Mock `findFirst`, verify feature lookup against PLANS.
- `isWithinLimits` -- Verify limit checking logic.

## Acceptance Criteria

- [ ] `subscriptions.ts` no longer uses `subscriptionStore` or `entitySubscriptionIndex` Maps for subscription data.
- [ ] Subscription CRUD operations use Prisma `Subscription` model.
- [ ] All existing function signatures are preserved (some may become async).
- [ ] `PLANS` constant and `getPlan` function are unchanged.
- [ ] `_resetStore()` truncates DB in test env and clears in-memory usage.
- [ ] Import Prisma as `import { prisma } from '@/lib/db'`.
- [ ] Billing page fetches real data from `/api/billing/usage` and `/api/finance/invoices`.
- [ ] Billing page shows loading states while fetching.
- [ ] Billing page handles API errors gracefully.
- [ ] Plan change button makes a real API call instead of `alert()`.
- [ ] Mock invoices are removed from billing page.
- [ ] Tests pass with mocked Prisma.
- [ ] No modifications to any file outside Owned Paths.

## Implementation Steps

1. Read all Context files to understand existing APIs and Prisma schema.
2. Update `src/lib/integrations/payments/subscriptions.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove `subscriptionStore`, `entitySubscriptionIndex` Maps.
   c. Create a helper function `mapDbToLocal(dbRecord)` that converts Prisma Subscription to local Subscription interface (handling `canceled`/`cancelled` normalization, extracting `userId` from metadata).
   d. Create a helper function `mapLocalToDb(localRecord)` for the reverse mapping.
   e. Rewrite `getSubscription` with `prisma.subscription.findFirst`.
   f. Rewrite `createSubscription` with `prisma.subscription.create`.
   g. Rewrite `changePlan` with `prisma.subscription.findFirst` + `prisma.subscription.update`.
   h. Rewrite `cancelSubscription` with `prisma.subscription.findFirst` + `prisma.subscription.update`.
   i. Rewrite `resumeSubscription` with `prisma.subscription.findFirst` + `prisma.subscription.update`.
   j. Make `hasFeatureAccess` async, query DB.
   k. Make `isWithinLimits` async, query DB.
   l. Keep `recordUsage` and `getUsageSummary` using in-memory `usageStore` for now.
   m. Update `_resetStore` to deleteMany from DB in test env.
3. Update `src/app/(dashboard)/billing/page.tsx`:
   a. Add `useState` for `subscription`, `usage`, `invoices`, `loading`, `error`.
   b. Add `useEffect` to fetch `/api/billing/usage` on mount.
   c. Add `useEffect` to fetch `/api/finance/invoices` on mount.
   d. Replace hardcoded plan display with real subscription data.
   e. Replace hardcoded usage with real usage data.
   f. Replace `MOCK_INVOICES` with fetched invoices.
   g. Wire plan change button to POST `/api/billing/budget/check`.
   h. Add loading skeletons and error states.
4. Update `tests/unit/payments/subscriptions.test.ts`:
   a. Add Prisma mock.
   b. Rewrite each test to use mock assertions.
   c. Add edge case tests for null subscription, status normalization.

## Tests Required

- `tests/unit/payments/subscriptions.test.ts` (update existing):
  - `getPlan` returns correct plan by ID and by tier.
  - `createSubscription` persists to DB with correct fields.
  - `createSubscription` stores userId in metadata.
  - `createSubscription` sets trialing status when trialDays provided.
  - `getSubscription` returns subscription by entityId.
  - `getSubscription` returns null when none exists.
  - `changePlan` updates planId in DB.
  - `changePlan` throws SAME_PLAN error.
  - `changePlan` throws PLAN_NOT_FOUND error.
  - `cancelSubscription` sets cancelAtPeriodEnd for non-immediate.
  - `cancelSubscription` sets status to cancelled for immediate.
  - `resumeSubscription` clears cancelAtPeriodEnd.
  - `resumeSubscription` throws for fully cancelled subscription.
  - `hasFeatureAccess` returns true for included features.
  - `hasFeatureAccess` returns false for excluded features.

## Commit Strategy

**Commit 1:** `feat: persist subscriptions to database via Prisma Subscription model`
- Files: `src/lib/integrations/payments/subscriptions.ts`

**Commit 2:** `feat: wire billing page to real API endpoints`
- Files: `src/app/(dashboard)/billing/page.tsx`

**Commit 3:** `test: update subscription tests to mock Prisma`
- Files: `tests/unit/payments/subscriptions.test.ts`
