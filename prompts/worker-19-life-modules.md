# Worker 19: Life Management Modules (M8 + M9 + M10 + M22)

## Branch: ai-feature/w19-life-modules

Create and check out the branch `ai-feature/w19-life-modules` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

```
src/modules/travel/                    # Travel management module
src/modules/health/                    # Health & wellness module
src/modules/household/                 # Household management module
src/modules/crisis/                    # Crisis management module
src/app/(dashboard)/travel/            # Dashboard pages for travel
src/app/(dashboard)/health/            # Dashboard pages for health
src/app/(dashboard)/household/         # Dashboard pages for household
src/app/(dashboard)/crisis/            # Dashboard pages for crisis
src/app/api/travel/                    # API routes for travel
src/app/api/health/                    # API routes for health
src/app/api/household/                 # API routes for household
src/app/api/crisis/                    # API routes for crisis
tests/unit/life-modules/               # All unit tests for this worker
```

## Context (read these first, do NOT modify)

Read and internalize these files before writing any code. They define the shared contracts.

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project-wide dev process, commit conventions, done criteria |
| `src/shared/types/index.ts` | Immutable shared types: `User`, `UserPreferences`, `Entity`, `Contact`, `CalendarEvent`, `Task`, `TaskStatus`, `Priority`, `BlastRadius`, `ActionLog`, `ActionActor`, `MessageChannel`, `ApiResponse`, `ApiError`, `ApiMeta` |
| `prisma/schema.prisma` | Database schema: `User`, `Entity`, `Contact`, `CalendarEvent`, `Task`, `ActionLog` models with fields and relations |
| `src/shared/utils/api-response.ts` | API helpers: `success<T>()`, `error()`, `paginated<T>()` -- use these in every route handler |
| `src/lib/db/index.ts` | Prisma client singleton: `import { prisma } from '@/lib/db'` |
| `package.json` | Stack: Next.js 16, React 19, Prisma 7, Zod 4, date-fns 4, Jest 30, ts-jest |
| `tsconfig.json` | Path aliases: `@/` maps to `src/` |

## Requirements

### 1. Travel Module (M8)

**Types file:** `src/modules/travel/types.ts`

```typescript
export interface TravelPreferences {
  userId: string;
  airlines: { name: string; loyaltyNumber?: string; seatPreference: string; class: string }[];
  hotels: { chain: string; loyaltyNumber?: string; roomType: string }[];
  dietary: string[];
  budgetPerDayUsd: number;
  preferredAirports: string[];
  travelDocuments: TravelDocument[];
}

export interface TravelDocument {
  type: 'PASSPORT' | 'VISA' | 'GLOBAL_ENTRY' | 'TSA_PRECHECK' | 'DRIVERS_LICENSE';
  number: string;
  expirationDate: Date;
  issuingCountry: string;
  isExpiringSoon: boolean;    // within 6 months
}

export interface Itinerary {
  id: string;
  userId: string;
  name: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  legs: ItineraryLeg[];
  totalCostEstimate: number;
  currency: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ItineraryLeg {
  id: string;
  order: number;
  type: 'FLIGHT' | 'HOTEL' | 'CAR_RENTAL' | 'TRAIN' | 'TRANSFER' | 'ACTIVITY';
  departureLocation: string;
  arrivalLocation: string;
  departureTime: Date;
  arrivalTime: Date;
  timezone: string;
  confirmationNumber?: string;
  provider?: string;
  costUsd: number;
  status: 'BOOKED' | 'PENDING' | 'CANCELLED' | 'COMPLETED';
  notes?: string;
}

export interface FlightAlert {
  itineraryId: string;
  legId: string;
  alertType: 'DELAY' | 'CANCELLATION' | 'GATE_CHANGE' | 'BOOKING_PRICE_DROP';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
  originalValue?: string;
  newValue?: string;
  timestamp: Date;
}

export interface DisruptionResponse {
  originalLeg: ItineraryLeg;
  alternatives: ItineraryLeg[];
  recommendation: ItineraryLeg;
  reason: string;
  additionalCost: number;
}

export interface TimezoneAdjustment {
  eventId: string;
  eventTitle: string;
  originalTimezone: string;
  travelTimezone: string;
  originalTime: Date;
  adjustedTime: Date;
  conflictDetected: boolean;
}

export interface VisaRequirement {
  destinationCountry: string;
  citizenshipCountry: string;
  visaRequired: boolean;
  visaType?: string;
  processingDays?: number;
  documentRequired: string[];
  notes: string;
}
```

**Service file:** `src/modules/travel/services/preferences-service.ts`

Implement:
- `getPreferences(userId: string): Promise<TravelPreferences>` -- Returns stored travel preferences.
- `updatePreferences(userId: string, updates: Partial<TravelPreferences>): Promise<TravelPreferences>` -- Updates preferences. Learns over time (e.g., if user always picks aisle seats, remember).
- `checkDocumentExpiry(userId: string): Promise<TravelDocument[]>` -- Returns documents expiring within 6 months with alerts.

**Service file:** `src/modules/travel/services/itinerary-service.ts`

Implement:
- `createItinerary(userId: string, name: string, legs: Omit<ItineraryLeg, 'id'>[]): Promise<Itinerary>` -- Creates a multi-leg itinerary with automatic cost totaling.
- `getItinerary(itineraryId: string): Promise<Itinerary | null>`
- `listItineraries(userId: string, status?: string): Promise<Itinerary[]>`
- `updateLeg(itineraryId: string, legId: string, updates: Partial<ItineraryLeg>): Promise<Itinerary>` -- Updates a single leg.
- `addLeg(itineraryId: string, leg: Omit<ItineraryLeg, 'id'>): Promise<Itinerary>` -- Adds a leg and reorders.
- `removeLeg(itineraryId: string, legId: string): Promise<Itinerary>` -- Removes a leg and reorders.
- `calculateTotalCost(itinerary: Itinerary): number` -- Sums all leg costs.

