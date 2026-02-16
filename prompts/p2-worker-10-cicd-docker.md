# Worker 10: CI/CD Pipeline, Docker, Documentation

## Branch: ai-feature/p2-w10-cicd-docker

Create and check out the branch `ai-feature/p2-w10-cicd-docker` from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside these directories:

- `.github/` (all files -- create this directory)
- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `README.md`
- `docs/` (all files -- create this directory)

**DO NOT modify these files:**
- `jest.config.ts` -- shared config, do not modify
- `package.json` -- shared config, do not modify
- Any files in `src/` -- owned by other workers
- `prisma/` -- owned by another worker
- `tsconfig.json` -- shared config, do not modify

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files to accurately document the project:

1. **`prisma/schema.prisma`** -- Understand all models to document the data layer.
2. **`src/shared/types/index.ts`** -- Understand all TypeScript types and enums.
3. **`package.json`** -- Understand all dependencies, scripts, and project metadata.
4. **`tsconfig.json`** -- Understand the TypeScript configuration and path aliases.
5. **`src/app/`** -- Scan the directory structure to document all API routes and pages.
6. **`src/lib/`** -- Scan to understand all library modules.
7. **`src/modules/`** -- Scan to understand all feature modules.
8. **`.env.example`** -- If it exists, understand required environment variables. If it does not exist, infer from code references to `process.env`.

## Requirements

### 1. GitHub Actions CI Workflow (`.github/workflows/ci.yml`)

Create a comprehensive CI pipeline:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint-typecheck-test:
    name: Lint, Type Check & Test
    runs-on: ubuntu-latest
    timeout-minutes: 15

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/paf_test
      NEXTAUTH_SECRET: ci-test-secret-do-not-use-in-production
      NEXTAUTH_URL: http://localhost:3000

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: paf_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

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

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run database migrations
        run: npx prisma migrate deploy

      - name: Lint
        run: npx next lint

      - name: Type check
        run: npx tsc --noEmit

      - name: Run tests
        run: npx jest --passWithNoTests --coverage --ci

      - name: Upload coverage report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: coverage-report
          path: coverage/
          retention-days: 7

  build:
    name: Build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: lint-typecheck-test

    env:
      DATABASE_URL: postgresql://postgres:postgres@localhost:5432/paf_build
      NEXTAUTH_SECRET: ci-build-secret-do-not-use-in-production
      NEXTAUTH_URL: http://localhost:3000

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: paf_build
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

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

      - name: Generate Prisma client
        run: npx prisma generate

      - name: Run database migrations
        run: npx prisma migrate deploy

      - name: Build application
        run: npm run build

  docker:
    name: Docker Build
    runs-on: ubuntu-latest
    timeout-minutes: 15
    needs: build
    if: github.event_name == 'push' && github.ref == 'refs/heads/master'

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: false
          tags: personal-assistant-forge:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

**CI Workflow Guidelines:**
- Use `concurrency` to cancel in-progress runs on the same branch (saves CI minutes).
- Cache `node_modules` via the `actions/setup-node` cache feature.
- PostgreSQL service container is required because `prisma generate` and `prisma migrate deploy` need a database connection.
- Tests run with `--passWithNoTests` to avoid failures when test files are not yet created.
- Coverage is uploaded as an artifact for review.
- Docker build only runs on pushes to master (not on PRs).
- All secrets and URLs use CI-only placeholder values.

### 2. Dockerfile

Create a multi-stage Docker build:

```dockerfile
# Dockerfile

# ============================================
# Stage 1: Dependencies
# ============================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ============================================
# Stage 2: Builder
# ============================================
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 3: Runner
# ============================================
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Copy Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy Prisma schema and generated client (needed at runtime)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

**Dockerfile Guidelines:**
- Multi-stage build keeps the final image small (only production dependencies and built artifacts).
- Run as non-root user (`nextjs`) for security.
- Copy Prisma schema and generated client for runtime database access.
- Use `standalone` output mode from Next.js (this requires `output: 'standalone'` in next.config -- document this in README but do NOT modify next.config).
- Disable Next.js telemetry in Docker builds.
- Health check uses wget (available in alpine) to hit the health endpoint.
- `libc6-compat` and `openssl` are required for Prisma on Alpine.

### 3. Docker Compose (`docker-compose.yml`)

Create a complete development/local environment:

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: paf-app
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://paf_user:paf_password@postgres:5432/paf_dev
      - REDIS_URL=redis://redis:6379
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET:-dev-secret-change-in-production}
      - NEXTAUTH_URL=http://localhost:3000
      - NODE_ENV=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 40s
      retries: 3
    networks:
      - paf-network

  postgres:
    image: postgres:16-alpine
    container_name: paf-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: paf_user
      POSTGRES_PASSWORD: paf_password
      POSTGRES_DB: paf_dev
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U paf_user -d paf_dev"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - paf-network

  redis:
    image: redis:7-alpine
    container_name: paf-redis
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - paf-network

volumes:
  postgres-data:
    driver: local
  redis-data:
    driver: local

networks:
  paf-network:
    driver: bridge
```

**Docker Compose Guidelines:**
- PostgreSQL 16 Alpine with persistent volume for data durability.
- Redis 7 Alpine with AOF persistence, 256MB memory limit, and LRU eviction.
- App depends on postgres and redis with health checks (waits for services to be ready).
- All services on a shared bridge network for inter-service communication.
- Use environment variable substitution for secrets (`${NEXTAUTH_SECRET:-default}`).
- Expose standard ports: 3000 (app), 5432 (postgres), 6379 (redis).

### 4. Docker Ignore (`.dockerignore`)

```
# .dockerignore

# Dependencies
node_modules
npm-debug.log*

# Build output
.next
out
build
dist

# Git
.git
.gitignore

# IDE
.vscode
.idea
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Environment files (secrets)
.env
.env.local
.env.*.local

# Logs
logs
*.log

# Tests
tests
__tests__
coverage
jest.config.ts

# Documentation (not needed in image)
docs
*.md
!README.md

# Docker files (prevent recursive builds)
Dockerfile
docker-compose.yml
.dockerignore

# CI/CD
.github

# Misc
.husky
.eslintcache
```

### 5. README (`README.md`)

Write a comprehensive project README:

```markdown
# PersonalAssistantForge

> An AI-powered personal assistant platform for managing multiple business entities,
> tasks, communications, finances, and workflows from a single unified interface.

## Architecture

PersonalAssistantForge is built on a **5-layer architecture**:

```
+----------------------------------------------------------+
|                    PRESENTATION LAYER                     |
|  Next.js App Router | React Components | Tailwind CSS    |
+----------------------------------------------------------+
|                       API LAYER                           |
|  REST Routes | Auth Middleware | Validation (Zod)         |
+----------------------------------------------------------+
|                     SERVICE LAYER                         |
|  Modules: Entities, Tasks, Calendar, Inbox, Finance,      |
|  Knowledge, Workflows, Voice, Decisions, Analytics        |
+----------------------------------------------------------+
|                   INTEGRATION LAYER                       |
|  Email (Resend) | SMS (Twilio) | Storage (S3) |          |
|  Payments (Stripe) | Calendar (Google) | AI (OpenAI)     |
+----------------------------------------------------------+
|                      DATA LAYER                           |
|  PostgreSQL (Prisma ORM) | Redis (Cache/Queue)           |
+----------------------------------------------------------+
```

## Tech Stack

| Category       | Technology                        |
|----------------|-----------------------------------|
| Framework      | Next.js 14 (App Router)           |
| Language       | TypeScript 5                      |
| Database       | PostgreSQL 16                     |
| ORM            | Prisma                            |
| Cache/Queue    | Redis 7                           |
| Auth           | NextAuth.js v4                    |
| Styling        | Tailwind CSS                      |
| Validation     | Zod                               |
| Testing        | Jest                              |
| CI/CD          | GitHub Actions                    |
| Containerization | Docker                          |

## Prerequisites

- **Node.js** >= 20.x
- **PostgreSQL** >= 16.x
- **Redis** >= 7.x
- **npm** >= 10.x

## Quick Start

### Option A: Docker (Recommended)

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd personal-assistant-forge
   ```

