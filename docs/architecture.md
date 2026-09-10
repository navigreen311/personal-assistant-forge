# System Architecture

## Overview

PersonalAssistantForge follows a layered architecture pattern with clear separation
of concerns. Each layer has defined responsibilities and communicates only with
adjacent layers. The system manages multiple business entities per user, providing
AI-powered automation across productivity, communication, finance, and operations.

## 5-Layer Architecture

```
+----------------------------------------------------------+
|                    PRESENTATION LAYER                     |
|  Next.js App Router | React Components | Tailwind CSS    |
+----------------------------------------------------------+
|                       API LAYER                           |
|  REST Routes | Auth Middleware | Validation (Zod)         |
+----------------------------------------------------------+
|                     SERVICE LAYER                         |
|  26 Feature Modules | 6 Cross-Cutting Engines            |
+----------------------------------------------------------+
|                   INTEGRATION LAYER                       |
|  Email (SendGrid) | SMS (Twilio) | Storage (S3) |        |
|  Payments (Stripe) | AI (Anthropic Claude)               |
+----------------------------------------------------------+
|                      DATA LAYER                           |
|  PostgreSQL (Prisma ORM) | Redis (BullMQ Queue/Cache)    |
+----------------------------------------------------------+
```

### Layer 1: Presentation
- **Technology**: Next.js 16 App Router, React 19 Server Components, Tailwind CSS 4
- **Responsibility**: UI rendering, client-side state, user interactions
- **Key directories**: `src/app/(auth)/`, `src/app/(dashboard)/`, `src/components/`
- **Route groups**: `(auth)` for login/register, `(dashboard)` for all 28 module pages