**Service file:** `src/modules/travel/services/flight-monitor-service.ts`

Implement:
- `checkFlightStatus(itineraryId: string): Promise<FlightAlert[]>` -- Placeholder that simulates checking flight legs for delays/cancellations. Returns alerts for any disruptions detected.
- `generateDisruptionResponse(alert: FlightAlert, itinerary: Itinerary): Promise<DisruptionResponse>` -- Given a disruption alert, generates alternative leg options with costs and a recommendation.
- `getActiveAlerts(userId: string): Promise<FlightAlert[]>` -- Returns all unresolved flight alerts.

**Service file:** `src/modules/travel/services/timezone-service.ts`

Implement:
- `adjustScheduleForTravel(userId: string, travelTimezone: string, travelStartDate: Date, travelEndDate: Date): Promise<TimezoneAdjustment[]>` -- Recalculates all calendar events during the travel period for the new timezone. Flags conflicts.
- `detectTimezoneConflicts(adjustments: TimezoneAdjustment[]): TimezoneAdjustment[]` -- Returns adjustments where the adjusted time creates a conflict (e.g., 3 AM meeting).

**Service file:** `src/modules/travel/services/visa-checker-service.ts`

Implement:
- `checkVisaRequirements(citizenshipCountry: string, destinationCountry: string): Promise<VisaRequirement>` -- Returns visa requirements for a country pair. Uses a built-in lookup table for common pairs (US->EU, US->UK, US->Japan, US->Australia, US->Brazil, US->China, US->India, US->Canada, US->Mexico) and a generic fallback.
- `validateTravelDocuments(userId: string, destinationCountry: string): Promise<{ ready: boolean; missing: string[]; expiring: TravelDocument[] }>` -- Checks if user has required documents for the destination.

**Components in `src/modules/travel/components/`:**

- `ItineraryTimeline.tsx` -- Visual timeline of itinerary legs with status badges. Props: `itinerary: Itinerary`.
- `LegCard.tsx` -- Single leg card showing departure/arrival, times, provider, cost. Props: `leg: ItineraryLeg`.
- `FlightAlertBanner.tsx` -- Alert banner for flight disruptions with alternative options. Props: `alert: FlightAlert; alternatives?: DisruptionResponse`.
- `TravelPreferencesForm.tsx` -- Form for editing travel preferences. Props: `preferences: TravelPreferences; onSave: (p: TravelPreferences) => void`.
- `DocumentChecklist.tsx` -- Checklist of travel documents with expiry warnings. Props: `documents: TravelDocument[]`.
- `VisaRequirementCard.tsx` -- Displays visa requirements with document checklist. Props: `requirement: VisaRequirement`.

### 2. Health Module (M9)

**Types file:** `src/modules/health/types.ts`

```typescript
export type WearableProvider = 'APPLE_WATCH' | 'FITBIT' | 'OURA' | 'WHOOP' | 'GARMIN';

export interface WearableConnection {
  id: string;
  userId: string;
  provider: WearableProvider;
  isConnected: boolean;
  lastSyncAt?: Date;
  accessToken?: string;       // placeholder, not stored in plain text
}

export interface SleepData {
  date: string;
  totalHours: number;
  deepSleepHours: number;
  remSleepHours: number;
  lightSleepHours: number;
  awakeMinutes: number;
  sleepScore: number;          // 0-100
  bedTime: string;             // HH:mm
  wakeTime: string;
}

export interface SleepOptimization {
  userId: string;
  averageSleepScore: number;
  idealBedTime: string;
  idealWakeTime: string;
  correlations: { factor: string; correlation: number; suggestion: string }[];
  recommendations: string[];
}

export interface EnergyForecast {
  userId: string;
  date: string;
  hourlyEnergy: { hour: number; energyLevel: number; confidence: number }[];
  peakHours: number[];
  troughHours: number[];
  recommendation: string;
}

export interface StressLevel {
  userId: string;
  timestamp: Date;
  level: number;                // 0-100
  source: string;               // "wearable", "self_report", "calendar_analysis"
  triggers: string[];
}

export interface StressAdjustment {
  suggestion: string;
  adjustmentType: 'RESCHEDULE' | 'CANCEL' | 'DELEGATE' | 'BREAK' | 'LIGHTEN';
  targetEventId?: string;
  reason: string;
}

export interface MedicalRecord {
  id: string;
  userId: string;
  type: 'APPOINTMENT' | 'MEDICATION' | 'PRESCRIPTION' | 'LAB_RESULT' | 'IMMUNIZATION';
  title: string;
  provider?: string;
  date: Date;
  nextDate?: Date;              // next appointment/refill
  notes?: string;
  reminders: { daysBefore: number; sent: boolean }[];
}
```

**Service file:** `src/modules/health/services/wearable-service.ts`

Implement:
- `connectWearable(userId: string, provider: WearableProvider): Promise<WearableConnection>` -- Placeholder that simulates connecting a wearable device. Sets isConnected = true.
- `disconnectWearable(connectionId: string): Promise<void>` -- Disconnects a wearable.
- `getConnections(userId: string): Promise<WearableConnection[]>` -- Lists all wearable connections.
- `syncData(connectionId: string): Promise<{ sleepData: SleepData[]; stressLevels: StressLevel[] }>` -- Placeholder that generates simulated health data for the last 7 days.