2. **Start all services:**
   ```bash
   docker-compose up -d
   ```

3. **Run database migrations:**
   ```bash
   docker exec -it paf-app npx prisma migrate deploy
   ```

4. **Seed the database:**
   ```bash
   docker exec -it paf-app npx prisma db seed
   ```

5. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Option B: Local Development

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd personal-assistant-forge
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your database credentials and API keys.

4. **Start PostgreSQL and Redis:**
   ```bash
   # Using Docker for just the databases:
   docker-compose up -d postgres redis
   ```

5. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

6. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

7. **Seed the database:**
   ```bash
   npx prisma db seed
   ```

8. **Start the development server:**
   ```bash
   npm run dev
   ```

9. **Open the application:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

| Variable               | Description                          | Required | Default                |
|------------------------|--------------------------------------|----------|------------------------|
| `DATABASE_URL`         | PostgreSQL connection string         | Yes      | --                     |
| `REDIS_URL`            | Redis connection string              | No       | `redis://localhost:6379` |
| `NEXTAUTH_SECRET`      | Secret for NextAuth JWT signing      | Yes      | --                     |
| `NEXTAUTH_URL`         | Base URL for NextAuth callbacks      | Yes      | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID               | No       | --                     |
| `GOOGLE_CLIENT_SECRET`  | Google OAuth client secret           | No       | --                     |
| `RESEND_API_KEY`       | Resend API key for email             | No       | --                     |
| `TWILIO_ACCOUNT_SID`   | Twilio Account SID for SMS           | No       | --                     |
| `TWILIO_AUTH_TOKEN`    | Twilio Auth Token                    | No       | --                     |
| `TWILIO_PHONE_NUMBER`  | Twilio sender phone number           | No       | --                     |
| `AWS_ACCESS_KEY_ID`    | AWS access key for S3 storage        | No       | --                     |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key for S3 storage       | No       | --                     |
| `AWS_S3_BUCKET`        | S3 bucket name for file storage      | No       | --                     |
| `AWS_REGION`           | AWS region                           | No       | `us-east-1`           |
| `STRIPE_SECRET_KEY`    | Stripe secret API key                | No       | --                     |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret       | No       | --                     |
| `OPENAI_API_KEY`       | OpenAI API key for AI features       | No       | --                     |

## Modules

| Module          | Description                                                    | Path                     |
|-----------------|----------------------------------------------------------------|--------------------------|
| **Auth**        | Authentication, authorization, RBAC, session management        | `src/lib/auth/`          |
| **Entities**    | Multi-entity management (businesses, personal)                 | `src/modules/entities/`  |
| **Tasks**       | Task and project management with dependencies                  | `src/modules/tasks/`     |
| **Inbox**       | Multi-channel message triage and threading                     | `src/modules/inbox/`     |
| **Calendar**    | Calendar events, scheduling, meeting prep                      | `src/modules/calendar/`  |
| **Finance**     | Invoicing, expenses, budgets, financial records                | `src/modules/finance/`   |
| **Knowledge**   | Knowledge base, memory, document management                    | `src/modules/knowledge/` |
| **Workflows**   | Automation workflows, rules engine, runbooks                   | `src/modules/workflows/` |
| **Voice**       | Voice personas, TTS, voice capture                             | `src/modules/voice/`     |
| **Decisions**   | Decision frameworks, matrices, option analysis                 | `src/modules/decisions/` |
| **Analytics**   | Dashboard analytics, reporting, insights                       | `src/modules/analytics/` |
| **Search**      | Full-text search across all models                             | `src/lib/search/`        |
| **Realtime**    | Server-Sent Events for live updates                            | `src/lib/realtime/`      |
| **Security**    | RBAC, permissions, compliance, consent                         | `src/modules/security/`  |
| **Integrations**| Email, SMS, Storage, Payments, Calendar API clients            | `src/lib/integrations/`  |

