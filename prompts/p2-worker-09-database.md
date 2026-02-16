# Worker 09: Database Schema Updates & Migrations

## Branch: ai-feature/p2-w09-database

Create and check out the branch `ai-feature/p2-w09-database` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `prisma/schema.prisma`
- `prisma/seed.ts`
- `prisma/migrations/` (all migration files within)

**DO NOT modify these files:**
- `jest.config.ts` -- shared config, do not modify
- `package.json` -- shared config, do not modify
- Any files in `src/` -- owned by other workers

## Context (read these first before modifying)

Before writing any code, read and internalize these files:

1. **`prisma/schema.prisma`** -- The current Prisma schema. You WILL modify this file. Understand every existing model, relation, enum, and index before making changes.
2. **`prisma/seed.ts`** -- The current seed script. You WILL modify this file to add seed data for new models.
3. **`src/shared/types/index.ts`** -- TypeScript type definitions. Your new schema models should align with types referenced here. Do NOT modify this file.
4. **`package.json`** -- Check the prisma and database scripts. Do NOT modify.
5. **`tsconfig.json`** -- Path alias `@/*` maps to `./src/*`.

## Requirements

### 1. Add Missing Models to `prisma/schema.prisma`

Add the following 5 new models to the schema. Place them logically near related models and follow the existing naming conventions (camelCase fields, cuid default IDs, createdAt/updatedAt timestamps).

#### Decision Model

```prisma
model Decision {
  id          String   @id @default(cuid())
  entityId    String
  entity      Entity   @relation(fields: [entityId], references: [id], onDelete: Cascade)
  title       String
  type        String   // e.g., "strategic", "operational", "financial", "hiring", "product"
  status      String   @default("open") // "open", "in_review", "decided", "deferred", "cancelled"
  options     Json     // Array of option objects: [{ id, label, description, pros, cons, score }]
  matrix      Json?    // Decision matrix: { criteria: [...], weights: [...], scores: {...} }
  outcome     String?  // Selected option or final decision text
  rationale   String?  // Why this decision was made
  deadline    DateTime?
  decidedAt   DateTime?
  decidedBy   String?
  stakeholders Json?   // Array of { userId, role, vote }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([entityId])
  @@index([status])
  @@index([deadline])
}
```

#### Budget Model

```prisma
model Budget {
  id          String   @id @default(cuid())
  entityId    String
  entity      Entity   @relation(fields: [entityId], references: [id], onDelete: Cascade)
  name        String
  amount      Float    // total budget amount in cents
  spent       Float    @default(0) // amount spent so far
  period      String   // "monthly", "quarterly", "yearly", "project"
  category    String   // e.g., "marketing", "engineering", "operations", "travel"
  startDate   DateTime?
  endDate     DateTime?
  alerts      Json?    // Array of { threshold: number, type: "percentage"|"absolute", notified: boolean }
  notes       String?
  status      String   @default("active") // "active", "paused", "exhausted", "closed"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([entityId])
  @@index([category])
  @@index([status])
}
```

#### Notification Model

```prisma
model Notification {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  entityId    String?
  entity      Entity?  @relation(fields: [entityId], references: [id], onDelete: SetNull)
  type        String   // "task_due", "message_received", "workflow_completed", "alert", "payment", "system"
  title       String
  body        String
  read        Boolean  @default(false)
  readAt      DateTime?
  actionUrl   String?  // URL to navigate to when notification is clicked
  metadata    Json?    // Additional context data
  priority    String   @default("normal") // "low", "normal", "high", "urgent"
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([entityId])
  @@index([read])
  @@index([createdAt])
}
```

#### VoicePersona Model

```prisma
model VoicePersona {
  id          String   @id @default(cuid())
  entityId    String
  entity      Entity   @relation(fields: [entityId], references: [id], onDelete: Cascade)
  name        String   // Display name (e.g., "Professional", "Casual", "Executive")
  voiceId     String   // External TTS voice ID (e.g., ElevenLabs voice ID)
  provider    String   @default("elevenlabs") // "elevenlabs", "azure", "google", "amazon"
  settings    Json     // { speed, pitch, stability, similarity, style, speakerBoost }
  description String?  // When to use this persona
  isDefault   Boolean  @default(false)
  sampleUrl   String?  // URL to a sample audio clip
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([entityId])
  @@unique([entityId, name])
}
```

#### Runbook Model

```prisma
model Runbook {
  id          String   @id @default(cuid())
  entityId    String
  entity      Entity   @relation(fields: [entityId], references: [id], onDelete: Cascade)
  name        String
  description String?
  steps       Json     // Array of { id, order, action, params, onSuccess, onFailure, timeout }
  variables   Json?    // Array of { name, type, defaultValue, required, description }
  category    String   // "incident", "onboarding", "deployment", "maintenance", "compliance"
  trigger     String?  // "manual", "scheduled", "event", "condition"
  schedule    String?  // Cron expression if trigger is "scheduled"
  isActive    Boolean  @default(true)
  lastRunAt   DateTime?
  runCount    Int      @default(0)
  version     Int      @default(1)
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([entityId])
  @@index([category])
  @@index([isActive])
}
```