**Service file:** `src/modules/health/services/sleep-service.ts`

Implement:
- `getSleepHistory(userId: string, days: number): Promise<SleepData[]>` -- Returns sleep data for last N days.
- `analyzeSleepPatterns(userId: string): Promise<SleepOptimization>` -- Analyzes sleep data to find ideal bed/wake times, correlates sleep quality with next-day productivity and schedule factors.
- `getSleepScore(userId: string, date: string): Promise<number>` -- Returns sleep score for a specific date.

**Service file:** `src/modules/health/services/energy-service.ts`

Implement:
- `forecastEnergy(userId: string, date: string): Promise<EnergyForecast>` -- Predicts hourly energy levels based on sleep data, chronotype, and historical patterns. Peak hours = best for deep work, trough hours = suggest breaks.
- `getOptimalSchedule(userId: string, date: string): Promise<{ deepWorkSlots: string[]; meetingSlots: string[]; breakSlots: string[] }>` -- Recommends time slots for different activity types based on energy forecast.

**Service file:** `src/modules/health/services/stress-service.ts`

Implement:
- `recordStressLevel(userId: string, level: number, source: string, triggers?: string[]): Promise<StressLevel>` -- Records a stress measurement.
- `getStressHistory(userId: string, days: number): Promise<StressLevel[]>` -- Returns stress history.
- `suggestScheduleAdjustments(userId: string): Promise<StressAdjustment[]>` -- When stress is high (> 70), analyzes calendar for the next 48 hours and suggests: rescheduling non-essential meetings, inserting breaks, delegating tasks, cancelling optional events.
- `getStressTrend(userId: string, days: number): Promise<{ date: string; average: number }[]>` -- Daily average stress for charting.

**Service file:** `src/modules/health/services/medical-service.ts`

Implement:
- `addRecord(userId: string, record: Omit<MedicalRecord, 'id'>): Promise<MedicalRecord>` -- Adds a medical record.
- `getRecords(userId: string, type?: string): Promise<MedicalRecord[]>` -- Lists records filtered by type.
- `getUpcomingAppointments(userId: string, days: number): Promise<MedicalRecord[]>` -- Returns appointments in next N days.
- `getMedicationReminders(userId: string): Promise<MedicalRecord[]>` -- Returns medications needing refill.
- `checkOverdueAppointments(userId: string): Promise<MedicalRecord[]>` -- Returns appointments that are past their nextDate.

**Components in `src/modules/health/components/`:**

- `SleepChart.tsx` -- Stacked bar chart of sleep stages over last 30 days (Recharts). Props: `data: SleepData[]`.
- `SleepScoreCard.tsx` -- Single sleep score display with color coding. Props: `score: number; date: string`.
- `EnergyTimeline.tsx` -- Hourly energy level line chart with peak/trough annotations. Props: `forecast: EnergyForecast`.
- `StressGauge.tsx` -- Circular gauge showing current stress level with triggers. Props: `level: StressLevel`.
- `StressTrendChart.tsx` -- Line chart of daily stress averages. Props: `data: { date: string; average: number }[]`.
- `MedicalRecordList.tsx` -- List of medical records with type filter tabs. Props: `records: MedicalRecord[]`.
- `WearableConnectionCard.tsx` -- Connection status card with sync button. Props: `connection: WearableConnection`.

### 3. Household Module (M10)

**Types file:** `src/modules/household/types.ts`

```typescript
export interface MaintenanceTask {
  id: string;
  userId: string;
  category: 'HVAC' | 'PLUMBING' | 'ELECTRICAL' | 'LAWN' | 'APPLIANCE' | 'ROOF' | 'PEST' | 'GENERAL';
  title: string;
  description?: string;
  frequency: 'MONTHLY' | 'QUARTERLY' | 'BIANNUAL' | 'ANNUAL' | 'ONE_TIME';
  season?: 'SPRING' | 'SUMMER' | 'FALL' | 'WINTER' | 'ANY';
  lastCompletedDate?: Date;
  nextDueDate: Date;
  assignedProviderId?: string;
  estimatedCostUsd?: number;
  status: 'UPCOMING' | 'OVERDUE' | 'COMPLETED' | 'SKIPPED';
  notes?: string;
}

export interface ServiceProvider {
  id: string;
  userId: string;
  name: string;
  category: string;
  phone?: string;
  email?: string;
  rating: number;              // 0-5
  lastUsed?: Date;
  notes?: string;
  costHistory: { date: Date; amount: number; service: string }[];
}

export interface ShoppingItem {
  id: string;
  userId: string;
  name: string;
  category: string;
  quantity: number;
  unit?: string;
  store?: string;
  estimatedPrice?: number;
  isPurchased: boolean;
  isRecurring: boolean;
  recurringFrequency?: string;
  addedAt: Date;
}

export interface WarrantyRecord {
  id: string;
  userId: string;
  itemName: string;
  purchaseDate: Date;
  warrantyEndDate: Date;
  provider: string;
  receiptUrl?: string;
  claimPhone?: string;
  isExpiring: boolean;         // within 30 days
  isExpired: boolean;
  notes?: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  name: string;
  costPerMonth: number;
  billingCycle: 'MONTHLY' | 'ANNUAL';
  renewalDate: Date;
  category: string;
  isActive: boolean;
  autoRenew: boolean;
  cancellationUrl?: string;
}

export interface VehicleRecord {
  id: string;
  userId: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  mileage: number;
  nextServiceDate?: Date;
  nextServiceType?: string;
  insuranceExpiry?: Date;
  registrationExpiry?: Date;
  maintenanceHistory: { date: Date; type: string; cost: number; mileage: number; provider: string }[];
}

export interface FamilyMember {
  id: string;
  userId: string;
  name: string;
  relationship: string;
  email?: string;
  phone?: string;
  visibility: 'FULL' | 'LIMITED' | 'NONE';
  sharedCalendar: boolean;
  sharedTasks: boolean;
  sharedShopping: boolean;
}
```

