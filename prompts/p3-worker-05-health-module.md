# Worker 05: Complete Health Module + Dashboard + Tests

## Branch

`ai-feature/p3-w05-health-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/modules/health/services/wearable-service.ts`
- `src/modules/health/services/sleep-service.ts`
- `src/modules/health/services/energy-service.ts`
- `src/modules/health/services/stress-service.ts`
- `src/modules/health/services/medical-service.ts`
- `src/app/(dashboard)/health/page.tsx`
- `tests/unit/health/*` (create directory and test files)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/modules/health/types.ts`
- `src/modules/health/components/*` (read-only -- these UI components already exist)
- Any file outside the Owned Paths

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- Contains the `HealthMetric` model:
   ```
   model HealthMetric {
     id          String   @id @default(cuid())
     entityId    String
     entity      Entity   @relation(...)
     type        String   // "sleep", "stress", "energy", "heart_rate", "steps", "weight"
     value       Float
     unit        String   // "hours", "score", "bpm", "steps", "kg"
     source      String   @default("manual") // "manual", "apple_health", "fitbit", "oura", "whoop", "garmin"
     metadata    Json?    // Additional data (e.g., sleep stages, stress factors)
     recordedAt  DateTime
     createdAt   DateTime @default(now())
     @@index([entityId])
     @@index([type])
     @@index([recordedAt])
   }
   ```
   Also contains the `Document` model (used by medical-service):
   ```
   model Document {
     id         String   @id @default(cuid())
     title      String
     entityId   String
     type       String   // can be "MEDICAL"
     version    Int      @default(1)
     templateId String?
     citations  Json     @default("[]")
     content    String?
     status     String   @default("DRAFT")
     deletedAt  DateTime?
     createdAt  DateTime @default(now())
     updatedAt  DateTime @updatedAt
   }
   ```

2. **`src/modules/health/types.ts`** -- Defines: `WearableProvider`, `WearableConnection`, `SleepData`, `SleepOptimization`, `EnergyForecast`, `StressLevel`, `StressAdjustment`, `MedicalRecord`.

3. **`src/modules/health/services/wearable-service.ts`** -- Current implementation:
   - `connectionStore = new Map<string, WearableConnection>()` for connection state.
   - `connectWearable(userId, provider)` -- Creates in-memory connection.
   - `disconnectWearable(connectionId)` -- Sets isConnected to false.
   - `getConnections(userId)` -- Filters Map by userId.
   - `syncData(connectionId)` -- **Generates fake data with Math.random()** for 7 days of sleep and stress data. This is the primary target for replacement.

4. **`src/modules/health/services/sleep-service.ts`** -- Current implementation:
   - `sleepStore = new Map<string, SleepData[]>()` for sleep data.
   - `getSleepHistory(userId, days)` -- Returns stored data or **generates simulated data with Math.random()**.
   - `analyzeSleepPatterns(userId)` -- Calls `getSleepHistory`, then uses `generateJSON` from `@/lib/ai` for AI analysis. AI integration is already implemented with fallback.
   - `getSleepScore(userId, date)` -- Looks up score from history.
   - `generateSimulatedSleepData(days)` -- **Pure Math.random() data generator.**

5. **`src/modules/health/services/energy-service.ts`** -- Current implementation:
   - `forecastEnergy(userId, date)` -- Gets sleep data, models circadian rhythm with **Math.random() noise**. Uses `generateJSON` for AI recommendation. AI integration already exists with fallback.
   - `getOptimalSchedule(userId, date)` -- Calls `forecastEnergy`, uses `generateJSON` for AI schedule. AI integration already exists with fallback.

6. **`src/modules/health/services/stress-service.ts`** -- Current implementation:
   - `stressStore = new Map<string, StressLevel[]>()` for stress data.
   - `recordStressLevel(userId, level, source, triggers?)` -- Stores in memory.
   - `getStressHistory(userId, days)` -- Filters by date from in-memory store.
   - `suggestScheduleAdjustments(userId)` -- Uses `generateJSON` for AI suggestions. AI integration already exists with fallback.
   - `getStressTrend(userId, days)` -- Aggregates daily averages from history.

7. **`src/modules/health/services/medical-service.ts`** -- Current implementation:
   - `medicalStore = new Map<string, MedicalRecord[]>()` for medical records.
   - `addRecord(userId, record)` -- Stores in memory.
   - `getRecords(userId, type?)` -- Filters from memory.
   - `getUpcomingAppointments(userId, days)` -- Filters appointments by date range.
   - `getMedicationReminders(userId)` -- Filters medications needing refill.
   - `checkOverdueAppointments(userId)` -- Filters overdue appointments.

8. **`src/app/(dashboard)/health/page.tsx`** -- Current dashboard with hardcoded sample data:
   - Imports components: `SleepChart`, `SleepScoreCard`, `EnergyTimeline`, `StressGauge`, `StressTrendChart`, `MedicalRecordList`, `WearableConnectionCard`.
   - Uses `const sampleSleepData`, `sampleEnergyForecast`, `sampleStress`, `sampleStressTrend`, `sampleMedicalRecords`, `sampleWearable` with Math.random().
   - These sample variables need to be replaced with real API calls.

9. **`src/lib/db/index.ts`** -- Exports `prisma`. Import as: `import { prisma } from '@/lib/db'`.
10. **`src/lib/ai/index.ts`** -- Exports `generateText`, `generateJSON`. Import as: `import { generateJSON } from '@/lib/ai'`.

## Requirements

### 1. Rewrite `wearable-service.ts` -- Prisma-Backed with Provider Pattern

Replace in-memory connection store and fake data generation with Prisma queries.

**Connection management:**
- Keep `connectionStore` Map for active connection sessions (these are transient WebSocket/OAuth sessions, not persistent data).
- `syncWearableData(connectionId)` should:
  1. Look up the connection to get `provider` and `userId`.
  2. Call a provider-specific adapter based on `source` field:
     - Create an adapter interface: `WearableAdapter { fetchSleepData(userId, days): Promise<HealthMetricInput[]>; fetchStressData(userId, days): Promise<HealthMetricInput[]>; fetchHeartRate(userId, days): Promise<HealthMetricInput[]> }`.
     - Implement stub adapters for: `AppleHealthAdapter`, `FitbitAdapter`, `OuraAdapter`, `WHOOPAdapter`, `GarminAdapter`. Each stub should throw a "Not yet integrated" error or return empty arrays.
     - Register adapters in a `Map<string, WearableAdapter>`.
  3. When the actual API call fails or adapter is a stub, fall back to returning existing DB data.
  4. On successful fetch, store metrics to DB via `prisma.healthMetric.createMany()`.
  5. Return the stored/fetched data.

**New function `getLatestMetrics(entityId, type?, days?)`:**
- Query `prisma.healthMetric.findMany({ where: { entityId, type, recordedAt: { gte: daysAgo } }, orderBy: { recordedAt: 'desc' } })`.
- Return typed results.

**Keep existing function signatures** for `connectWearable`, `disconnectWearable`, `getConnections`. The `syncData` function signature changes: rename to `syncWearableData` and update the return type, but also keep the old `syncData` as an alias for backward compatibility.

### 2. Rewrite `sleep-service.ts` -- Prisma-Backed with AI Analysis

Replace in-memory sleep store and simulated data with Prisma queries against `HealthMetric` where `type = 'sleep'`.

**`getSleepHistory(userId, days)`:**
- Query `prisma.healthMetric.findMany({ where: { entityId: userId, type: 'sleep', recordedAt: { gte: daysAgo } }, orderBy: { recordedAt: 'desc' } })`.
- Map DB records to `SleepData` type. The `metadata` JSON field contains sleep stage details: `{ deepSleepHours, remSleepHours, lightSleepHours, awakeMinutes, bedTime, wakeTime }`.
- `value` field stores `totalHours`, `unit` is `"hours"`.
- Calculate `sleepScore` from metadata: weighted formula = `(deepPct * 35 + remPct * 30 + (1 - awakePct) * 20 + consistencyBonus * 15)` where percentages are relative to totalHours.
- If no data exists, return an empty array (do NOT generate fake data).

**`analyzeSleepPatterns(userId)`:**
- Keep the existing AI integration via `generateJSON`. No changes needed to the AI call.
- Update to read from DB instead of in-memory store.

**`getSleepScore(userId, date)`:**
- Query single record from DB by date.
- Calculate score using the same formula.

**Remove `generateSimulatedSleepData` function entirely.**

### 3. Rewrite `energy-service.ts` -- Prisma-Backed with AI Forecasting

Replace Math.random() noise with deterministic calculations based on real data.

**`forecastEnergy(userId, date)`:**
- Query recent sleep data from `prisma.healthMetric.findMany({ where: { entityId: userId, type: 'sleep' }, ... })` for last 3 days.
- Query energy data from `prisma.healthMetric.findMany({ where: { entityId: userId, type: 'energy' }, ... })` for historical patterns.
- Calculate `baseEnergy` from average sleep quality (keep existing formula).
- Remove `Math.random()` noise. Instead, use a deterministic perturbation based on hour and date hash: `perturbation = Math.sin(hour * 0.7 + dateHash) * 0.05`.
- Keep the existing AI recommendation via `generateJSON`. No changes to the AI call.

**`getOptimalSchedule(userId, date)`:**
- Keep existing implementation but ensure it reads from DB.
- Keep the existing AI integration via `generateJSON`.

### 4. Rewrite `stress-service.ts` -- Prisma-Backed with AI Suggestions

Replace in-memory stress store with Prisma queries against `HealthMetric` where `type = 'stress'`.

**`recordStressLevel(userId, level, source, triggers?)`:**
- Use `prisma.healthMetric.create({ data: { entityId: userId, type: 'stress', value: level, unit: 'score', source, metadata: { triggers }, recordedAt: new Date() } })`.
- Return mapped `StressLevel` object.

**`getStressHistory(userId, days)`:**
- Query `prisma.healthMetric.findMany({ where: { entityId: userId, type: 'stress', recordedAt: { gte: cutoff } }, orderBy: { recordedAt: 'desc' } })`.
- Map to `StressLevel[]` extracting `triggers` from metadata.

**`suggestScheduleAdjustments(userId)`:**
- Keep the existing AI integration via `generateJSON`. No changes to the AI call.
- Update to read from DB.

**`getStressTrend(userId, days)`:**
- Query from DB and aggregate daily averages.

### 5. Rewrite `medical-service.ts` -- Use Document Model

Replace in-memory Map with Prisma queries against the `Document` model where `type = 'MEDICAL'`.

**Mapping:**
- `MedicalRecord.id` -> `Document.id`
- `MedicalRecord.userId` -> `Document.entityId`
- `MedicalRecord.type` ('APPOINTMENT', 'MEDICATION', 'LAB_RESULT', etc.) -> Store in `Document.content` as JSON or in `Document.templateId` field.
- `MedicalRecord.title` -> `Document.title`
- Store the full `MedicalRecord` data in `Document.citations` (JSON field) or create a structured approach using `Document.content` as JSON string.

**Recommended approach:** Store the medical record type in `Document.status` (repurpose as sub-type since the base type is already "MEDICAL"), and store all medical-specific fields (`provider`, `date`, `nextDate`, `notes`, `reminders`) in `Document.citations` JSON field.

**Functions to update:**
- `addRecord(userId, record)` -- `prisma.document.create()`.
- `getRecords(userId, type?)` -- `prisma.document.findMany({ where: { entityId: userId, type: 'MEDICAL', status: type ?? undefined } })`.
- `getUpcomingAppointments(userId, days)` -- Query with date filter.
- `getMedicationReminders(userId)` -- Query medications needing refill.
- `checkOverdueAppointments(userId)` -- Query overdue appointments.

### 6. Wire Health Dashboard (`src/app/(dashboard)/health/page.tsx`)

Replace all hardcoded sample data with real API calls.

**Changes:**
- Remove all `const sample*` variables.
- Add state variables: `sleepData`, `energyForecast`, `currentStress`, `stressTrend`, `medicalRecords`, `wearableConnection`, `loading`, `error`.
- Fetch data on mount using `useEffect`:
  - `/api/health/sleep?days=14` -> `sleepData`
  - `/api/health/energy?date=today` -> `energyForecast`
  - `/api/health/stress/current` -> `currentStress`
  - `/api/health/stress/trend?days=7` -> `stressTrend`
  - `/api/health/medical/records` -> `medicalRecords`
  - `/api/health/wearables/connections` -> `wearableConnection`
- Keep the same UI components (`SleepChart`, `SleepScoreCard`, `EnergyTimeline`, `StressGauge`, `StressTrendChart`, `MedicalRecordList`, `WearableConnectionCard`) but pass fetched data instead of samples.
- Add loading skeletons while data fetches.
- Add error handling with user-friendly messages.
- Add empty states for when no data exists ("Connect a wearable to start tracking", "No sleep data yet", etc.).

### 7. Write Tests for All Services

Create test files in `tests/unit/health/` directory.

**Mock setup pattern (same for all test files):**
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    healthMetric: {
      create: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
    },
    document: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));
```

## Acceptance Criteria

- [ ] `wearable-service.ts` has pluggable provider pattern with stub adapters.
- [ ] `wearable-service.ts` stores synced data to `HealthMetric` via Prisma.
- [ ] `wearable-service.ts` has `getLatestMetrics` function querying DB.
- [ ] `sleep-service.ts` queries `HealthMetric` where type='sleep' instead of in-memory Map.
- [ ] `sleep-service.ts` no longer contains `generateSimulatedSleepData` or `Math.random()`.
- [ ] `sleep-service.ts` calculates sleep score from metadata (weighted formula).
- [ ] `energy-service.ts` removes `Math.random()` noise, uses deterministic perturbation.
- [ ] `energy-service.ts` reads from DB for historical data.
- [ ] `stress-service.ts` stores/reads stress levels via `HealthMetric` Prisma model.
- [ ] `stress-service.ts` no longer uses in-memory Map.
- [ ] `medical-service.ts` uses `Document` Prisma model where type='MEDICAL'.
- [ ] `medical-service.ts` no longer uses in-memory Map.
- [ ] Health dashboard fetches real data from `/api/health/*` endpoints.
- [ ] Health dashboard shows loading states and empty states.
- [ ] All existing AI integrations (`generateJSON` calls) are preserved.
- [ ] Import Prisma as `import { prisma } from '@/lib/db'`.
- [ ] Import AI as `import { generateJSON } from '@/lib/ai'`.
- [ ] All test files pass with mocked Prisma and AI.
- [ ] No modifications to `types.ts`, components, or any file outside Owned Paths.

## Implementation Steps

1. Read all Context files, especially `types.ts` and the existing components to understand expected data shapes.
2. Update `src/modules/health/services/wearable-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Define `WearableAdapter` interface.
   c. Create stub adapters for each provider.
   d. Create adapter registry Map.
   e. Add `getLatestMetrics(entityId, type?, days?)` function.
   f. Rewrite `syncData`/`syncWearableData` to use adapters and Prisma.
   g. Keep connection management in-memory (transient sessions).
3. Update `src/modules/health/services/sleep-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove `sleepStore` Map and `generateSimulatedSleepData`.
   c. Rewrite `getSleepHistory` to query `prisma.healthMetric`.
   d. Add sleep score calculation helper from metadata.
   e. Update `analyzeSleepPatterns` to read from DB.
   f. Update `getSleepScore` to read from DB.
4. Update `src/modules/health/services/energy-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Rewrite `forecastEnergy` to query DB for sleep data.
   c. Remove `Math.random()`, use deterministic perturbation.
   d. Keep AI integration unchanged.
5. Update `src/modules/health/services/stress-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove `stressStore` Map.
   c. Rewrite `recordStressLevel` to use `prisma.healthMetric.create`.
   d. Rewrite `getStressHistory` to query DB.
   e. Update `suggestScheduleAdjustments` to read from DB.
   f. Rewrite `getStressTrend` to query and aggregate from DB.
6. Update `src/modules/health/services/medical-service.ts`:
   a. Add `import { prisma } from '@/lib/db'`.
   b. Remove `medicalStore` Map.
   c. Rewrite `addRecord` to use `prisma.document.create`.
   d. Rewrite `getRecords` to query `prisma.document.findMany`.
   e. Rewrite appointment/medication queries with appropriate filters.
7. Update `src/app/(dashboard)/health/page.tsx`:
   a. Remove all `const sample*` data.
   b. Add state and useEffect for API fetches.
   c. Add loading and error states.
   d. Pass fetched data to existing components.
8. Create test files:
   a. `tests/unit/health/wearable-service.test.ts`
   b. `tests/unit/health/sleep-service.test.ts`
   c. `tests/unit/health/energy-service.test.ts`
   d. `tests/unit/health/stress-service.test.ts`
   e. `tests/unit/health/medical-service.test.ts`

## Tests Required

**`tests/unit/health/wearable-service.test.ts`:**
- `connectWearable` creates connection with correct provider.
- `disconnectWearable` sets isConnected to false.
- `getConnections` filters by userId.
- `syncWearableData` stores metrics to DB via createMany.
- `syncWearableData` falls back to DB data when adapter fails.
- `getLatestMetrics` queries DB with correct filters.

**`tests/unit/health/sleep-service.test.ts`:**
- `getSleepHistory` queries HealthMetric with type='sleep' and date filter.
- `getSleepHistory` returns empty array when no data.
- `getSleepHistory` maps DB records to SleepData type correctly.
- `analyzeSleepPatterns` calls generateJSON with sleep data summary.
- `analyzeSleepPatterns` falls back to static analysis when AI fails.
- `getSleepScore` returns score for specific date.
- Sleep score calculation produces expected values from known metadata.

**`tests/unit/health/energy-service.test.ts`:**
- `forecastEnergy` produces 24-hour energy forecast.
- `forecastEnergy` uses sleep data to calculate base energy.
- `forecastEnergy` calls generateJSON for recommendation.
- `forecastEnergy` falls back to rule-based recommendation when AI fails.
- `getOptimalSchedule` categorizes hours into deep work, meetings, breaks.
- Energy levels are deterministic (no Math.random).

**`tests/unit/health/stress-service.test.ts`:**
- `recordStressLevel` creates HealthMetric with type='stress'.
- `recordStressLevel` stores triggers in metadata.
- `recordStressLevel` clamps level to 0-100.
- `getStressHistory` queries DB with date filter.
- `suggestScheduleAdjustments` returns empty for low stress.
- `suggestScheduleAdjustments` calls generateJSON for high stress.
- `suggestScheduleAdjustments` falls back to rule-based suggestions when AI fails.
- `getStressTrend` aggregates daily averages correctly.

**`tests/unit/health/medical-service.test.ts`:**
- `addRecord` creates Document with type='MEDICAL'.
- `getRecords` queries documents by entityId and type.
- `getRecords` filters by sub-type when provided.
- `getUpcomingAppointments` returns appointments within date range.
- `getMedicationReminders` returns medications needing refill within 7 days.
- `checkOverdueAppointments` returns overdue appointments.

## Commit Strategy

**Commit 1:** `feat: add pluggable wearable provider pattern and persist metrics to DB`
- Files: `src/modules/health/services/wearable-service.ts`

**Commit 2:** `feat: persist sleep data to HealthMetric model and calculate real sleep scores`
- Files: `src/modules/health/services/sleep-service.ts`

**Commit 3:** `feat: remove random noise from energy forecast and read from DB`
- Files: `src/modules/health/services/energy-service.ts`

**Commit 4:** `feat: persist stress levels to HealthMetric model`
- Files: `src/modules/health/services/stress-service.ts`

**Commit 5:** `feat: persist medical records to Document model`
- Files: `src/modules/health/services/medical-service.ts`

**Commit 6:** `feat: wire health dashboard to real API endpoints`
- Files: `src/app/(dashboard)/health/page.tsx`

**Commit 7:** `test: add comprehensive health module test suite`
- Files: `tests/unit/health/wearable-service.test.ts`, `tests/unit/health/sleep-service.test.ts`, `tests/unit/health/energy-service.test.ts`, `tests/unit/health/stress-service.test.ts`, `tests/unit/health/medical-service.test.ts`