### 2. Add `hashedPassword` Field to User Model

Add an optional `hashedPassword` field to the existing `User` model to support credentials-based authentication without storing passwords in the `preferences` JSON:

```prisma
model User {
  // ... existing fields ...
  hashedPassword String?   // bcrypt hash for credentials auth, null for OAuth-only users
  // ... rest of fields ...
}
```

Place this field after `email` and before `preferences` for logical grouping.

### 3. Add `deletedAt` Soft Delete Field

Add an optional `deletedAt` field to the following models to support soft deletion:

- **Task**: `deletedAt DateTime?`
- **Message**: `deletedAt DateTime?`
- **Document**: `deletedAt DateTime?`
- **Contact**: `deletedAt DateTime?`

For each model, add the field before `createdAt` and add an index on `deletedAt`:

```prisma
  deletedAt   DateTime?
  // ... existing createdAt/updatedAt ...

  // Add to the @@index section:
  @@index([deletedAt])
```

### 4. Add Full-Text Search Indexes

Add composite indexes to support PostgreSQL full-text search on the following models. These indexes tell the database which fields to include in text search operations:

```prisma
model Task {
  // ... existing fields ...

  // Add this index for full-text search:
  @@index([title])
}

model Message {
  // ... existing fields ...

  // Add this index for full-text search:
  @@index([subject])
  @@index([body])
}

model Document {
  // ... existing fields ...

  // Add this index for full-text search:
  @@index([title])
}

model KnowledgeEntry {
  // ... existing fields ...

  // Add this index for full-text search:
  @@index([title])
  @@index([content])
}
```

**Important:** Only add indexes that do not already exist. Check each model's existing `@@index` declarations before adding duplicates.

### 5. Add Relations to Entity Model

Update the `Entity` model to include relation fields for the new models:

```prisma
model Entity {
  // ... existing fields and relations ...
  decisions     Decision[]
  budgets       Budget[]
  notifications Notification[]
  voicePersonas VoicePersona[]
  runbooks      Runbook[]
}
```

Also update the `User` model to include the Notification relation:

```prisma
model User {
  // ... existing fields and relations ...
  notifications Notification[]
}
```

### 6. Update Seed Script (`prisma/seed.ts`)

Update the existing seed script to include seed data for all new models. Add this data AFTER the existing seed operations (do not remove existing seed data).

#### Seed Data for New Models:

**Decisions (5+):**
- "EHR Vendor Selection" -- type: strategic, status: in_review, entity: MedLink Pro, 3 options with pros/cons, deadline: 30 days from now
- "Office Lease Renewal" -- type: financial, status: open, entity: CRE Forge, 2 options (renew vs relocate), matrix with cost/location/size criteria
- "Telehealth Platform Choice" -- type: product, status: decided, entity: MedLink Pro, outcome: "Selected vendor B", rationale provided
- "Investment Property Bid" -- type: financial, status: open, entity: CRE Forge, 3 options with different bid amounts
- "Personal Vehicle Purchase" -- type: financial, status: deferred, entity: Personal, 2 options

**Budgets (6+):**
- "Marketing Q1" -- amount: 50000 (cents = $500), period: quarterly, category: marketing, entity: MedLink Pro, spent: 12500, alerts at 75% and 90%
- "Engineering Salaries" -- amount: 2500000, period: monthly, category: engineering, entity: MedLink Pro, spent: 2100000
- "Property Maintenance" -- amount: 100000, period: monthly, category: operations, entity: CRE Forge, spent: 45000
- "Legal Fees" -- amount: 200000, period: yearly, category: legal, entity: CRE Forge, spent: 87500
- "Travel Budget" -- amount: 30000, period: quarterly, category: travel, entity: MedLink Pro, spent: 8000
- "Personal Savings" -- amount: 500000, period: monthly, category: savings, entity: Personal, spent: 0

**Notifications (10+):**
- Mix of types: task_due, message_received, workflow_completed, alert, payment, system
- Mix of read/unread statuses
- Various priorities
- Some with actionUrls, some without
- Distributed across users and entities

**VoicePersonas (4+):**
- "Professional" -- entity: MedLink Pro, provider: elevenlabs, settings with medium speed, high stability
- "Friendly" -- entity: MedLink Pro, provider: elevenlabs, settings with slightly faster speed, warmer tone
- "Executive" -- entity: CRE Forge, provider: azure, settings with slower speed, authoritative tone
- "Casual" -- entity: Personal, provider: google, settings with normal speed, relaxed tone

**Runbooks (5+):**
- "Patient Data Breach Response" -- category: incident, entity: MedLink Pro, 6 steps (detect, contain, assess, notify, remediate, review), variables for incident_id and severity
- "New Tenant Onboarding" -- category: onboarding, entity: CRE Forge, 5 steps (welcome, docs, access, orientation, follow-up)
- "Monthly Compliance Check" -- category: compliance, entity: MedLink Pro, trigger: scheduled, schedule: "0 9 1 * *", 4 steps
- "Server Deployment" -- category: deployment, entity: MedLink Pro, 7 steps with rollback on failure
- "Property Inspection Workflow" -- category: maintenance, entity: CRE Forge, 5 steps