**Service file:** `src/modules/household/services/maintenance-service.ts`

Implement:
- `createTask(userId: string, task: Omit<MaintenanceTask, 'id' | 'status'>): Promise<MaintenanceTask>` -- Creates a maintenance task with calculated next due date based on frequency and season.
- `getUpcomingTasks(userId: string, days: number): Promise<MaintenanceTask[]>` -- Returns tasks due in next N days.
- `getOverdueTasks(userId: string): Promise<MaintenanceTask[]>` -- Returns overdue tasks.
- `completeTask(taskId: string): Promise<MaintenanceTask>` -- Marks complete and calculates next due date.
- `getSeasonalSchedule(userId: string, season: string): Promise<MaintenanceTask[]>` -- Returns tasks for a specific season.
- `generateAnnualSchedule(userId: string): Promise<MaintenanceTask[]>` -- Creates a full year of maintenance tasks from templates (HVAC filter changes quarterly, gutter cleaning biannual, lawn care monthly in spring/summer/fall, pest control quarterly, HVAC tune-up biannual, smoke detector battery annual, dryer vent cleaning annual).

**Service file:** `src/modules/household/services/provider-service.ts`

Implement:
- `addProvider(userId: string, provider: Omit<ServiceProvider, 'id' | 'costHistory'>): Promise<ServiceProvider>`
- `getProviders(userId: string, category?: string): Promise<ServiceProvider[]>`
- `updateProvider(providerId: string, updates: Partial<ServiceProvider>): Promise<ServiceProvider>`
- `logServiceCall(providerId: string, date: Date, amount: number, service: string): Promise<ServiceProvider>` -- Adds to cost history.
- `getRecommendedProvider(userId: string, category: string): Promise<ServiceProvider | null>` -- Returns highest-rated provider in category.

**Service file:** `src/modules/household/services/shopping-service.ts`

Implement:
- `addItem(userId: string, item: Omit<ShoppingItem, 'id' | 'isPurchased' | 'addedAt'>): Promise<ShoppingItem>`
- `getList(userId: string, incluePurchased?: boolean): Promise<ShoppingItem[]>`
- `markPurchased(itemId: string): Promise<ShoppingItem>`
- `getSmartSuggestions(userId: string): Promise<ShoppingItem[]>` -- Based on recurring items and purchase history, suggests items to add.
- `groupByStore(items: ShoppingItem[]): Record<string, ShoppingItem[]>` -- Groups unpurchased items by store for efficient shopping.

**Service file:** `src/modules/household/services/warranty-service.ts`

Implement:
- `addWarranty(userId: string, warranty: Omit<WarrantyRecord, 'id' | 'isExpiring' | 'isExpired'>): Promise<WarrantyRecord>`
- `getWarranties(userId: string): Promise<WarrantyRecord[]>` -- Returns all with computed isExpiring/isExpired.
- `getExpiringWarranties(userId: string, days: number): Promise<WarrantyRecord[]>` -- Returns warranties expiring within N days.
- `addSubscription(userId: string, sub: Omit<SubscriptionRecord, 'id'>): Promise<SubscriptionRecord>`
- `getSubscriptions(userId: string): Promise<SubscriptionRecord[]>`
- `getMonthlySubscriptionCost(userId: string): Promise<number>` -- Total monthly cost of all active subscriptions.
- `getUpcomingRenewals(userId: string, days: number): Promise<SubscriptionRecord[]>`

**Service file:** `src/modules/household/services/vehicle-service.ts`

Implement:
- `addVehicle(userId: string, vehicle: Omit<VehicleRecord, 'id' | 'maintenanceHistory'>): Promise<VehicleRecord>`
- `getVehicles(userId: string): Promise<VehicleRecord[]>`
- `logMaintenance(vehicleId: string, entry: { date: Date; type: string; cost: number; mileage: number; provider: string }): Promise<VehicleRecord>`
- `getUpcomingService(userId: string): Promise<VehicleRecord[]>` -- Returns vehicles with service due in next 30 days.
- `checkExpiringDocuments(userId: string): Promise<{ vehicleId: string; type: string; expiryDate: Date }[]>` -- Returns vehicles with insurance or registration expiring in 30 days.

**Service file:** `src/modules/household/services/family-service.ts`

Implement:
- `addMember(userId: string, member: Omit<FamilyMember, 'id'>): Promise<FamilyMember>`
- `getMembers(userId: string): Promise<FamilyMember[]>`
- `updateMemberPrivacy(memberId: string, visibility: string, options: { sharedCalendar?: boolean; sharedTasks?: boolean; sharedShopping?: boolean }): Promise<FamilyMember>` -- Updates privacy controls.
- `getSharedItems(userId: string, memberId: string): Promise<{ tasks: boolean; calendar: boolean; shopping: boolean }>` -- Returns what is shared with a specific family member.

**Components in `src/modules/household/components/`:**