### Layer 2: API
- **Technology**: Next.js Route Handlers, Zod validation
- **Responsibility**: HTTP request/response handling, input validation, auth enforcement
- **Key directories**: `src/app/api/`, `src/shared/middleware/`, `src/shared/utils/`
- **Patterns**: Standardized `ApiResponse<T>` format, `withAuth`/`withRole`/`withEntityScope`
  middleware (see [Multi-Entity Model](#multi-entity-model) for which is which)

### Layer 3: Service (Business Logic)
- **Technology**: TypeScript modules with dedicated service classes
- **Responsibility**: Business rules, domain logic, cross-module orchestration
- **Key directories**: `src/modules/` (26 modules), `src/engines/` (6 engines)
- **Pattern**: Each module contains `services/`, `components/`, and `types/` subdirectories

### Layer 4: Integration
- **Technology**: External API clients (SendGrid, Twilio, Stripe, AWS S3, Anthropic)
- **Responsibility**: Third-party service communication, protocol translation
- **Key directory**: `src/lib/integrations/` (email, sms, storage, payments clients)

### Layer 5: Data
- **Technology**: PostgreSQL 16 via Prisma ORM 6, Redis 7 via BullMQ/ioredis
- **Responsibility**: Data persistence, queries, caching, migrations, async job processing
- **Key directories**: `prisma/` (schema, migrations, seed), `src/lib/db/`, `src/lib/queue/`

## Data Flow

### Request Lifecycle

```
Client Request
     |
     v
Next.js Middleware (auth check)
     |
     v
Route Handler (src/app/api/.../route.ts)
     |-- Zod validation on request body
     |-- withAuth / withRole / withEntityScope middleware
     |
     v
Service Layer (src/modules/.../services/)
     |-- Business logic
     |-- Cross-module orchestration
     |
     v
Integration Layer (src/lib/integrations/)
     |-- External API calls (if needed)
     |
     v
Data Layer (Prisma ORM / Redis)
     |-- Database queries
     |-- Cache reads/writes
     |-- Job enqueuing
     |
     v
Response (ApiResponse<T>)
```

### API Response Format

All responses follow the standardized `ApiResponse<T>` interface:

```typescript
// Success
{ success: true, data: T, meta: { timestamp: string } }

// Error
{ success: false, error: { code: string, message: string, details?: object }, meta: { timestamp: string } }

// Paginated
{ success: true, data: T[], meta: { page, pageSize, total, timestamp } }
```

### Authentication Flow

1. User submits credentials or initiates Google OAuth
2. NextAuth validates credentials (bcrypt) or processes OAuth callback
3. JWT token is issued with `userId`, `role`, `activeEntityId` (30-day expiry)
4. Auto-creates user and default "Personal" entity on first Google sign-in
5. Subsequent requests include JWT in session cookie
6. `withAuth` middleware extracts and validates the JWT
7. `withEntityScope` resolves the entity in scope and verifies ownership before
   the handler runs
8. Handler receives authenticated session with user context

### Async Job Processing

1. Service layer enqueues a job via BullMQ (`src/lib/queue/workflow-queue.ts`)
2. Job types: `execute-workflow`, `execute-step`
3. Redis-backed queue with 3 retry attempts and exponential backoff (1s initial)
4. Worker processes (`src/lib/queue/workflow-worker.ts`) consume jobs
5. Job status queryable via `/api/execution/queue/[id]`

## Multi-Entity Model

PersonalAssistantForge supports multiple business entities per user. Each entity
operates as an isolated context with its own:

- Contacts, tasks, projects
- Financial records (invoices, expenses, budgets)
- Workflows, rules
- Communications (email, SMS)
- Documents, knowledge base entries
- Calendar events
- Voice personas and campaigns

Users switch between entities via `POST /api/auth/switch-entity`, which updates the
session's `activeEntityId`.

### How entity scoping is actually enforced

**Corrected in P-19/T-028.** This section previously said that "all data queries
are scoped to the active entity by default using the `withEntityAccess`
middleware". Neither half was true, and the untrue version is what the P-00 audit
found in the code: **149 of 335 routes** called `withAuth`, discarded the session
as `_session`, and took `entityId` straight off the caller's own query string or
request body. `withEntityAccess` was correct and was imported by exactly **one**
route. An authenticated user of entity A could read and write entity B by passing
B's id -- authenticated, but not authorized. Believing scoping was automatic is
precisely how that survived.

There is no default. Scoping is per-route and explicit, and the enforcement is:

- **`withEntityScope(req, handler, explicitEntityId?)`** -- the pattern in use.
  Resolves the entity from, in order: an explicit argument, `?entityId=`, an
  `entityId` in the JSON body, then the session's `activeEntityId`; checks
  ownership against the database in *every* case; and hands the handler a
  `VerifiedEntityId`. That is a branded type -- a string at runtime, but a plain
  `string` is not assignable to it, so a service that takes one **cannot** be
  called with an unverified value off the wire. That is a `tsc --noEmit` failure
  in CI, not a review catch. 400 if no entity resolves, 404 if it does not exist,
  403 if it belongs to someone else.
- **`withAuditedEntityScope(...)`** -- the same, plus an audit record.
- **`withEntityAccess(req, entityId, handler)`** -- the original, still present
  and still correct, but it requires the route to already hold an entityId and to
  remember to call it. Forgetting is silent, which is why it was superseded.

Some resources have no entity at all -- delegations, for instance, are scoped to
the delegating **user** -- and those routes use `withAuth`/`withAuditedAuth` with
`session.userId`. Putting a meaningless entity check in front of a real user
check is not an improvement; see `docs/parallel-build/tenancy-pattern.md`, which
is the normative reference for all of this.

### Entity Types
Entities can represent different organizational structures:
- **Personal** -- Individual personal assistant
- **LLC** -- Limited liability company
- **Corporation** -- Corporate entity
- Custom types with compliance profiles (HIPAA, GDPR, CCPA, SOX, SEC, REAL_ESTATE)

## Module Responsibilities

### Core Modules

| Module | Responsibility | Key Services |
|--------|---------------|--------------|
| **entities** | Multi-entity CRUD, validation, persona management | entity-service, entity-validation, persona-service |
| **tasks** | Task lifecycle, dependencies, AI prioritization, NLP parsing | task-crud, dependency-graph, prioritization-engine, nlp-parser, forecasting-service |
| **calendar** | Event management, scheduling, meeting prep/post-meeting | scheduling, prep, post-meeting, analytics, buffer, energy, nlp |
| **inbox** | Message triage, drafting, canned responses, follow-up tracking | inbox-service, draft-service, triage-service |
| **finance** | Invoices, expenses, budgets, P&L, forecasting | invoice-service, expense-service, budget-service, pnl-service, cashflow-service |
| **knowledge** | Knowledge base, SOPs, learning tracker, graph relationships | search-service, graph-service, sop-service, learning-tracker, ingestion-service |
| **workflows** | Workflow automation, triggers, approvals, simulation | workflow-crud, workflow-executor, condition-evaluator, approval-service, simulation-service |
| **documents** | Document generation, templates, e-signatures, versioning | document-generation-service, template-service, esign-service, versioning-service |
| **decisions** | Decision frameworks, matrices, pre-mortems, journals | decision-framework, decision-matrix, pre-mortem, decision-journal, research-agent |
| **communication** | Contact management, cadence, commitments, tone analysis | cadence-engine, commitment-tracker, drafting-engine, relationship-intelligence, tone-analyzer |

### Extended Modules

| Module | Responsibility | Key Services |
|--------|---------------|--------------|
| **admin** | Organization-level DLP, e-discovery, policies, SSO | dlp-service, ediscovery-service, org-policy-service, sso-service |
| **ai-quality** | AI output quality, bias detection, citations, override tracking | accuracy-scorecard-service, bias-detection-service, citation-service, override-tracking-service |
| **analytics** | Productivity metrics, time audits, goal/habit tracking, LLM costs | productivity-scoring, time-audit-service, goal-tracking-service, llm-cost-service |
| **attention** | Focus management, DND, notification bundling/learning | attention-budget-service, dnd-service, notification-bundler, priority-router |
| **capture** | Quick content capture, OCR, batch processing, routing | capture-service, ocr-service, batch-capture, routing-service |
| **crisis** | Crisis detection, escalation, war rooms, dead man's switch | detection-service, escalation-service, war-room-service, dead-man-switch-service |
| **delegation** | Task delegation, approval workflows, delegation scoring | delegation-service, delegation-inbox-service, delegation-scoring-service |
| **developer** | Plugin system, webhooks, custom tools, security review | plugin-service, webhook-service, custom-tool-service, security-review-service |
| **execution** | Action queue, blast radius scoring, rollbacks, runbooks | action-queue, blast-radius-scorer, rollback-service, runbook-service, simulation-engine |
| **health** | Energy, sleep, stress tracking, medical records, wearables | energy-service, sleep-service, stress-service, medical-service, wearable-service |
| **household** | Maintenance scheduling, shopping lists, vehicle management | maintenance-service, shopping-service, vehicle-service |
| **onboarding** | User calibration, data migration, tone training | calibration-service, migration-service, tone-training-service, wizard-service |
| **security** | RBAC, audit trails, classification, compliance, consent | rbac, audit-service, compliance-service, consent-service, vault-service |
| **travel** | Itinerary management, visa checking, flight monitoring | itinerary-service, visa-checker-service, flight-monitor-service |
| **voice** | Voice commands, STT, wake word detection | command-parser, stt-service, wake-word-service |
| **voiceforge** | AI voice agents, campaigns, scripts, persona management | outbound-agent, inbound-agent, campaign-service, script-engine, persona-service |

### Cross-Cutting Engines (`src/engines/`)

| Engine | Responsibility |
|--------|---------------|
| **adoption** | User adoption tracking, coaching, impact measurement |
| **cost** | Cost attribution and forecasting across all AI operations |
| **memory** | Episodic memory with strength decay and retrieval |
| **policy** | Policy enforcement and compliance across modules |
| **trust-safety** | Trust and safety verification for AI actions |
| **trust-ui** | UI components for trust controls and consent |

## Database Schema

The database uses PostgreSQL 16 with Prisma ORM.

**`prisma/schema.prisma` declares 75 models** (`grep -c '^model ' prisma/schema.prisma`).
This document previously said 17. The selection below is the core domain; it is a
*selection*, not the schema. Treat `prisma/schema.prisma` as the only authority
on what exists -- assuming a model or a column is there because a document said
so is how six modules ended up querying Prisma delegates that have never existed
(`shadow/compliance`, `execution/stats`, `voice/stats`, `crisisConfig`,
`delegationTask`, `/api/health/dashboard`), and P-19 found four more
(`focusSession`, `notificationPreference`, `ActionLog.module`/`.confidence`,
`Task.completedAt`).

The other ~58 models cover Shadow (voice sessions, consent, trust, safety and
retention), VoiceForge (playbooks, consent config, call preferences), the vault
(entries, secrets, keys), governance (roles, assignments, permission grants,
legal holds, retention policies), execution (queued actions, gate rules,
rollback plans, approvals, runbook executions), platform (webhooks, plugins,
usage records, subscriptions) and life/health (habits, health metrics, goals,
attention budget, DND config).

Core models by group:

### Identity
- **User** -- name, email, preferences (tone, autonomy level, focus hours), timezone, chronotype
- **Entity** -- userId, name, type, complianceProfile[], brandKit, voicePersonaId, phoneNumbers

### Productivity
- **Task** -- title, entityId, projectId, priority (P0-P2), status, dueDate, dependencies[], assigneeId
- **Project** -- name, entityId, milestones (JSON), status, health (GREEN/YELLOW/RED)
- **CalendarEvent** -- title, entityId, participantIds[], startTime, endTime, bufferBefore/After, prepPacket, recurrence

### Communication
- **Message** -- channel, senderId, recipientId, entityId, threadId, body, triageScore, intent, sensitivity, draftStatus
- **Contact** -- entityId, name, email, phone, channels, relationshipScore, commitments, tags
- **Call** -- entityId, contactId, direction, personaId, outcome, transcript, sentiment, actionItems

### Content
- **Document** -- title, entityId, type (BRIEF/MEMO/SOP/etc.), version, citations, content, status
- **KnowledgeEntry** -- content, tags, entityId, source, linkedEntities
- **MemoryEntry** -- userId, type (SHORT_TERM/WORKING/LONG_TERM/EPISODIC), content, strength (decays)

### Automation
- **Workflow** -- name, entityId, triggers[], steps[], status, lastRun, successRate
- **Rule** -- name, scope, entityId, condition, action, precedence, createdBy, isActive

### Finance
- **FinancialRecord** -- entityId, type (INVOICE/EXPENSE/BILL/PAYMENT/TRANSFER), amount, currency, status, category

### System
- **ActionLog** -- actor (AI/HUMAN/SYSTEM), actionType, target, reason, blastRadius, reversible, rollbackPath, status
- **ConsentReceipt** -- actionId, description, reason, impacted[], reversible, confidence

## Security Architecture

### Authentication
- **NextAuth.js** with JWT strategy (30-day expiry)
- **Providers**: Credentials (bcrypt, 12 rounds) + Google OAuth
- **Roles**: `owner`, `admin`, `member`, `viewer`

### Authorization
- `withAuth(req, handler)` -- Requires an authenticated user; hands the handler a
  session carrying `userId`, `role` and `activeEntityId`
- `withRole(req, roles[], handler)` -- Requires one of the given roles
- `withEntityScope(req, handler, explicitEntityId?)` -- Resolves and verifies the
  entity in scope, then hands the handler a `VerifiedEntityId` (branded type;
  an unverified `string` will not compile in its place)
- `withAuditedAuth(req, opts, handler)` / `withAuditedEntityScope(...)` -- as
  above, plus a tamper-evident audit entry whose actor comes from the verified
  token (`resolveActor`), never from a client-supplied header
- `withEntityAccess(req, entityId, handler)` -- Verifies entity ownership for a
  route that has already parsed an entityId. Superseded by `withEntityScope`
  because calling it is opt-in and forgetting is silent

See `docs/parallel-build/tenancy-pattern.md` for the normative pattern and the
worked example.

### Data Protection
- Entity-scoped data isolation (multi-tenancy)
- Sensitivity levels: PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED, REGULATED
- Blast radius scoring for AI actions (LOW, MEDIUM, HIGH, CRITICAL)
- Consent receipts for high-impact operations
- DLP (Data Loss Prevention) rules via admin module
- Compliance profiles per entity (HIPAA, GDPR, CCPA, SOX, SEC)

### AI Safety
- Prompt injection detection (`/api/safety/injection-check`)
- Email spoofing detection (`/api/safety/email-headers`)
- Fraud detection (`/api/safety/fraud-check`)
- Rate limiting/throttling (`/api/safety/throttle`)
- Sender/domain reputation checking (`/api/safety/reputation`)
- AI override tracking and bias detection via ai-quality module
