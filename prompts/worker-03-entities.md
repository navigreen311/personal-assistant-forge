# Worker 03: Multi-Entity Management (M23)

## Branch: ai-feature/w03-entities

Create and check out the branch `ai-feature/w03-entities` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `src/modules/entities/` (all files -- services, components, types)
- `src/app/api/entities/` (all files -- API routes)
- `src/app/(dashboard)/entities/` (all files -- UI pages)
- `tests/unit/entities/` (all files)

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files. They define the project contracts:

1. **`prisma/schema.prisma`** -- The Entity model has: id, userId, name, type, complianceProfile (String[]), brandKit (Json?), voicePersonaId, phoneNumbers (String[]), createdAt, updatedAt. Entity has relations to: User, Contact[], Task[], Project[], CalendarEvent[], Message[], Document[], KnowledgeEntry[], Workflow[], Call[], Rule[], FinancialRecord[].
2. **`src/shared/types/index.ts`** -- The `Entity`, `BrandKit`, `ComplianceProfile`, `User`, `Project`, `ProjectHealth`, `Task`, `TaskStatus`, `FinancialRecord`, `Contact` types. Your API responses must conform to these.
3. **`src/shared/utils/api-response.ts`** -- Use `success()`, `error()`, and `paginated()` for all API responses.
4. **`src/lib/db/index.ts`** -- Import `prisma` from here.
5. **`package.json`** -- Note `zod` is available for validation. `date-fns` is available for date operations.

### Dependencies on Other Workers

- **Auth (Worker 02)**: Your API routes should expect authenticated sessions. Since Worker 02 may not be merged yet, create a local stub for auth in your service layer. Use a `getCurrentUserId()` helper that reads from headers or returns a placeholder. When Worker 02's middleware is available, it will be easy to swap in.
- **Database (Worker 01)**: Worker 01 creates pagination and query helpers. If those are not available, implement local versions within your module. Use the raw Prisma client directly.

## Requirements

### 1. Entity Service Layer (`src/modules/entities/entity.service.ts`)

The core business logic for entity management:

```typescript
// src/modules/entities/entity.service.ts

export class EntityService {
  // CRUD operations
  async createEntity(userId: string, data: CreateEntityInput): Promise<Entity>;
  async getEntity(entityId: string, userId: string): Promise<Entity | null>;
  async updateEntity(entityId: string, userId: string, data: UpdateEntityInput): Promise<Entity>;
  async deleteEntity(entityId: string, userId: string): Promise<void>;
  async listEntities(userId: string, params?: ListEntitiesParams): Promise<PaginatedResult<Entity>>;

  // Entity health & metrics
  async getEntityHealth(entityId: string): Promise<EntityHealthMetrics>;
  async getEntityDashboardData(entityId: string): Promise<EntityDashboardData>;
  async getUnifiedExecutiveView(userId: string): Promise<ExecutiveViewData>;

  // Cross-entity operations
  async findSharedContacts(userId: string): Promise<SharedContactResult[]>;
  async detectResourceConflicts(userId: string): Promise<ResourceConflict[]>;

  // Compliance
  async getComplianceStatus(entityId: string): Promise<ComplianceStatus>;
  async validateEntityOperation(entityId: string, operation: string): Promise<ComplianceValidation>;
}
```

### 2. Entity Types (`src/modules/entities/entity.types.ts`)

Define module-specific types (do NOT duplicate shared types, import them):