- `MaintenanceCalendar.tsx` -- Monthly calendar view with maintenance tasks color-coded by category. Props: `tasks: MaintenanceTask[]`.
- `MaintenanceTaskCard.tsx` -- Task card with status badge, due date, assigned provider. Props: `task: MaintenanceTask`.
- `ProviderDirectory.tsx` -- Searchable provider list with rating stars and category filter. Props: `providers: ServiceProvider[]`.
- `ShoppingList.tsx` -- Interactive shopping list with checkboxes, grouped by store. Props: `items: ShoppingItem[]`.
- `WarrantyTracker.tsx` -- Grid of warranty cards with expiry countdown. Props: `warranties: WarrantyRecord[]`.
- `SubscriptionManager.tsx` -- List of subscriptions with monthly total and renewal dates. Props: `subscriptions: SubscriptionRecord[]`.
- `VehicleDashboard.tsx` -- Vehicle cards with service status and document expiry warnings. Props: `vehicles: VehicleRecord[]`.

### 4. Crisis Module (M22)

**Types file:** `src/modules/crisis/types.ts`

```typescript
export type CrisisType = 'LEGAL_THREAT' | 'PR_ISSUE' | 'HEALTH_EMERGENCY' | 'FINANCIAL_ANOMALY' | 'DATA_BREACH' | 'CLIENT_COMPLAINT' | 'REGULATORY_INQUIRY' | 'NATURAL_DISASTER';
export type CrisisSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CrisisStatus = 'DETECTED' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'MITIGATED' | 'RESOLVED' | 'POST_MORTEM';

export interface CrisisEvent {
  id: string;
  userId: string;
  entityId: string;
  type: CrisisType;
  severity: CrisisSeverity;
  status: CrisisStatus;
  title: string;
  description: string;
  detectedAt: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalationChain: EscalationStep[];
  playbook?: CrisisPlaybook;
  warRoom: WarRoomState;
  postIncidentReview?: PostIncidentReview;
}

export interface CrisisDetectionSignal {
  source: string;               // "message", "financial", "calendar", "external"
  signalType: string;
  confidence: number;
  rawData: Record<string, unknown>;
  timestamp: Date;
}

export interface EscalationStep {
  order: number;
  contactId?: string;
  contactName: string;
  contactMethod: 'PHONE' | 'SMS' | 'EMAIL' | 'PUSH';
  escalateAfterMinutes: number;
  status: 'PENDING' | 'NOTIFIED' | 'ACKNOWLEDGED' | 'SKIPPED';
  notifiedAt?: Date;
  acknowledgedAt?: Date;
}

export interface EscalationChainConfig {
  crisisType: CrisisType;
  steps: Omit<EscalationStep, 'status' | 'notifiedAt' | 'acknowledgedAt'>[];
}

export interface CrisisPlaybook {
  id: string;
  name: string;
  crisisType: CrisisType;
  steps: PlaybookAction[];
  estimatedResolutionHours: number;
  lastUsed?: Date;
}

export interface PlaybookAction {
  order: number;
  title: string;
  description: string;
  actionType: 'COMMUNICATION' | 'DOCUMENTATION' | 'TECHNICAL' | 'LEGAL' | 'FINANCIAL' | 'HUMAN';
  isAutomatable: boolean;
  automationConfig?: Record<string, unknown>;
  isComplete: boolean;
  completedAt?: Date;
}

export interface WarRoomState {
  isActive: boolean;
  activatedAt?: Date;
  clearedCalendarEvents: string[];
  surfacedDocuments: string[];
  draftedComms: string[];
  participants: string[];
}

export interface PostIncidentReview {
  crisisId: string;
  timeline: { timestamp: Date; event: string; actor: string }[];
  rootCause: string;
  whatWorked: string[];
  whatFailed: string[];
  actionItems: { title: string; assignee: string; dueDate: Date; status: string }[];
  lessonsLearned: string[];
}

export interface DeadManSwitch {
  userId: string;
  isEnabled: boolean;
  checkInIntervalHours: number;
  lastCheckIn: Date;
  missedCheckIns: number;
  triggerAfterMisses: number;
  protocols: DeadManProtocol[];
}

export interface DeadManProtocol {
  order: number;
  action: string;
  contactId?: string;
  contactName: string;
  message: string;
  delayHoursAfterTrigger: number;
}

export interface PhoneTreeNode {
  contactId: string;
  contactName: string;
  phone: string;
  order: number;
  role: string;                 // e.g., "Primary", "Backup", "Legal", "Medical"
  children: PhoneTreeNode[];
}
```

**Service file:** `src/modules/crisis/services/detection-service.ts`

Implement:
- `analyzeSignals(signals: CrisisDetectionSignal[]): Promise<{ isCrisis: boolean; type?: CrisisType; severity?: CrisisSeverity; confidence: number; explanation: string }>` -- Analyzes multiple signals to determine if a crisis is occurring. Pattern detection:
  - LEGAL_THREAT: Messages containing "lawsuit", "subpoena", "legal action", "cease and desist"
  - PR_ISSUE: Multiple negative sentiment messages from different contacts within 24 hours
  - HEALTH_EMERGENCY: Calendar cancellations + missed check-ins + medical-related messages
  - FINANCIAL_ANOMALY: Unusual transaction patterns (> 3x average, multiple large transactions same day)
  - DATA_BREACH: Security-related messages + unusual access patterns
  - CLIENT_COMPLAINT: Multiple complaint messages from same entity within 48 hours