#### Seed Script Requirements:
- Add new model seeding AFTER existing model seeding (do not change the existing seed order).
- Use the entity IDs created earlier in the script (reference them by variable).
- Make the new seeding idempotent -- use `upsert` or `deleteMany` for new models before inserting.
- Print progress messages for each new model seeded (e.g., "Seeding decisions... done (5 created)").
- Handle the case where the script is run against a database that already has the new tables.

### 7. Generate Migration

After making all schema changes, generate the migration files:

```bash
export DATABASE_URL="postgresql://user:pass@localhost:5432/paf"
npx prisma generate
npx prisma migrate dev --name phase2-schema-updates --create-only
```

**IMPORTANT:**
- Use `--create-only` to generate the migration SQL without applying it. The migration will be applied by the deployment pipeline or by other developers when they pull the branch.
- The `npx prisma generate` step verifies the schema is valid.
- If `prisma generate` fails, fix the schema errors before proceeding.
- Do NOT run `prisx prisma migrate deploy` or apply the migration to a live database.

## Acceptance Criteria

1. `prisma/schema.prisma` includes all 5 new models: Decision, Budget, Notification, VoicePersona, Runbook.
2. Each new model has proper `id`, `entityId` (with relation), `createdAt`, `updatedAt` fields and appropriate indexes.
3. `User` model has optional `hashedPassword` field (String?).
4. Task, Message, Document, Contact models have optional `deletedAt` field (DateTime?) with index.
5. Full-text search indexes are added to Task.title, Message.subject, Message.body, Document.title, KnowledgeEntry.title, KnowledgeEntry.content (without duplicating existing indexes).
6. Entity model has relation arrays for all new models.
7. User model has `notifications` relation array.
8. `npx prisma generate` succeeds without errors (schema is valid).
9. Migration files exist in `prisma/migrations/` with the name `phase2-schema-updates`.
10. `prisma/seed.ts` includes seed data for all new models: 5+ decisions, 6+ budgets, 10+ notifications, 4+ voice personas, 5+ runbooks.
11. Seed script remains idempotent.
12. Seed script compiles without TypeScript errors.
13. No modifications to `jest.config.ts`, `package.json`, or any files in `src/`.

## Implementation Steps

1. **Read context files**: Read `prisma/schema.prisma` (full file), `prisma/seed.ts`, `src/shared/types/index.ts`, `package.json`, `tsconfig.json`.
2. **Create branch**: `git checkout -b ai-feature/p2-w09-database`
3. **Add new models to schema**: Add Decision, Budget, Notification, VoicePersona, and Runbook models with all fields, relations, and indexes as specified.
4. **Add `hashedPassword` to User**: Add the optional field to the existing User model.
5. **Add `deletedAt` to existing models**: Add the soft delete field and index to Task, Message, Document, Contact.
6. **Add full-text search indexes**: Add indexes for searchable text fields on Task, Message, Document, KnowledgeEntry.
7. **Update Entity and User relations**: Add relation arrays for new models.
8. **Validate schema**: Run `export DATABASE_URL="postgresql://user:pass@localhost:5432/paf" && npx prisma generate` to verify the schema is valid. Fix any errors.
9. **Generate migration**: Run `npx prisma migrate dev --name phase2-schema-updates --create-only` to create migration files.
10. **Update seed script**: Add seed data for all 5 new models to `prisma/seed.ts`.
11. **Verify seed compiles**: Run `npx tsc --noEmit prisma/seed.ts` or check for TypeScript errors in the seed file.
12. **Commit** with conventional commit messages.

## Tests Required

No dedicated unit test files are required for this worker since the changes are schema/migration-focused. Validation is performed via:

1. `npx prisma generate` -- confirms schema validity
2. `npx prisma migrate dev --name phase2-schema-updates --create-only` -- confirms migration can be generated
3. TypeScript compilation of `prisma/seed.ts` -- confirms seed data matches new model types

Other workers' tests will validate the integration with the new schema models.

## Commit Strategy

Make atomic commits in this order:

1. `feat(db): add Decision, Budget, Notification, VoicePersona, and Runbook models to schema`
   - Files: `prisma/schema.prisma` (new models, relations on Entity/User)
2. `feat(db): add hashedPassword field to User model and deletedAt soft delete to Task, Message, Document, Contact`
   - Files: `prisma/schema.prisma` (field additions to existing models)
3. `feat(db): add full-text search indexes on Task, Message, Document, KnowledgeEntry`
   - Files: `prisma/schema.prisma` (index additions)
4. `chore(db): generate phase2-schema-updates migration`
   - Files: `prisma/migrations/*phase2-schema-updates*/migration.sql`
5. `feat(db): add seed data for Decision, Budget, Notification, VoicePersona, and Runbook models`
   - Files: `prisma/seed.ts`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