## API Routes

All API routes are under `/api/`. Authentication is required unless noted otherwise.

### Auth
- `POST /api/auth/register` -- Create a new account
- `GET/POST /api/auth/[...nextauth]` -- NextAuth.js handlers (login, OAuth)
- `GET /api/auth/profile` -- Get current user profile
- `PATCH /api/auth/profile` -- Update user profile
- `POST /api/auth/switch-entity` -- Switch active entity context

### Entities
- `GET /api/entities` -- List user's entities
- `POST /api/entities` -- Create a new entity
- `GET /api/entities/:id` -- Get entity details
- `PATCH /api/entities/:id` -- Update entity
- `DELETE /api/entities/:id` -- Delete entity

### Tasks
- `GET /api/tasks` -- List tasks (filterable by status, priority, assignee)
- `POST /api/tasks` -- Create a task
- `GET /api/tasks/:id` -- Get task details
- `PATCH /api/tasks/:id` -- Update task
- `DELETE /api/tasks/:id` -- Soft-delete task

### Search
- `GET /api/search?q=query` -- Full-text search across all models
- `GET /api/search/suggestions?q=partial` -- Autocomplete suggestions

### Events
- `GET /api/events/stream` -- SSE stream for real-time updates

### Uploads
- `POST /api/uploads` -- Upload a file (multipart/form-data)

### Webhooks
- `POST /api/webhooks/stripe` -- Stripe webhook handler (no auth)

## Testing

```bash
# Run all tests
npx jest

# Run tests with coverage
npx jest --coverage

# Run specific test suite
npx jest tests/unit/auth/

# Run tests in watch mode
npx jest --watch

# Type check
npx tsc --noEmit

# Lint
npx next lint
```

## Database

```bash
# Generate Prisma client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name <migration-name>

# Apply pending migrations
npx prisma migrate deploy

# Reset database (destructive)
npx prisma migrate reset --force

# Seed database
npx prisma db seed

# Open Prisma Studio (visual database browser)
npx prisma studio
```

## Deployment

### Docker Production

1. Build the production image:
   ```bash
   docker build -t personal-assistant-forge:latest .
   ```

2. Run with production environment:
   ```bash
   docker run -d \
     -p 3000:3000 \
     -e DATABASE_URL="postgresql://..." \
     -e REDIS_URL="redis://..." \
     -e NEXTAUTH_SECRET="your-production-secret" \
     -e NEXTAUTH_URL="https://yourdomain.com" \
     personal-assistant-forge:latest
   ```

3. Run migrations against production database:
   ```bash
   docker exec <container-id> npx prisma migrate deploy
   ```

### Vercel

1. Connect repository to Vercel.
2. Set environment variables in Vercel dashboard.
3. Vercel auto-detects Next.js and builds automatically.
4. Run `npx prisma migrate deploy` via Vercel's build command or a separate migration step.

## Contributing

1. Create a feature branch from `master`:
   ```bash
   git checkout -b ai-feature/<feature-name>
   ```

2. Follow conventional commit messages:
   - `feat:` -- New feature
   - `fix:` -- Bug fix
   - `test:` -- Adding tests
   - `chore:` -- Maintenance tasks
   - `docs:` -- Documentation updates
   - `refactor:` -- Code refactoring

3. Ensure all checks pass:
   ```bash
   npx next lint
   npx tsc --noEmit
   npx jest --passWithNoTests
   ```

4. Open a pull request to `master`.

## License

MIT
```

**README Guidelines:**
- Scan the actual project structure before writing to ensure accuracy.
- List only API routes that actually exist in the codebase (check `src/app/api/`).
- List only modules that actually exist (check `src/modules/` and `src/lib/`).
- Environment variables should be inferred from code references to `process.env`.
- Keep the architecture diagram text-based (no images) for git-friendliness.

### 6. Architecture Documentation (`docs/architecture.md`)

Write a detailed architecture overview:

```markdown
# System Architecture