- `createCrisisEvent(userId: string, entityId: string, type: CrisisType, severity: CrisisSeverity, title: string, description: string): Promise<CrisisEvent>` -- Creates a crisis event and initiates the escalation chain.
- `getActiveCrises(userId: string): Promise<CrisisEvent[]>` -- Returns all non-resolved crises.

**Service file:** `src/modules/crisis/services/escalation-service.ts`

Implement:
- `getEscalationChain(crisisType: CrisisType): EscalationChainConfig` -- Returns the configured escalation chain for a crisis type. Defaults provided for each type.
- `setEscalationChain(config: EscalationChainConfig): void` -- Configures a custom escalation chain.
- `executeEscalation(crisisId: string): Promise<EscalationStep[]>` -- Begins the escalation process: notifies first contact, waits for acknowledgment, escalates if no response within configured minutes.
- `acknowledgeEscalation(crisisId: string, stepOrder: number): Promise<CrisisEvent>` -- Records acknowledgment at a step, stops further escalation.
- `getEscalationStatus(crisisId: string): Promise<EscalationStep[]>` -- Returns current state of all escalation steps.

**Service file:** `src/modules/crisis/services/playbook-service.ts`

Implement:
- `getPlaybook(crisisType: CrisisType): CrisisPlaybook` -- Returns the playbook for a crisis type. Built-in playbooks:
  - DATA_BREACH: Contain, assess scope, notify legal, notify affected parties, regulatory filing, post-mortem (est. 72h)
  - CLIENT_COMPLAINT: Acknowledge, investigate, draft response, executive review, resolve, follow-up (est. 24h)
  - FINANCIAL_ANOMALY: Freeze accounts, audit trail, notify finance, investigate, resolve, new controls (est. 48h)
  - REGULATORY_INQUIRY: Acknowledge receipt, engage legal, document preservation, response preparation, submit response, monitor (est. 168h)
  - LEGAL_THREAT: Do not respond, engage legal counsel, preserve documents, assess exposure, strategy session, respond through counsel (est. 72h)
- `executePlaybookStep(crisisId: string, stepOrder: number): Promise<CrisisEvent>` -- Marks a step complete and triggers any automatable actions.
- `getCustomPlaybooks(userId: string): Promise<CrisisPlaybook[]>` -- Returns user-defined playbooks.
- `createPlaybook(playbook: Omit<CrisisPlaybook, 'id' | 'lastUsed'>): Promise<CrisisPlaybook>`

**Service file:** `src/modules/crisis/services/war-room-service.ts`

Implement:
- `activateWarRoom(crisisId: string): Promise<WarRoomState>` -- Activates war room mode: clears non-essential calendar events for next 24h, surfaces relevant documents, drafts initial communications, gathers participants.
- `deactivateWarRoom(crisisId: string): Promise<void>` -- Restores normal state.
- `getWarRoomState(crisisId: string): Promise<WarRoomState>` -- Returns current war room state.
- `addWarRoomDocument(crisisId: string, documentId: string): Promise<WarRoomState>` -- Surfaces a document in the war room.

**Service file:** `src/modules/crisis/services/dead-man-switch-service.ts`

Implement:
- `configure(userId: string, config: Omit<DeadManSwitch, 'lastCheckIn' | 'missedCheckIns'>): Promise<DeadManSwitch>` -- Sets up the dead man's switch.
- `checkIn(userId: string): Promise<DeadManSwitch>` -- Records a check-in, resets missed counter.
- `evaluateSwitch(userId: string): Promise<{ triggered: boolean; missedCheckIns: number; protocols: DeadManProtocol[] }>` -- Checks if the switch should be triggered. Returns the protocols to execute if triggered.
- `getStatus(userId: string): Promise<DeadManSwitch>` -- Returns current switch status.
- `addProtocol(userId: string, protocol: Omit<DeadManProtocol, 'order'>): Promise<DeadManSwitch>` -- Adds a protocol to the switch.

**Service file:** `src/modules/crisis/services/post-incident-service.ts`

Implement:
- `generateReview(crisisId: string): Promise<PostIncidentReview>` -- Builds a post-incident review from the crisis event timeline, actions taken, and outcomes.
- `addActionItem(crisisId: string, item: { title: string; assignee: string; dueDate: Date }): Promise<PostIncidentReview>`
- `addLessonLearned(crisisId: string, lesson: string): Promise<PostIncidentReview>`

**Service file:** `src/modules/crisis/services/phone-tree-service.ts`

Implement:
- `buildPhoneTree(userId: string, crisisType: CrisisType): Promise<PhoneTreeNode[]>` -- Builds a phone tree from contacts and escalation chain config.
- `getPhoneTree(userId: string): Promise<PhoneTreeNode[]>` -- Returns the stored phone tree.
- `updatePhoneTree(userId: string, tree: PhoneTreeNode[]): Promise<void>` -- Saves a custom phone tree.

**Components in `src/modules/crisis/components/`:**

- `CrisisAlertBanner.tsx` -- Full-width emergency banner with severity color, title, and acknowledge button. Props: `crisis: CrisisEvent`.
- `EscalationTimeline.tsx` -- Vertical timeline showing escalation steps with status indicators. Props: `steps: EscalationStep[]`.
- `PlaybookProgress.tsx` -- Step-by-step playbook view with checkboxes and progress bar. Props: `playbook: CrisisPlaybook`.
- `WarRoomPanel.tsx` -- War room overview: surfaced docs, drafted comms, participants, cleared events. Props: `state: WarRoomState`.
- `DeadManSwitchConfig.tsx` -- Configuration form for dead man's switch with protocol list. Props: `config: DeadManSwitch; onSave: (config: DeadManSwitch) => void`.
- `PostIncidentReport.tsx` -- Formatted post-incident review with timeline, root cause, and action items. Props: `review: PostIncidentReview`.
- `PhoneTreeVisualization.tsx` -- Tree diagram showing phone tree hierarchy. Props: `tree: PhoneTreeNode[]`.
- `CrisisDashboard.tsx` -- Overview of all active crises with severity badges and quick actions. Props: `crises: CrisisEvent[]`.