```typescript
// src/modules/entities/entity.types.ts

import { Entity, BrandKit, ComplianceProfile, ProjectHealth } from '@/shared/types';

export interface CreateEntityInput {
  name: string;
  type: string;        // 'LLC' | 'Corporation' | 'Personal' | 'Trust' | 'Partnership'
  complianceProfile?: ComplianceProfile[];
  brandKit?: BrandKit;
  voicePersonaId?: string;
  phoneNumbers?: string[];
}

export interface UpdateEntityInput {
  name?: string;
  type?: string;
  complianceProfile?: ComplianceProfile[];
  brandKit?: Partial<BrandKit>;
  voicePersonaId?: string;
  phoneNumbers?: string[];
}

export interface ListEntitiesParams {
  page?: number;
  pageSize?: number;
  search?: string;
  type?: string;
  sortBy?: string;     // 'name' | 'createdAt' | 'type'
  sortOrder?: 'asc' | 'desc';
}

export interface EntityHealthMetrics {
  entityId: string;
  entityName: string;
  overallHealth: ProjectHealth;     // GREEN, YELLOW, RED
  metrics: {
    activeProjects: number;
    projectsAtRisk: number;         // YELLOW or RED health
    openTasks: number;
    overdueTasks: number;
    pendingMessages: number;
    highPriorityItems: number;      // P0 tasks + triageScore >= 8 messages
    activeWorkflows: number;
    failedWorkflows: number;
    pendingFinancials: number;      // PENDING or OVERDUE financial records
    totalRevenue: number;           // sum of PAID invoices
    totalExpenses: number;          // sum of PAID expenses
    contactCount: number;
    avgRelationshipScore: number;
  };
  lastActivity: Date;
  alerts: EntityAlert[];
}

export interface EntityAlert {
  id: string;
  type: 'OVERDUE_TASK' | 'AT_RISK_PROJECT' | 'OVERDUE_PAYMENT' | 'COMPLIANCE_GAP' | 'STALE_CONTACT' | 'WORKFLOW_FAILURE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  entityId: string;
  resourceId: string;
  resourceType: string;
  createdAt: Date;
}

export interface EntityDashboardData {
  entity: Entity;
  health: EntityHealthMetrics;
  recentTasks: { id: string; title: string; status: string; priority: string; dueDate?: Date }[];
  recentMessages: { id: string; subject?: string; channel: string; triageScore: number; createdAt: Date }[];
  upcomingEvents: { id: string; title: string; startTime: Date; endTime: Date }[];
  financialSummary: {
    receivable: number;
    payable: number;
    overdue: number;
    monthlyBurn: number;
  };
  topContacts: { id: string; name: string; relationshipScore: number; lastTouch?: Date }[];
}

export interface ExecutiveViewData {
  userId: string;
  entities: EntityHealthMetrics[];
  aggregated: {
    totalOpenTasks: number;
    totalOverdueTasks: number;
    totalPendingMessages: number;
    totalRevenue: number;
    totalExpenses: number;
    netCashFlow: number;
    criticalAlerts: EntityAlert[];
  };
  crossEntityInsights: {
    sharedVendors: { vendor: string; entities: string[] }[];
    resourceConflicts: ResourceConflict[];
    upcomingDeadlines: { entityName: string; item: string; dueDate: Date }[];
  };
}

export interface SharedContactResult {
  contactName: string;
  email?: string;
  phone?: string;
  appearsIn: { entityId: string; entityName: string; contactId: string; role: string }[];
}

export interface ResourceConflict {
  type: 'SCHEDULE_OVERLAP' | 'BUDGET_OVERCOMMIT' | 'VENDOR_CONFLICT' | 'DEADLINE_CLASH';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  entities: string[];
  suggestedResolution: string;
}

export interface ComplianceStatus {
  entityId: string;
  profiles: ComplianceProfile[];
  status: 'COMPLIANT' | 'AT_RISK' | 'NON_COMPLIANT';
  checks: ComplianceCheck[];
  lastAudit?: Date;
}

export interface ComplianceCheck {
  profile: ComplianceProfile;
  requirement: string;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'NOT_APPLICABLE';
  details: string;
}

export interface ComplianceValidation {
  allowed: boolean;
  warnings: string[];
  blockers: string[];
}

// Persona context for multi-entity communication
export interface PersonaContext {
  entityId: string;
  entityName: string;
  entityType: string;
  voicePersonaId?: string;
  brandKit?: BrandKit;
  complianceProfile: ComplianceProfile[];
  responsePrefix: string;    // e.g., "Responding as MedLink Pro"
  toneGuidance: string;      // derived from brand kit toneGuide
  disclaimers: string[];     // compliance-required disclaimers
}
```

### 3. Persona Service (`src/modules/entities/persona.service.ts`)

Manage persona switching for multi-entity communication:

```typescript
// src/modules/entities/persona.service.ts

export class PersonaService {
  // Get persona context for an entity
  async getPersonaContext(entityId: string): Promise<PersonaContext>;

  // Get all available personas for a user
  async listPersonas(userId: string): Promise<PersonaContext[]>;

  // Validate that a draft message conforms to entity persona rules
  async validateMessageForPersona(entityId: string, message: string): Promise<{
    valid: boolean;
    suggestions: string[];
    complianceIssues: string[];
  }>;

  // Generate compliance disclaimers based on entity profile
  getComplianceDisclaimers(profiles: ComplianceProfile[]): string[];
}
```

### 4. Validation Schemas (`src/modules/entities/entity.validation.ts`)

Use Zod for input validation:

```typescript
// src/modules/entities/entity.validation.ts
import { z } from 'zod';

export const createEntitySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(50),
  complianceProfile: z.array(z.enum(['HIPAA', 'GDPR', 'CCPA', 'SOX', 'SEC', 'REAL_ESTATE', 'GENERAL'])).optional(),
  brandKit: z.object({
    primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    logoUrl: z.string().url().optional(),
    fontFamily: z.string().optional(),
    toneGuide: z.string().optional(),
  }).optional(),
  voicePersonaId: z.string().optional(),
  phoneNumbers: z.array(z.string()).optional(),
});

export const updateEntitySchema = createEntitySchema.partial();

export const listEntitiesSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().optional(),
  type: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'type']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
```

### 5. API Routes (`src/app/api/entities/`)

Implement RESTful API routes:

#### `src/app/api/entities/route.ts`
```
GET  /api/entities          -- List user's entities (paginated, filterable)
POST /api/entities          -- Create new entity
```

#### `src/app/api/entities/[entityId]/route.ts`
```
GET    /api/entities/:id    -- Get entity details
PATCH  /api/entities/:id    -- Update entity
DELETE /api/entities/:id    -- Soft delete entity
```

#### `src/app/api/entities/[entityId]/health/route.ts`
```
GET /api/entities/:id/health  -- Get entity health metrics
```

#### `src/app/api/entities/[entityId]/dashboard/route.ts`
```
GET /api/entities/:id/dashboard  -- Get full dashboard data
```

#### `src/app/api/entities/[entityId]/compliance/route.ts`
```
GET /api/entities/:id/compliance  -- Get compliance status
```

#### `src/app/api/entities/[entityId]/persona/route.ts`
```
GET /api/entities/:id/persona  -- Get persona context for this entity
```

#### `src/app/api/entities/executive-view/route.ts`
```
GET /api/entities/executive-view  -- Unified cross-entity executive view
```

#### `src/app/api/entities/shared-contacts/route.ts`
```
GET /api/entities/shared-contacts  -- Find contacts appearing across multiple entities
```

All routes must:
- Use `success()`, `error()`, `paginated()` from `@/shared/utils/api-response`.
- Validate input with Zod schemas.
- Verify entity ownership (userId matches).
- Handle errors with proper HTTP status codes (400, 401, 403, 404, 500).
- Return data conforming to shared types.

### 6. UI Components (`src/modules/entities/components/`)

#### Entity Switcher (`src/modules/entities/components/EntitySwitcher.tsx`)
A dropdown/selector component for the navigation bar:
- Displays current active entity name with colored indicator (from brandKit.primaryColor)
- Dropdown lists all user entities with type labels
- Shows health indicator dot (green/yellow/red) next to each entity
- Clicking switches the active entity context
- "Responding as [Entity Name]" label when in communication contexts
- "Manage Entities" link at bottom of dropdown
- Keyboard accessible (arrow keys, enter, escape)
- Uses `'use client'` directive

#### Entity Card (`src/modules/entities/components/EntityCard.tsx`)
A summary card for entity list views:
- Entity name and type badge
- Health status indicator (color-coded)
- Key metrics: open tasks, pending messages, upcoming events
- Compliance badges (HIPAA, GDPR, etc.)
- Brand color accent bar
- Click to navigate to entity dashboard
- Responsive design

