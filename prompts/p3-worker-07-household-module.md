# Worker 07: Complete Household Module + Dashboard + Tests

## Branch

`ai-feature/p3-w07-household-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/household/services/maintenance-service.ts`
- `src/modules/household/services/provider-service.ts`
- `src/modules/household/services/shopping-service.ts`
- `src/modules/household/services/family-service.ts`
- `src/modules/household/services/vehicle-service.ts`
- `src/modules/household/services/warranty-service.ts`
- `src/app/(dashboard)/household/page.tsx`
- `tests/unit/household/*`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/db/index.ts`** -- Exports `prisma` client instance.
3. **`prisma/schema.prisma`** -- Database models. Key models for this worker:
   - `Task` -- has `title`, `description`, `status`, `priority`, `tags` (String[]), `dueDate`, `userId`, `entityId`, `metadata` (JSON). Use `tags: { has: "maintenance" }` to filter maintenance tasks.
   - `Contact` -- has `name`, `email`, `phone`, `tags` (String[]), `preferences` (JSON), `commitments` (JSON), `userId` (via entity), `entityId`. Use `tags: { has: "service_provider" }` for providers, `tags: { has: "family" }` for family.
   - `Document` -- has `title`, `type`, `content` (String), `status`, `entityId`, `metadata` (JSON). Use `type: "SHOPPING_LIST"` for shopping, `type: "VEHICLE"` for vehicles, `type: "WARRANTY"` for warranties.
4. **`src/modules/household/types.ts`** -- All household module types: `MaintenanceTask`, `ServiceProvider`, `ShoppingItem`, `FamilyMember`, `VehicleRecord`, `WarrantyRecord`, `SubscriptionRecord`.
5. **`src/modules/household/services/maintenance-service.ts`** -- Uses in-memory `taskStore` Map. Has `createTask`, `getUpcomingTasks`, `getOverdueTasks`, `completeTask`, `getSeasonalSchedule`, `generateAnnualSchedule`. AI already wired into `generateAnnualSchedule` via `generateJSON`. Has proper frequency/season logic.
6. **`src/modules/household/services/provider-service.ts`** -- Uses in-memory `providerStore` Map. Has `addProvider`, `getProviders`, `updateProvider`, `logServiceCall`, `getRecommendedProvider`. AI already wired into `getRecommendedProvider` via `generateText`.
7. **`src/modules/household/services/shopping-service.ts`** -- Uses in-memory `shoppingStore` Map. Has `addItem`, `getList`, `markPurchased`, `getSmartSuggestions`, `groupByStore`. AI already wired into `getSmartSuggestions` via `generateJSON`.
8. **`src/modules/household/services/family-service.ts`** -- Uses in-memory `familyStore` Map. Has `addMember`, `getMembers`, `updateMemberPrivacy`, `getSharedItems`. No AI, basic CRUD.
9. **`src/modules/household/services/vehicle-service.ts`** -- Uses in-memory `vehicleStore` Map. Has `addVehicle`, `getVehicles`, `logMaintenance`, `getUpcomingService`, `checkExpiringDocuments`. No AI.
10. **`src/modules/household/services/warranty-service.ts`** -- Uses in-memory `warrantyStore` and `subscriptionStore` Maps. Has warranty CRUD plus subscription management. No AI.
11. **`src/app/(dashboard)/household/page.tsx`** -- Currently renders hardcoded `sampleTasks`, `sampleShoppingItems`, `sampleWarranties`, `sampleSubscriptions`, `sampleVehicles` data. Uses client components: `MaintenanceCalendar`, `MaintenanceTaskCard`, `ShoppingList`, `WarrantyTracker`, `SubscriptionManager`, `VehicleDashboard`.

## Requirements

### 1. maintenance-service.ts: Replace in-memory Map with Prisma Task model

**Read the file first** to understand the current Map-based implementation with frequency calculations and AI schedule optimization.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `taskStore` Map** (line 6).

c. **Rewrite `createTask`**:
- Use `prisma.task.create()` with `tags: ['maintenance']` to identify maintenance tasks.
- Store household-specific fields (`category`, `frequency`, `season`, `estimatedCostUsd`, `nextDueDate`, `lastCompletedDate`) in the `metadata` JSON field.
- Map `MaintenanceTask.status` to `Task.status` (use `metadata.maintenanceStatus` for the UPCOMING/OVERDUE/COMPLETED/SKIPPED granularity).
- Keep the existing function signature.

d. **Rewrite `getUpcomingTasks`**:
- Query `prisma.task.findMany({ where: { userId, tags: { has: 'maintenance' } } })`.
- Filter by date range using metadata `nextDueDate`.
- Deserialize metadata back into `MaintenanceTask` type.

e. **Rewrite `getOverdueTasks`**: Same pattern -- query by tag, filter by overdue date.

f. **Rewrite `completeTask`**:
- `prisma.task.update()` to mark completed.
- Create next occurrence using `prisma.task.create()` with the calculated next due date (keep existing `calculateNextDueDate` logic).

g. **Rewrite `getSeasonalSchedule`**: Query by tag + filter by season in metadata.

h. **Keep `generateAnnualSchedule` AI logic as-is** -- just change the storage calls from Map to Prisma.

### 2. provider-service.ts: Replace in-memory Map with Prisma Contact model

**Read the file first** -- uses in-memory Map with AI-powered recommendations.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `providerStore` Map**.

c. **Rewrite `addProvider`**:
- Use `prisma.contact.create()` with `tags: ['service_provider']`.
- Store provider-specific fields (`category`, `rating`, `costHistory`, `lastUsed`) in `preferences` JSON field.
- Map `ServiceProvider.name` to `Contact.name`, `ServiceProvider.phone` to `Contact.phone`.

d. **Rewrite `getProviders`**:
- Query `prisma.contact.findMany({ where: { entityId, tags: { has: 'service_provider' } } })`.
- Note: Since we need userId context, use the entity's contacts. The `entityId` should be derived from the user's active entity.
- Filter by `category` from preferences JSON if provided.

e. **Rewrite `updateProvider`**, `logServiceCall`: Use `prisma.contact.update()`.

f. **Keep `getRecommendedProvider` AI logic as-is** -- just change the data source from Map to Prisma.

### 3. shopping-service.ts: Replace in-memory Map with Prisma Document model

**Read the file first** -- uses in-memory Map with AI-powered smart suggestions.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `shoppingStore` Map**.

c. **Rewrite `addItem`**:
- Use `prisma.document.create()` with `type: 'SHOPPING_LIST'`.
- Store shopping item data in `content` (JSON stringified) or `metadata` JSON field.
- Include: `name`, `category`, `quantity`, `unit`, `store`, `estimatedPrice`, `isPurchased`, `isRecurring`, `recurringFrequency`.

d. **Rewrite `getList`**:
- Query `prisma.document.findMany({ where: { entityId, type: 'SHOPPING_LIST' } })`.
- Parse `content` to extract `ShoppingItem` data.
- Filter by `isPurchased` from parsed data.

e. **Rewrite `markPurchased`**: `prisma.document.update()` to set purchased status in content JSON.

f. **Keep `getSmartSuggestions` AI logic as-is** -- change data source from Map to Prisma.

g. **Keep `groupByStore` as-is** -- pure function on ShoppingItem array.

### 4. family-service.ts: Replace in-memory Map with Prisma Contact model

**Read the file first** -- simple CRUD with privacy settings.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `familyStore` Map**.

c. **Rewrite `addMember`**:
- Use `prisma.contact.create()` with `tags: ['family']`.
- Store family-specific fields (`relationship`, `visibility`, `sharedCalendar`, `sharedTasks`, `sharedShopping`, `birthday`, `allergies`, `schoolInfo`, `medicalInfo`) in `preferences` JSON field.

d. **Rewrite `getMembers`**:
- Query `prisma.contact.findMany({ where: { entityId, tags: { has: 'family' } } })`.
- Deserialize preferences into `FamilyMember` type.

e. **Rewrite `updateMemberPrivacy`**: `prisma.contact.update()` on preferences JSON.

f. **Rewrite `getSharedItems`**: Read from Contact preferences instead of Map.

### 5. vehicle-service.ts: Replace in-memory Map with Prisma Document model

**Read the file first** -- uses in-memory Map with maintenance history tracking.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `vehicleStore` Map**.

c. **Rewrite `addVehicle`**:
- Use `prisma.document.create()` with `type: 'VEHICLE'`.
- Store vehicle data in `content` (JSON stringified): `make`, `model`, `year`, `mileage`, `nextServiceDate`, `nextServiceType`, `insuranceExpiry`, `registrationExpiry`, `maintenanceHistory`.
- Set `title` to `"${make} ${model} ${year}"`.

d. **Rewrite `getVehicles`**:
- Query `prisma.document.findMany({ where: { entityId, type: 'VEHICLE' } })`.
- Parse content into `VehicleRecord` type.

e. **Rewrite `logMaintenance`**: Update Document content to append maintenance history entry.

f. **Rewrite `getUpcomingService`**, `checkExpiringDocuments`**: Query and filter from Document records.

### 6. warranty-service.ts: Replace in-memory Maps with Prisma Document model

**Read the file first** -- uses two in-memory Maps (warranties and subscriptions).

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove both in-memory Maps** (`warrantyStore`, `subscriptionStore`).

c. **Rewrite warranty functions** (`addWarranty`, `getWarranties`, `getExpiringWarranties`):
- Use `prisma.document.create/findMany()` with `type: 'WARRANTY'`.
- Store warranty data in `content` JSON: `itemName`, `purchaseDate`, `warrantyEndDate`, `provider`, `claimPhone`, `receiptUrl`.
- Calculate `isExpiring` and `isExpired` on read (same logic as current).

d. **Rewrite subscription functions** (`addSubscription`, `getSubscriptions`, `getMonthlySubscriptionCost`, `getUpcomingRenewals`):
- Use `prisma.document.create/findMany()` with `type: 'SUBSCRIPTION'`.
- Store subscription data in `content` JSON.

### 7. household/page.tsx: Replace hardcoded data with API calls

**Read the file first** -- currently uses `sampleTasks`, `sampleShoppingItems`, etc.

#### Specific modifications:

a. **Remove all `sample*` constants**.

b. **Add state and data fetching**:
```typescript
const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
const [shopping, setShopping] = useState<ShoppingItem[]>([]);
const [warranties, setWarranties] = useState<WarrantyRecord[]>([]);
const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([]);
const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
const [loading, setLoading] = useState(true);
```

c. **Fetch data from API endpoints**:
```typescript
useEffect(() => {
  async function fetchData() {
    try {
      const [tasksRes, shoppingRes, warrantiesRes, subsRes, vehiclesRes] = await Promise.all([
        fetch('/api/household/maintenance'),
        fetch('/api/household/shopping'),
        fetch('/api/household/warranties'),
        fetch('/api/household/subscriptions'),
        fetch('/api/household/vehicles'),
      ]);
      // Parse and set state
    } catch (err) {
      console.error('Failed to fetch household data:', err);
    } finally {
      setLoading(false);
    }
  }
  fetchData();
}, []);
```

d. **Render loading/empty states**. Pass real data to child components.

### 8. Write tests for all services

Create test files in `tests/unit/household/`.

## Acceptance Criteria

1. `maintenance-service.ts` stores and retrieves tasks via Prisma `Task` model with `tags: ['maintenance']` instead of in-memory Map.
2. `provider-service.ts` stores and retrieves providers via Prisma `Contact` model with `tags: ['service_provider']`.
3. `shopping-service.ts` stores and retrieves items via Prisma `Document` model with `type: 'SHOPPING_LIST'`.
4. `family-service.ts` stores and retrieves members via Prisma `Contact` model with `tags: ['family']`.
5. `vehicle-service.ts` stores and retrieves vehicles via Prisma `Document` model with `type: 'VEHICLE'`.
6. `warranty-service.ts` stores and retrieves warranties via Prisma `Document` model with `type: 'WARRANTY'` and subscriptions via `type: 'SUBSCRIPTION'`.
7. `household/page.tsx` fetches real data from `/api/household/*` endpoints.
8. All existing function signatures and exports are preserved.
9. AI imports come from `@/lib/ai`. Prisma imports come from `@/lib/db`.
10. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
11. All tests pass: `npx jest tests/unit/household/`.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to existing function signatures, exports, and type contracts.
2. **Create branch**: `git checkout -b ai-feature/p3-w07-household-module`
3. **Modify `maintenance-service.ts`**: Remove Map, add Prisma, rewrite CRUD to use Task model with `tags: ['maintenance']`.
4. **Modify `provider-service.ts`**: Remove Map, rewrite to use Contact model with `tags: ['service_provider']`.
5. **Modify `shopping-service.ts`**: Remove Map, rewrite to use Document model with `type: 'SHOPPING_LIST'`.
6. **Modify `family-service.ts`**: Remove Map, rewrite to use Contact model with `tags: ['family']`.
7. **Modify `vehicle-service.ts`**: Remove Map, rewrite to use Document model with `type: 'VEHICLE'`.
8. **Modify `warranty-service.ts`**: Remove Maps, rewrite to use Document model with `type: 'WARRANTY'` and `type: 'SUBSCRIPTION'`.
9. **Modify `household/page.tsx`**: Remove sample data, add fetch calls, loading/empty states.
10. **Write tests** in `tests/unit/household/`.
11. **Type-check**: `npx tsc --noEmit`
12. **Run tests**: `npx jest tests/unit/household/`
13. **Commit** with conventional commits.

## Tests Required

### `tests/unit/household/maintenance-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    task: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('createTask', () => {
  it('should create Task with tags including maintenance');
  it('should store category, frequency, season in metadata');
  it('should set status to OVERDUE if nextDueDate is past');
});

describe('getUpcomingTasks', () => {
  it('should query tasks with maintenance tag');
  it('should filter by date range');
  it('should deserialize metadata to MaintenanceTask');
});

describe('completeTask', () => {
  it('should mark task as completed');
  it('should create next occurrence for recurring tasks');
  it('should not create next occurrence for ONE_TIME tasks');
});

describe('generateAnnualSchedule', () => {
  it('should create template tasks for the current year');
  it('should call generateJSON for AI optimization');
  it('should fallback to original templates on AI failure');
});
```

### `tests/unit/household/provider-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
}));

describe('addProvider', () => {
  it('should create Contact with service_provider tag');
  it('should store category and rating in preferences');
});

describe('getProviders', () => {
  it('should query contacts with service_provider tag');
  it('should filter by category when provided');
});

describe('getRecommendedProvider', () => {
  it('should sort by rating then last used');
  it('should call generateText for recommendation rationale');
  it('should fallback to default rationale on AI failure');
});
```

### `tests/unit/household/shopping-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('addItem', () => {
  it('should create Document with type SHOPPING_LIST');
  it('should store item data in content JSON');
});

describe('getList', () => {
  it('should return unpurchased items by default');
  it('should include purchased items when flag set');
});

describe('getSmartSuggestions', () => {
  it('should suggest recurring items that need repurchasing');
  it('should call generateJSON for AI suggestions');
  it('should not suggest items already on the active list');
});
```

### `tests/unit/household/family-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    contact: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

describe('addMember', () => {
  it('should create Contact with family tag');
  it('should store family-specific fields in preferences');
});

describe('getMembers', () => {
  it('should query contacts with family tag');
});

describe('updateMemberPrivacy', () => {
  it('should update visibility and shared settings in preferences');
});
```

### `tests/unit/household/vehicle-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));

describe('addVehicle', () => {
  it('should create Document with type VEHICLE');
  it('should set title to make model year');
});

describe('logMaintenance', () => {
  it('should append entry to maintenance history in content');
  it('should update mileage');
});

describe('checkExpiringDocuments', () => {
  it('should detect expiring insurance');
  it('should detect expiring registration');
  it('should not flag non-expiring documents');
});
```

### `tests/unit/household/warranty-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    document: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));

describe('addWarranty', () => {
  it('should create Document with type WARRANTY');
  it('should calculate isExpiring and isExpired on creation');
});

describe('getExpiringWarranties', () => {
  it('should return warranties expiring within specified days');
});

describe('getMonthlySubscriptionCost', () => {
  it('should sum monthly costs of active subscriptions');
  it('should prorate annual subscriptions to monthly');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(household): replace maintenance service in-memory store with Prisma Task model`
   - Files: `src/modules/household/services/maintenance-service.ts`
2. `feat(household): replace provider service in-memory store with Prisma Contact model`
   - Files: `src/modules/household/services/provider-service.ts`
3. `feat(household): replace shopping service in-memory store with Prisma Document model`
   - Files: `src/modules/household/services/shopping-service.ts`
4. `feat(household): replace family service in-memory store with Prisma Contact model`
   - Files: `src/modules/household/services/family-service.ts`
5. `feat(household): replace vehicle and warranty services with Prisma Document model`
   - Files: `src/modules/household/services/vehicle-service.ts`, `src/modules/household/services/warranty-service.ts`
6. `feat(household): wire dashboard to real API endpoints`
   - Files: `src/app/(dashboard)/household/page.tsx`
7. `test(household): add unit tests for all household services`
   - Files: `tests/unit/household/*`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