All components must be client components (`'use client'`) using Tailwind CSS. No external UI libraries.

### 5. API Routes

| Route File | Method | Path | Purpose |
|------------|--------|------|---------|
| `src/app/api/travel/itineraries/route.ts` | GET | `/api/travel/itineraries?userId=&status=` | List itineraries |
| `src/app/api/travel/itineraries/route.ts` | POST | `/api/travel/itineraries` | Create itinerary |
| `src/app/api/travel/itineraries/[id]/route.ts` | GET | `/api/travel/itineraries/:id` | Get itinerary |
| `src/app/api/travel/preferences/route.ts` | GET | `/api/travel/preferences?userId=` | Get travel preferences |
| `src/app/api/travel/preferences/route.ts` | PUT | `/api/travel/preferences` | Update preferences |
| `src/app/api/travel/visa/route.ts` | GET | `/api/travel/visa?citizenship=&destination=` | Check visa requirements |
| `src/app/api/health/wearables/route.ts` | GET | `/api/health/wearables?userId=` | List wearable connections |
| `src/app/api/health/wearables/route.ts` | POST | `/api/health/wearables` | Connect a wearable |
| `src/app/api/health/sleep/route.ts` | GET | `/api/health/sleep?userId=&days=` | Get sleep history |
| `src/app/api/health/energy/route.ts` | GET | `/api/health/energy?userId=&date=` | Get energy forecast |
| `src/app/api/health/stress/route.ts` | GET | `/api/health/stress?userId=&days=` | Get stress history |
| `src/app/api/health/stress/route.ts` | POST | `/api/health/stress` | Record stress level |
| `src/app/api/health/medical/route.ts` | GET | `/api/health/medical?userId=&type=` | List medical records |
| `src/app/api/health/medical/route.ts` | POST | `/api/health/medical` | Add medical record |
| `src/app/api/household/maintenance/route.ts` | GET | `/api/household/maintenance?userId=` | List maintenance tasks |
| `src/app/api/household/maintenance/route.ts` | POST | `/api/household/maintenance` | Create maintenance task |
| `src/app/api/household/shopping/route.ts` | GET | `/api/household/shopping?userId=` | Get shopping list |
| `src/app/api/household/shopping/route.ts` | POST | `/api/household/shopping` | Add shopping item |
| `src/app/api/household/vehicles/route.ts` | GET | `/api/household/vehicles?userId=` | List vehicles |
| `src/app/api/household/vehicles/route.ts` | POST | `/api/household/vehicles` | Add vehicle |
| `src/app/api/crisis/route.ts` | GET | `/api/crisis?userId=` | List active crises |
| `src/app/api/crisis/route.ts` | POST | `/api/crisis` | Create crisis event |
| `src/app/api/crisis/[id]/route.ts` | GET | `/api/crisis/:id` | Get crisis detail |
| `src/app/api/crisis/[id]/acknowledge/route.ts` | POST | `/api/crisis/:id/acknowledge` | Acknowledge crisis |
| `src/app/api/crisis/[id]/war-room/route.ts` | POST | `/api/crisis/:id/war-room` | Activate/deactivate war room |
| `src/app/api/crisis/detect/route.ts` | POST | `/api/crisis/detect` | Submit signals for crisis detection |
| `src/app/api/crisis/dead-man-switch/route.ts` | GET | `/api/crisis/dead-man-switch?userId=` | Get switch status |
| `src/app/api/crisis/dead-man-switch/route.ts` | POST | `/api/crisis/dead-man-switch` | Configure switch |
| `src/app/api/crisis/dead-man-switch/check-in/route.ts` | POST | `/api/crisis/dead-man-switch/check-in` | Record check-in |

All routes MUST use Zod validation, `success()`/`error()`/`paginated()` from `@/shared/utils/api-response`, and `prisma` from `@/lib/db`.

### 6. Dashboard Pages

**Travel:** `src/app/(dashboard)/travel/page.tsx` -- Itinerary list, upcoming flights, document checklist, alerts
**Health:** `src/app/(dashboard)/health/page.tsx` -- Sleep chart, energy timeline, stress gauge, medical records
**Household:** `src/app/(dashboard)/household/page.tsx` -- Maintenance calendar, shopping list, vehicle dashboard, warranty tracker
**Crisis:** `src/app/(dashboard)/crisis/page.tsx` -- Active crises dashboard, escalation status, playbook progress, dead man's switch

## Acceptance Criteria

- [ ] Crisis detection correctly identifies all 6 crisis types from signal patterns
- [ ] Escalation routing follows configured chain with proper timeout escalation
- [ ] War room activation clears calendar and surfaces relevant documents
- [ ] Dead man's switch triggers after configured number of missed check-ins
- [ ] Post-incident review generates complete timeline from crisis event data
- [ ] Itinerary builder handles multi-leg trips with cost totaling
- [ ] Timezone adjustment flags conflicts for events outside reasonable hours
- [ ] Visa checker returns correct requirements for all configured country pairs
- [ ] Sleep optimization correlates sleep quality with productivity metrics
- [ ] Energy forecast identifies peak and trough hours
- [ ] Stress adjustment suggests schedule changes when stress > 70
- [ ] Maintenance scheduler generates a full annual schedule from templates
- [ ] All 29 API routes return correct `ApiResponse<T>` shapes
- [ ] All unit tests pass with `npx jest tests/unit/life-modules/`
- [ ] No imports from other worker-owned paths
- [ ] No modifications to shared/immutable files