## Overview

PersonalAssistantForge follows a layered architecture pattern with clear separation
of concerns. Each layer has defined responsibilities and communicates only with
adjacent layers.

## 5-Layer Architecture

### Layer 1: Presentation
- **Technology**: Next.js App Router, React Server Components, Tailwind CSS
- **Responsibility**: UI rendering, client-side state, user interactions
- **Key directories**: `src/app/`, `src/components/`

### Layer 2: API
- **Technology**: Next.js Route Handlers, Zod validation
- **Responsibility**: HTTP request/response handling, input validation, auth enforcement
- **Key directories**: `src/app/api/`, `src/shared/middleware/`

### Layer 3: Service (Business Logic)
- **Technology**: TypeScript modules
- **Responsibility**: Business rules, domain logic, cross-module orchestration
- **Key directories**: `src/modules/`, `src/lib/`

### Layer 4: Integration
- **Technology**: External API clients (Resend, Twilio, Stripe, AWS S3, Google APIs)
- **Responsibility**: Third-party service communication, protocol translation
- **Key directories**: `src/lib/integrations/`

### Layer 5: Data
- **Technology**: PostgreSQL via Prisma ORM, Redis for caching
- **Responsibility**: Data persistence, queries, caching, migrations
- **Key directories**: `prisma/`, `src/lib/db/`

## Data Flow

### Request Lifecycle

1. Client sends HTTP request
2. Next.js middleware checks authentication
3. Route handler validates input with Zod
4. Service layer processes business logic
5. Integration layer communicates with external services (if needed)
6. Data layer persists or retrieves data
7. Response flows back up through the layers

### Real-time Updates

1. Client opens SSE connection to `/api/events/stream`
2. Server registers client in ConnectionManager
3. When a mutation occurs (task updated, message received, etc.), the service layer
   emits a RealtimeEvent
4. ConnectionManager broadcasts the event to all relevant clients
5. Client receives the event and updates UI

### Authentication Flow

1. User submits credentials or initiates OAuth
2. NextAuth validates credentials or processes OAuth callback
3. JWT token is issued with userId, role, activeEntityId
4. Subsequent requests include JWT in cookie
5. `withAuth` middleware extracts and validates the JWT
6. `withEntityAccess` middleware verifies entity ownership
7. Handler receives authenticated session

## Multi-Entity Model

PersonalAssistantForge supports multiple business entities per user. Each entity
operates as an isolated context with its own:
- Contacts, tasks, projects
- Financial records, budgets
- Workflows, rules, runbooks
- Communications (email, SMS)
- Documents, knowledge base
- Voice personas

Users switch between entities via the session's `activeEntityId`. All data queries
are scoped to the active entity by default.

## Module Responsibilities

[Document each module's single responsibility, inputs, outputs, and
dependencies on other modules. Scan the actual codebase to fill this in.]

## Database Schema

The database uses PostgreSQL with Prisma ORM. Key model groups:
- **Identity**: User, Entity
- **Productivity**: Task, Project, CalendarEvent
- **Communication**: Message, Call, Contact
- **Content**: Document, KnowledgeEntry, MemoryEntry
- **Automation**: Workflow, Rule, Runbook
- **Finance**: FinancialRecord, Budget
- **Decision**: Decision
- **System**: ActionLog, ConsentReceipt, Notification, VoicePersona
```

**Architecture Doc Guidelines:**
- Scan the actual codebase structure before writing to ensure accuracy.
- Do NOT fabricate modules or files that do not exist.
- Keep diagrams text-based.
- Focus on the "why" behind architectural decisions, not just the "what".

### 7. API Reference (`docs/api-reference.md`)

Write a comprehensive API reference:

```markdown
# API Reference

## Authentication

All API routes require authentication unless explicitly noted. Include the session
cookie (set by NextAuth after login) with every request.

Unauthenticated requests receive a `401 Unauthorized` response.
Requests to resources the user does not own receive a `403 Forbidden` response.

## Response Format

All responses follow the standard format:

### Success
```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "..." }
}
```

### Error
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description of the error",
    "details": { ... }
  },
  "meta": { "timestamp": "..." }
}
```

### Paginated
```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5,
    "timestamp": "..."
  }
}
```

## Routes

[Document EVERY API route that exists in `src/app/api/`, grouped by module.
For each route include: method, path, description, auth required (yes/no),
request body/params, response shape, example request, example response.]
```

**API Reference Guidelines:**
- Scan `src/app/api/` recursively to find ALL route files.
- Document each route handler (GET, POST, PATCH, DELETE) found in each `route.ts`.
- Include request body schemas (reference Zod validations if present).
- Include example requests and responses.
- Note which routes are public (webhooks) vs protected.

## Acceptance Criteria

1. `.github/workflows/ci.yml` defines a complete CI pipeline with lint, type-check, test, build, and docker build stages.
2. CI uses PostgreSQL service container and caches npm dependencies.
3. `Dockerfile` uses multi-stage build with deps, builder, and runner stages.
4. Docker image runs as non-root user and includes health check.
5. `docker-compose.yml` defines app, postgres, and redis services with health checks and persistent volumes.
6. `.dockerignore` excludes node_modules, .next, .git, tests, docs, env files, and other non-essential files.
7. `README.md` includes: project overview, architecture diagram, tech stack, prerequisites, quick start (Docker and local), environment variables table, module list, API routes summary, testing commands, database commands, deployment guide, and contributing section.
8. `docs/architecture.md` accurately describes the 5-layer architecture, data flow, auth flow, multi-entity model, and module responsibilities.
9. `docs/api-reference.md` documents all existing API routes with methods, paths, auth requirements, and response formats.
10. All documentation accurately reflects the actual codebase (no fabricated modules or routes).
11. No modifications to `jest.config.ts`, `package.json`, `tsconfig.json`, or any files in `src/` or `prisma/`.

## Implementation Steps

1. **Read context files**: Read `package.json`, `tsconfig.json`, `prisma/schema.prisma`, `src/shared/types/index.ts`, `src/shared/utils/api-response.ts`. Scan `src/app/api/`, `src/modules/`, `src/lib/` directory structures.
2. **Create branch**: `git checkout -b ai-feature/p2-w10-cicd-docker`
3. **Create `.github/workflows/ci.yml`**: Write the complete CI pipeline.
4. **Create `Dockerfile`**: Write the multi-stage build.
5. **Create `docker-compose.yml`**: Write the service composition with healthchecks.
6. **Create `.dockerignore`**: Write the ignore list.
7. **Write `README.md`**: Compose the full project README by scanning the actual codebase.
8. **Create `docs/architecture.md`**: Write the architecture overview by analyzing the codebase structure.
9. **Create `docs/api-reference.md`**: Document all API routes by scanning `src/app/api/` recursively.
10. **Verify**: Review all files for accuracy against the codebase.
11. **Commit** with conventional commit messages.

## Tests Required

No unit tests are required for this worker. Validation is performed by:

1. YAML syntax validation of `.github/workflows/ci.yml` (CI will validate itself on first run).
2. `docker build .` succeeds (can be tested locally if Docker is available).
3. Documentation accuracy is verified by cross-referencing with the codebase.

## Commit Strategy

Make atomic commits in this order:

1. `chore(ci): add GitHub Actions CI workflow with lint, type-check, test, build, and docker stages`
   - Files: `.github/workflows/ci.yml`
2. `chore(docker): add multi-stage Dockerfile with non-root user and health check`
   - Files: `Dockerfile`
3. `chore(docker): add docker-compose with app, PostgreSQL, and Redis services`
   - Files: `docker-compose.yml`, `.dockerignore`
4. `docs: add comprehensive README with architecture, setup, and deployment guides`
   - Files: `README.md`
5. `docs: add architecture overview and API reference documentation`
   - Files: `docs/architecture.md`, `docs/api-reference.md`

After all commits, verify with `git log --oneline` that the history is clean and descriptive.
