# Worker 06: Complete Travel Module + Dashboard + Tests

## Branch

`ai-feature/p3-w06-travel-module`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/travel/services/flight-monitor-service.ts`
- `src/modules/travel/services/itinerary-service.ts`
- `src/modules/travel/services/visa-checker-service.ts`
- `src/modules/travel/services/timezone-service.ts`
- `src/modules/travel/services/preferences-service.ts`
- `src/app/(dashboard)/travel/page.tsx`
- `tests/unit/travel/*`

### Do NOT modify

- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- Any files outside the owned paths above

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/lib/ai/index.ts`** -- Exports `generateText(prompt, options?)`, `generateJSON<T>(prompt, options?)`, `chat(messages, options?)`, `streamText(prompt, options?)`. Options include `model`, `maxTokens`, `temperature`, `system`.
2. **`src/lib/ai/client.ts`** -- Full implementation using `@anthropic-ai/sdk`. Default model is `claude-sonnet-4-5-20250929`. `generateJSON` appends a system instruction to respond with JSON only.
3. **`src/lib/db/index.ts`** -- Exports `prisma` client instance.
4. **`prisma/schema.prisma`** -- Database models. Key models for this worker:
   - `Notification` -- has `type`, `title`, `message`, `priority`, `userId`, `entityId`, `metadata` (JSON). Use `type="flight_alert"` for flight alerts.
   - `CalendarEvent` -- has `title`, `startTime`, `endTime`, `metadata` (JSON), `userId`, `entityId`. Metadata can store flight status info.
   - `User` -- has `preferences` (JSON field) for storing travel preferences.
5. **`src/modules/travel/types.ts`** -- All travel module types: `FlightAlert`, `Itinerary`, `ItineraryLeg`, `DisruptionResponse`, `VisaRequirement`, `TravelDocument`, `TravelPreferences`, `TimezoneAdjustment`.
6. **`src/modules/travel/services/flight-monitor-service.ts`** -- Current implementation uses in-memory `alertStore` Map and `Math.random()` for disruption simulation. AI is already wired into `generateDisruptionResponse` via `generateText`.
7. **`src/modules/travel/services/itinerary-service.ts`** -- Current implementation uses in-memory `itineraryStore` Map. AI already wired into `optimizeItinerary` via `generateJSON`.
8. **`src/modules/travel/services/visa-checker-service.ts`** -- Has a hardcoded lookup table for 9 US country pairs plus AI fallback via `generateJSON`. Already functional.
9. **`src/modules/travel/services/timezone-service.ts`** -- Uses hardcoded timezone offset map and mock calendar events. AI already wired into `getTimezoneAdvice` via `generateText`.
10. **`src/modules/travel/services/preferences-service.ts`** -- Uses in-memory `preferencesStore` Map. No AI, no Prisma.
11. **`src/app/(dashboard)/travel/page.tsx`** -- Currently renders hardcoded `sampleItinerary`, `sampleDocuments`, `sampleAlert`, `sampleVisa` data. Uses client components: `ItineraryTimeline`, `DocumentChecklist`, `FlightAlertBanner`, `VisaRequirementCard`.
12. **`src/app/api/travel/`** -- Existing API routes for travel module endpoints.

## Requirements

### 1. flight-monitor-service.ts: Replace in-memory alertStore with Prisma Notification model

**Read the file first** to understand the current in-memory Map + Math.random() implementation.

#### Specific modifications:

a. **Add Prisma import at top of file**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `alertStore` Map** (line 6).

c. **Rewrite `checkFlightStatus`**:
- Instead of `Math.random()` simulation, read flight status from `CalendarEvent.metadata` where the event represents a flight leg.
- Query `prisma.calendarEvent.findMany()` for events matching the itinerary legs (match by metadata containing itineraryId and legId, or by title/time).
- Check metadata for `flightStatus` field. If `flightStatus === 'DELAYED'` or `flightStatus === 'CANCELLED'`, generate a `FlightAlert`.
- Store alerts in `prisma.notification.create()` with `type: 'flight_alert'`, including alert details in `metadata` JSON.
- Keep the existing function signature: `checkFlightStatus(itineraryId: string): Promise<FlightAlert[]>`.

d. **Rewrite `getActiveAlerts`**:
- Replace the Map lookup with `prisma.notification.findMany({ where: { userId, type: 'flight_alert' } })`.
- Deserialize the metadata back into `FlightAlert` objects.
- Keep the existing function signature.

e. **Keep `generateDisruptionResponse` as-is** -- it already uses AI via `generateText` and works correctly.

f. **Add AI-powered disruption recommendation**: Use `generateText` to generate recommendation text based on the disruption type, affected leg, and available alternatives. This is already partially implemented -- verify it works with the new Prisma-backed data.

### 2. itinerary-service.ts: Replace in-memory store with CalendarEvent queries

**Read the file first** to understand the in-memory Map implementation.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `itineraryStore` Map** (line 5).

c. **Rewrite `createItinerary`**:
- Store each itinerary as a set of `CalendarEvent` records. Each leg becomes a CalendarEvent with `metadata` containing `{ itineraryId, itineraryName, legType, legOrder, departureLocation, arrivalLocation, provider, costUsd, status }`.
- Alternatively, store the full itinerary as a single CalendarEvent with the entire legs array in metadata. Choose whichever approach preserves the current API contract.
- Return the same `Itinerary` type.

d. **Rewrite `getItinerary`**:
- Query `prisma.calendarEvent.findMany()` where metadata contains the itineraryId.
- Reconstruct the `Itinerary` object from the CalendarEvent records.

e. **Rewrite `listItineraries`**:
- Query CalendarEvents for the user, group by itineraryId from metadata.

f. **Keep `optimizeItinerary` as-is** -- already uses AI via `generateJSON`.

g. **Rewrite `updateLeg`, `addLeg`, `removeLeg`** to use Prisma updates on the CalendarEvent records.

h. **Keep `calculateTotalCost` as-is** -- pure function on the Itinerary type.

### 3. visa-checker-service.ts: Expand hardcoded database

**Read the file first** -- it already has 9 country pairs and AI fallback.

#### Specific modifications:

a. **Expand `visaLookup` to top 30 country pairs**: Add entries for common travel corridors:
   - US->KR, US->TH, US->SG, US->DE, US->FR, US->IT, US->ES
   - US->AE, US->IL, US->NZ, US->CO, US->AR, US->ZA
   - CA->US, GB->US, AU->US, JP->US, DE->US, IN->US, BR->US, CN->US

b. **Keep AI fallback for unknown pairs as-is** -- already works via `generateJSON`.

c. **Keep `validateTravelDocuments` as-is** -- already functional.

### 4. timezone-service.ts: Replace mock events with real CalendarEvent queries

**Read the file first** -- uses hardcoded mock events and a simplified timezone offset map.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Rewrite `adjustScheduleForTravel`**:
- Replace the `mockEvents` array with a real query: `prisma.calendarEvent.findMany()` for events within the travel date range for the given userId.
- Map real CalendarEvent records to the adjustment calculation.
- Keep the timezone offset calculation and conflict detection logic.

c. **Add jet lag estimation function**:
```typescript
export function estimateJetLag(
  homeTimezone: string,
  travelTimezone: string
): { hoursDifference: number; adjustmentDays: number; severity: 'NONE' | 'MILD' | 'MODERATE' | 'SEVERE' }
```
- Calculate hours difference using the offset map.
- Estimate adjustment days (roughly 1 day per hour of time change).
- Classify severity based on hours difference.

d. **Add optimal meeting time calculator**:
```typescript
export function findOptimalMeetingTime(
  timezones: string[]
): { utcHour: number; localTimes: Record<string, string> }
```
- Find the hour that falls within 9 AM - 5 PM for the most timezones.
- Return the optimal UTC hour and what time it is in each timezone.

e. **Keep `getTimezoneAdvice` as-is** -- already uses AI via `generateText`.

### 5. preferences-service.ts: Replace in-memory store with User.preferences

**Read the file first** -- uses in-memory `preferencesStore` Map.

#### Specific modifications:

a. **Add Prisma import**:
```typescript
import { prisma } from '@/lib/db';
```

b. **Remove the in-memory `preferencesStore` Map** (line 6).

c. **Rewrite `getPreferences`**:
- Query `prisma.user.findUnique({ where: { id: userId } })`.
- Read `user.preferences` JSON field and extract travel preferences.
- If no travel preferences exist, return defaults (same as current defaults).
- Parse the JSON into the `TravelPreferences` type.

d. **Rewrite `updatePreferences`**:
- Read current user preferences, merge travel-specific updates.
- `prisma.user.update()` to save back to `preferences` JSON field.
- Keep the seat preference learning logic (lines 33-43).

e. **Rewrite `checkDocumentExpiry`** to read from User.preferences instead of the Map.

### 6. travel/page.tsx: Replace hardcoded data with API calls

**Read the file first** -- currently uses `sampleItinerary`, `sampleDocuments`, `sampleAlert`, `sampleVisa` constants.

#### Specific modifications:

a. **Remove all `sample*` constants**.

b. **Add state and useEffect hooks to fetch real data**:
```typescript
const [itineraries, setItineraries] = useState<Itinerary[]>([]);
const [alerts, setAlerts] = useState<FlightAlert[]>([]);
const [visaReqs, setVisaReqs] = useState<VisaRequirement[]>([]);
const [loading, setLoading] = useState(true);

useEffect(() => {
  async function fetchData() {
    try {
      const [itinRes, alertRes] = await Promise.all([
        fetch('/api/travel/itineraries'),
        fetch('/api/travel/alerts'),
      ]);
      // Parse responses and update state
    } catch (err) {
      console.error('Failed to fetch travel data:', err);
    } finally {
      setLoading(false);
    }
  }
  fetchData();
}, []);
```

c. **Render loading state** while data is being fetched.

d. **Render empty state** when no itineraries/alerts exist.

e. **Pass real data to child components** instead of sample data.

### 7. Write tests for all services

Create test files in `tests/unit/travel/`.

## Acceptance Criteria

1. `flight-monitor-service.ts` stores and retrieves alerts via Prisma `Notification` model instead of in-memory Map.
2. `flight-monitor-service.ts` uses deterministic flight status checking from `CalendarEvent.metadata` instead of `Math.random()`.
3. `itinerary-service.ts` stores and retrieves itineraries via Prisma `CalendarEvent` model instead of in-memory Map.
4. `visa-checker-service.ts` has at least 30 country pair entries in the hardcoded lookup table.
5. `timezone-service.ts` queries real CalendarEvents instead of using mock events.
6. `timezone-service.ts` exports `estimateJetLag` and `findOptimalMeetingTime` functions.
7. `preferences-service.ts` stores and retrieves preferences via Prisma `User.preferences` JSON field instead of in-memory Map.
8. `travel/page.tsx` fetches real data from `/api/travel/*` endpoints instead of using hardcoded sample data.
9. All existing function signatures and exports are preserved.
10. AI imports come from `@/lib/ai`.
11. Prisma imports come from `@/lib/db`.
12. `jest.config.ts`, `package.json`, `tsconfig.json`, and `prisma/schema.prisma` are NOT modified.
13. All tests pass: `npx jest tests/unit/travel/`.

## Implementation Steps

1. **Read all context files** listed above. Pay special attention to the existing implementation patterns, function signatures, and exports.
2. **Create branch**: `git checkout -b ai-feature/p3-w06-travel-module`
3. **Modify `flight-monitor-service.ts`**: Remove in-memory Map, add Prisma imports, rewrite `checkFlightStatus` to use CalendarEvent metadata, rewrite `getActiveAlerts` to use Notification model.
4. **Modify `itinerary-service.ts`**: Remove in-memory Map, rewrite CRUD operations to use CalendarEvent model, keep AI optimization as-is.
5. **Modify `visa-checker-service.ts`**: Expand the `visaLookup` to 30+ country pairs.
6. **Modify `timezone-service.ts`**: Replace mock events with CalendarEvent queries, add `estimateJetLag` and `findOptimalMeetingTime`.
7. **Modify `preferences-service.ts`**: Replace in-memory Map with User.preferences JSON field via Prisma.
8. **Modify `travel/page.tsx`**: Remove sample data, add fetch calls, add loading/empty states.
9. **Write tests**: Create test files for all services in `tests/unit/travel/`.
10. **Type-check**: `npx tsc --noEmit`
11. **Run tests**: `npx jest tests/unit/travel/`
12. **Commit** with conventional commits.

## Tests Required

### `tests/unit/travel/flight-monitor-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    notification: { create: jest.fn(), findMany: jest.fn() },
    calendarEvent: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
}));

describe('checkFlightStatus', () => {
  it('should return empty alerts when no itinerary found');
  it('should create Notification records for delayed flights from CalendarEvent metadata');
  it('should create Notification records for cancelled flights from CalendarEvent metadata');
  it('should not create alerts for on-time flights');
});

describe('getActiveAlerts', () => {
  it('should query Notification model with type flight_alert');
  it('should deserialize metadata into FlightAlert objects');
  it('should return empty array when no alerts exist');
});

describe('generateDisruptionResponse', () => {
  it('should call generateText for recommendation explanation');
  it('should return alternatives with cost comparison');
  it('should fallback to default reason on AI failure');
});
```

### `tests/unit/travel/itinerary-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    calendarEvent: { create: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('createItinerary', () => {
  it('should create CalendarEvent records for each leg');
  it('should store itinerary metadata in CalendarEvent');
  it('should return a valid Itinerary object');
});

describe('getItinerary', () => {
  it('should reconstruct Itinerary from CalendarEvent records');
  it('should return null when itinerary not found');
});

describe('listItineraries', () => {
  it('should group CalendarEvents by itineraryId');
  it('should filter by status when provided');
});

describe('optimizeItinerary', () => {
  it('should call generateJSON with leg summaries');
  it('should return suggestions on AI success');
  it('should return fallback message on AI failure');
});
```

### `tests/unit/travel/preferences-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

describe('getPreferences', () => {
  it('should read travel preferences from User.preferences JSON');
  it('should return defaults when no travel preferences exist');
});

describe('updatePreferences', () => {
  it('should merge updates into User.preferences');
  it('should learn seat preferences from patterns');
  it('should flag expiring documents');
});
```

### `tests/unit/travel/timezone-service.test.ts`
```typescript
jest.mock('@/lib/db', () => ({
  prisma: {
    calendarEvent: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn(),
}));

describe('adjustScheduleForTravel', () => {
  it('should query CalendarEvents for the travel date range');
  it('should calculate timezone offset differences correctly');
  it('should detect conflicts outside 7AM-11PM');
});

describe('estimateJetLag', () => {
  it('should return NONE severity for same timezone');
  it('should return MILD severity for 1-3 hour difference');
  it('should return SEVERE severity for 8+ hour difference');
});

describe('findOptimalMeetingTime', () => {
  it('should find overlapping business hours across timezones');
  it('should return local times for each timezone');
});
```

### `tests/unit/travel/visa-checker-service.test.ts`
```typescript
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
}));

describe('checkVisaRequirements', () => {
  it('should return known requirement for US->JP');
  it('should return known requirement for US->CN with visa required');
  it('should call AI for unknown country pairs');
  it('should fallback to conservative defaults on AI failure');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(travel): replace flight monitor in-memory store with Prisma Notification model`
   - Files: `src/modules/travel/services/flight-monitor-service.ts`
2. `feat(travel): replace itinerary in-memory store with Prisma CalendarEvent model`
   - Files: `src/modules/travel/services/itinerary-service.ts`
3. `feat(travel): expand visa requirements database to 30 country pairs`
   - Files: `src/modules/travel/services/visa-checker-service.ts`
4. `feat(travel): add jet lag estimation and optimal meeting time to timezone service`
   - Files: `src/modules/travel/services/timezone-service.ts`
5. `feat(travel): replace preferences in-memory store with User.preferences Prisma field`
   - Files: `src/modules/travel/services/preferences-service.ts`
6. `feat(travel): wire dashboard to real API endpoints`
   - Files: `src/app/(dashboard)/travel/page.tsx`
7. `test(travel): add unit tests for all travel services`
   - Files: `tests/unit/travel/*`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