## Implementation Steps

1. **Read context files** -- all shared contracts
2. **Create branch**: `git checkout -b ai-feature/w19-life-modules`
3. **Create type files** for all 4 modules
4. **Build Travel services** (preferences, itinerary, flight monitor, timezone, visa checker)
5. **Build Health services** (wearable, sleep, energy, stress, medical)
6. **Build Household services** (maintenance, provider, shopping, warranty, vehicle, family)
7. **Build Crisis services** (detection, escalation, playbook, war room, dead man switch, post-incident, phone tree)
8. **Build components** for all 4 modules
9. **Build API routes** -- All 29 route files with Zod schemas
10. **Build dashboard pages** for all 4 modules
11. **Write tests** for crisis detection and escalation routing
12. **Verify** -- `npx tsc --noEmit`, `npx jest tests/unit/life-modules/`, `npx next build`

## Tests

Create these test files in `tests/unit/life-modules/`:

### `tests/unit/life-modules/crisis-detection.test.ts`

```typescript
describe('analyzeSignals', () => {
  it('should detect LEGAL_THREAT from legal keyword signals');
  it('should detect PR_ISSUE from multiple negative sentiment signals');
  it('should detect HEALTH_EMERGENCY from cancellation + missed check-in pattern');
  it('should detect FINANCIAL_ANOMALY from unusual transaction patterns');
  it('should detect DATA_BREACH from security-related signals');
  it('should detect CLIENT_COMPLAINT from multiple complaints within 48h');
  it('should return isCrisis=false when no patterns match');
  it('should assign correct severity based on signal confidence');
  it('should handle empty signals array');
});
```

### `tests/unit/life-modules/escalation-routing.test.ts`

```typescript
describe('getEscalationChain', () => {
  it('should return default chain for each crisis type');
  it('should return custom chain when configured');
});

describe('executeEscalation', () => {
  it('should notify first contact in chain');
  it('should escalate to next contact after timeout');
  it('should stop escalation on acknowledgment');
  it('should handle chain with single contact');
  it('should handle all contacts unresponsive');
});

describe('acknowledgeEscalation', () => {
  it('should mark step as acknowledged');
  it('should stop further escalation');
  it('should update crisis event status');
});
```

### `tests/unit/life-modules/dead-man-switch.test.ts`

```typescript
describe('evaluateSwitch', () => {
  it('should not trigger when check-in is recent');
  it('should increment missed count when overdue');
  it('should trigger after configured number of misses');
  it('should return protocols to execute on trigger');
  it('should not trigger when disabled');
});

describe('checkIn', () => {
  it('should reset missed counter');
  it('should update lastCheckIn timestamp');
});
```

### `tests/unit/life-modules/itinerary-service.test.ts`

```typescript
describe('createItinerary', () => {
  it('should calculate total cost from legs');
  it('should order legs correctly');
  it('should handle single-leg trips');
  it('should handle multi-leg trips');
});

describe('addLeg / removeLeg', () => {
  it('should reorder legs after addition');
  it('should reorder legs after removal');
  it('should recalculate total cost');
});
```

### `tests/unit/life-modules/maintenance-scheduler.test.ts`

```typescript
describe('generateAnnualSchedule', () => {
  it('should create quarterly HVAC filter tasks');
  it('should create biannual gutter cleaning tasks');
  it('should create seasonal lawn care tasks');
  it('should assign correct seasons to tasks');
  it('should calculate next due dates correctly');
});

describe('completeTask', () => {
  it('should calculate next due date based on frequency');
  it('should handle ONE_TIME tasks (no next date)');
});
```

Mock the Prisma client in all tests. Use `jest.mock('@/lib/db')`. No live database required.

## Commit Strategy

Use Conventional Commits. Commit after each logical unit is complete and compiling.

```
feat(travel): add travel types and preferences service
feat(travel): implement multi-leg itinerary builder
feat(travel): add flight monitoring and disruption response
feat(travel): add timezone management and visa checker
feat(travel): add travel dashboard components
feat(health): add health types and wearable connection service
feat(health): implement sleep analysis and energy forecasting
feat(health): add stress monitoring with schedule adjustment
feat(health): add medical record tracking
feat(health): add health dashboard components
feat(household): add household types and maintenance scheduler
feat(household): implement provider directory and shopping intelligence
feat(household): add warranty, subscription, and vehicle management
feat(household): add family coordination with privacy controls
feat(household): add household dashboard components
feat(crisis): add crisis types and detection service
feat(crisis): implement escalation routing with configurable chains
feat(crisis): add crisis playbooks with built-in templates
feat(crisis): implement war room mode
feat(crisis): add dead man's switch and post-incident review
feat(crisis): add phone tree and crisis dashboard components
feat(life-modules): add all API routes with Zod validation
feat(life-modules): add dashboard pages for travel, health, household, crisis
test(life-modules): add unit tests for crisis detection and escalation
test(life-modules): add unit tests for dead man's switch
test(life-modules): add unit tests for itinerary and maintenance scheduler
chore(life-modules): verify build and final cleanup
```

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