#### Entity Health Badge (`src/modules/entities/components/EntityHealthBadge.tsx`)
Small visual indicator:
- GREEN: filled green circle
- YELLOW: filled yellow circle with warning icon
- RED: filled red circle with alert icon
- Tooltip with summary on hover

#### Entity Form (`src/modules/entities/components/EntityForm.tsx`)
Create/edit form:
- Name input
- Type selector (LLC, Corporation, Personal, Trust, Partnership)
- Compliance profile multi-select checkboxes
- Brand kit section (color pickers, logo URL, font, tone guide textarea)
- Phone numbers list (add/remove)
- Voice persona selector (placeholder for future integration)
- Save/Cancel buttons
- Zod validation with inline error messages

#### Executive Dashboard (`src/modules/entities/components/ExecutiveDashboard.tsx`)
Unified cross-entity view:
- Summary cards: total revenue, total expenses, net cash flow, critical alerts count
- Entity health grid (cards for each entity with health status)
- Cross-entity timeline: upcoming deadlines across all entities
- Shared vendor list
- Resource conflict warnings
- Responsive grid layout with Tailwind

### 7. UI Pages (`src/app/(dashboard)/entities/`)

#### Entity List Page (`src/app/(dashboard)/entities/page.tsx`)
- Header: "Entities" with "Create Entity" button
- Search bar and filter controls (by type)
- Grid of EntityCard components
- Empty state when no entities exist
- Loading skeleton states

#### Entity Dashboard Page (`src/app/(dashboard)/entities/[entityId]/page.tsx`)
- Entity name and type in header
- EntityHealthBadge
- Tabbed sections: Overview, Tasks, Messages, Calendar, Financial, Compliance
- Overview tab: key metrics cards, recent activity feed, top contacts
- Each tab shows relevant data from EntityDashboardData

#### Create Entity Page (`src/app/(dashboard)/entities/new/page.tsx`)
- EntityForm in create mode
- Redirects to entity dashboard on success

#### Edit Entity Page (`src/app/(dashboard)/entities/[entityId]/edit/page.tsx`)
- EntityForm in edit mode, pre-populated with existing data
- Redirects to entity dashboard on success

#### Executive View Page (`src/app/(dashboard)/entities/executive/page.tsx`)
- ExecutiveDashboard component
- Full-width layout
- Auto-refresh option

### 8. Module Barrel Export (`src/modules/entities/index.ts`)

```typescript
// src/modules/entities/index.ts
export { EntityService } from './entity.service';
export { PersonaService } from './persona.service';
export * from './entity.types';
export * from './entity.validation';
export { EntitySwitcher } from './components/EntitySwitcher';
export { EntityCard } from './components/EntityCard';
export { EntityHealthBadge } from './components/EntityHealthBadge';
export { EntityForm } from './components/EntityForm';
export { ExecutiveDashboard } from './components/ExecutiveDashboard';
```

## Acceptance Criteria

1. All CRUD API routes work: create, read, update, delete, list entities.
2. Entity health metrics are calculated correctly from related data (tasks, projects, messages, financials).
3. Executive view aggregates data across all user entities.
4. Shared contacts detection works across entities (matching by email or phone).
5. Resource conflict detection identifies schedule overlaps, budget issues, vendor conflicts.
6. Compliance status checks pass/fail based on entity's compliance profile.
7. Persona context returns correct brand kit, tone guidance, and disclaimers.
8. Entity switcher component renders with proper dropdown behavior.
9. All Zod validation schemas reject invalid input with descriptive errors.
10. All API routes return responses conforming to `ApiResponse<T>` shape.
11. All TypeScript files compile without errors (`npx tsc --noEmit`).
12. All unit tests pass.
13. No files created or modified outside owned paths.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`, `src/lib/db/index.ts`.
2. **Create branch**: `git checkout -b ai-feature/w03-entities`
3. **Create `src/modules/entities/entity.types.ts`**: All module-specific types.
4. **Create `src/modules/entities/entity.validation.ts`**: Zod schemas.
5. **Create `src/modules/entities/entity.service.ts`**: Full service with CRUD, health, executive view, cross-entity operations.
6. **Create `src/modules/entities/persona.service.ts`**: Persona context and validation.
7. **Create API routes**: All 8 route files in `src/app/api/entities/`.
8. **Create UI components**: EntitySwitcher, EntityCard, EntityHealthBadge, EntityForm, ExecutiveDashboard in `src/modules/entities/components/`.
9. **Create UI pages**: List, dashboard, create, edit, executive view in `src/app/(dashboard)/entities/`.
10. **Create `src/modules/entities/index.ts`**: Barrel export.
11. **Create tests** in `tests/unit/entities/`.
12. **Type-check**: `npx tsc --noEmit`.
13. **Run tests**: `npx jest tests/unit/entities/`.
14. **Commit** with conventional commits.

## Tests

Create test files in `tests/unit/entities/`:

### `tests/unit/entities/entity.service.test.ts`
```typescript
// Mock Prisma client

describe('EntityService', () => {
  describe('createEntity', () => {
    it('should create entity with required fields');
    it('should set default compliance profile to GENERAL');
    it('should associate entity with user');
  });

  describe('getEntity', () => {
    it('should return entity when user owns it');
    it('should return null when user does not own it');
    it('should return null for non-existent entity');
  });

  describe('updateEntity', () => {
    it('should update allowed fields');
    it('should not allow updating another user entity');
    it('should merge brandKit updates (partial update)');
  });

  describe('deleteEntity', () => {
    it('should delete entity owned by user');
    it('should reject deletion of entity not owned by user');
  });

  describe('listEntities', () => {
    it('should return paginated results');
    it('should filter by type');
    it('should search by name');
    it('should sort by specified field');
  });

  describe('getEntityHealth', () => {
    it('should calculate GREEN health when no issues');
    it('should calculate YELLOW health when some tasks overdue');
    it('should calculate RED health when critical issues exist');
    it('should count metrics correctly');
  });

  describe('getUnifiedExecutiveView', () => {
    it('should aggregate metrics across all entities');
    it('should identify shared vendors');
    it('should calculate net cash flow');
  });

  describe('findSharedContacts', () => {
    it('should find contacts appearing in multiple entities by email');
    it('should find contacts appearing in multiple entities by phone');
    it('should return empty for no shared contacts');
  });
});
```

### `tests/unit/entities/persona.service.test.ts`
```typescript
describe('PersonaService', () => {
  describe('getPersonaContext', () => {
    it('should return persona with brand kit info');
    it('should include compliance disclaimers for HIPAA entity');
    it('should generate response prefix from entity name');
  });

  describe('validateMessageForPersona', () => {
    it('should flag PHI in non-HIPAA entity messages');
    it('should suggest tone adjustments based on brand kit');
  });

  describe('getComplianceDisclaimers', () => {
    it('should return HIPAA disclaimer for HIPAA profile');
    it('should return GDPR disclaimer for GDPR profile');
    it('should return empty for GENERAL profile');
    it('should combine multiple disclaimers');
  });
});
```

### `tests/unit/entities/entity.validation.test.ts`
```typescript
describe('createEntitySchema', () => {
  it('should accept valid entity input');
  it('should reject empty name');
  it('should reject name over 100 chars');
  it('should reject invalid compliance profile values');
  it('should reject invalid brandKit color format');
  it('should accept entity without optional fields');
});

describe('updateEntitySchema', () => {
  it('should accept partial updates');
  it('should accept empty object');
});

describe('listEntitiesSchema', () => {
  it('should accept valid list params');
  it('should reject pageSize over 100');
  it('should coerce string numbers to integers');
});
```

## Commit Strategy

Make atomic commits in this order:

1. `feat(entities): add entity types, validation schemas, and service layer`
   - Files: `entity.types.ts`, `entity.validation.ts`, `entity.service.ts`, `persona.service.ts`, `index.ts`
2. `feat(entities): add entity CRUD and analytics API routes`
   - Files: All files in `src/app/api/entities/`
3. `feat(entities): add entity UI components (switcher, card, form, dashboard)`
   - Files: All files in `src/modules/entities/components/`
4. `feat(entities): add entity management UI pages`
   - Files: All files in `src/app/(dashboard)/entities/`
5. `test(entities): add unit tests for entity services and validation`
   - Files: All files in `tests/unit/entities/`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
