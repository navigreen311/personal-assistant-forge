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

## Tech Stack

| Category         | Technology                          |
|------------------|-------------------------------------|
| Framework        | Next.js 16 (App Router)             |
| Language         | TypeScript 5                        |
| Database         | PostgreSQL 16                       |
| ORM              | Prisma 6                            |
| Cache/Queue      | Redis 7 (BullMQ)                    |
| Auth             | NextAuth.js v4                      |
| AI               | Anthropic Claude (via SDK)          |
| Styling          | Tailwind CSS 4                      |
| Validation       | Zod                                 |
| Testing          | Jest 30                             |
| CI/CD            | GitHub Actions                      |
| Containerization | Docker (multi-stage)                |

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

> **Note:** For Docker production builds, `output: 'standalone'` must be set in `next.config.ts`.
> This enables the standalone output mode required by the multi-stage Dockerfile.

## Environment Variables

| Variable               | Description                          | Required | Default                |
|------------------------|--------------------------------------|----------|------------------------|
| `DATABASE_URL`         | PostgreSQL connection string         | Yes      | --                     |
| `NEXTAUTH_SECRET`      | Secret for NextAuth JWT signing      | Yes      | --                     |
| `NEXTAUTH_URL`         | Base URL for NextAuth callbacks      | Yes      | `http://localhost:3000` |
| `REDIS_URL`            | Redis connection string              | No       | `redis://localhost:6379`|
| `ANTHROPIC_API_KEY`    | Anthropic API key for AI features    | No       | --                     |
| `OPENAI_API_KEY`       | OpenAI API key (fallback AI)         | No       | --                     |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID               | No       | --                     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret           | No       | --                     |
| `TWILIO_ACCOUNT_SID`   | Twilio Account SID for SMS/Voice     | No       | --                     |
| `TWILIO_AUTH_TOKEN`    | Twilio Auth Token                    | No       | --                     |
| `TWILIO_PHONE_NUMBER`  | Twilio sender phone number           | No       | --                     |
| `DEEPGRAM_API_KEY`     | Deepgram API key for STT             | No       | --                     |
| `ELEVENLABS_API_KEY`   | ElevenLabs API key for TTS           | No       | --                     |
| `PLAID_CLIENT_ID`      | Plaid client ID for finance          | No       | --                     |
| `PLAID_SECRET`         | Plaid secret for finance             | No       | --                     |
| `S3_BUCKET`            | S3 bucket name for file storage      | No       | --                     |
| `S3_REGION`            | AWS region for S3                    | No       | `us-east-1`            |
| `SENTRY_DSN`           | Sentry DSN for error tracking        | No       | --                     |

## Modules

### Feature Modules (`src/modules/`)

| Module           | Description                                             |
|------------------|---------------------------------------------------------|
| **admin**        | DLP, e-discovery, org policies, SSO                     |
| **ai-quality**   | AI accuracy, bias detection, citations, golden tests    |
| **analytics**    | Productivity scoring, time audits, call analytics       |
| **attention**    | Attention budgets, DND, notification bundling           |
| **calendar**     | Events, scheduling, meeting prep, post-meeting notes    |
| **capture**      | Quick capture, OCR, batch processing, routing rules     |
| **communication**| Contact management, cadence, commitment tracking        |
| **crisis**       | Crisis detection, war rooms, dead man's switch          |
| **decisions**    | Decision matrices, pre-mortems, research, journals      |
| **delegation**   | Task delegation, approval workflows, scoring            |
| **developer**    | Plugin system, webhooks, custom tools                   |
| **documents**    | Document generation, templates, e-signatures, versioning|
| **entities**     | Multi-entity management (businesses, personal)          |
| **execution**    | Action queue, blast radius, rollbacks, runbooks         |
| **finance**      | Invoicing, expenses, budgets, P&L, forecasting          |
| **health**       | Energy, sleep, stress, medical records, wearables       |
| **household**    | Maintenance, shopping lists, vehicle management         |
| **inbox**        | Message triage, drafting, canned responses, follow-ups  |
| **knowledge**    | Knowledge base, SOPs, learning tracker, graph           |
| **onboarding**   | User calibration, migration, tone training              |
| **security**     | RBAC, audit, classification, compliance, consent        |
| **tasks**        | Task CRUD, dependencies, forecasting, NLP parsing       |
| **travel**       | Itineraries, visa checker, flight monitor               |
| **voice**        | Voice commands, STT, wake word detection                |
| **voiceforge**   | AI voice agents, campaigns, scripts, personas           |
| **workflows**    | Workflow automation, conditions, approvals, simulation  |

### Core Libraries (`src/lib/`)

| Library          | Description                                             |
|------------------|---------------------------------------------------------|
| **ai**           | Anthropic Claude client (text, JSON, streaming, chat)   |
| **auth**         | NextAuth.js config, JWT, OAuth, password hashing        |
| **db**           | Prisma ORM singleton client                             |
| **integrations** | Email (SendGrid), SMS (Twilio), Storage (S3), Payments  |
| **queue**        | BullMQ workflow queue with Redis                        |
| **voice**        | Voice consent manager, mock providers                   |

### Cross-Cutting Engines (`src/engines/`)

| Engine           | Description                                             |
|------------------|---------------------------------------------------------|
| **adoption**     | User adoption tracking and guidance                     |
| **cost**         | Cost attribution and forecasting for AI operations      |
| **memory**       | Episodic memory with decay and retrieval                |
| **policy**       | Policy enforcement and compliance                       |
| **trust-safety** | Trust and safety verification                           |
| **trust-ui**     | UI/UX for trust controls                                |

## API Routes

All API routes are under `/api/`. Authentication is required unless noted otherwise.
See [docs/api-reference.md](docs/api-reference.md) for the full API reference.

### Auth
- `POST /api/auth/register` -- User registration
- `GET/POST /api/auth/[...nextauth]` -- NextAuth.js handlers
- `GET/PATCH /api/auth/profile` -- User profile
- `POST /api/auth/switch-entity` -- Switch active entity

### Core Resources
- `/api/entities` -- Entity management (CRUD + executive view, compliance, health)
- `/api/tasks` -- Task management (CRUD + bulk, dependencies, forecasting, NLP)
- `/api/contacts` -- Contact management (CRUD + cadence, commitments, scores)
- `/api/calendar` -- Calendar events (CRUD + scheduling, conflicts, prep packets)
- `/api/inbox` -- Message inbox (CRUD + triage, drafting, follow-ups)
- `/api/finance` -- Finance (budgets, expenses, invoices, P&L, forecasting)
- `/api/knowledge` -- Knowledge base (CRUD + graph, SOPs, learning)
- `/api/workflows` -- Workflow automation (CRUD + triggers, simulation, approvals)
- `/api/documents` -- Document management (templates, generation, e-signatures)
- `/api/decisions` -- Decision support (matrices, pre-mortems, journals)

### Extended Modules
- `/api/admin` -- DLP, e-discovery, policies, SSO
- `/api/analytics` -- Productivity, AI accuracy, habits, goals, costs
- `/api/attention` -- Attention budget, DND settings
- `/api/billing` -- Usage, cost attribution, model routing
- `/api/capture` -- Quick capture, batch processing, routing rules
- `/api/crisis` -- Crisis detection, war rooms, dead man's switch
- `/api/delegation` -- Delegation tracking, approval, scoring
- `/api/developer` -- Plugins, webhooks
- `/api/execution` -- Action queue, runbooks, rollbacks, simulation
- `/api/health` -- Energy, sleep, stress, medical, wearables
- `/api/household` -- Maintenance, shopping, vehicles
- `/api/memory` -- Memory entries, decay, search
- `/api/rules` -- Rule engine (CRUD + conflicts, evaluation, suggestions)
- `/api/safety` -- Email headers, fraud check, injection detection
- `/api/travel` -- Itineraries, preferences, visa requirements
- `/api/voice` -- Voice calls, campaigns, personas, scripts, numbers

## Testing

```bash
# Run all tests
npx jest

# Run tests with coverage
npx jest --coverage

# Run tests in CI mode
npx jest --passWithNoTests --coverage --ci

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
     -e DATABASE_URL="YOUR_DATABASE_URL_HERE" \
     -e REDIS_URL="YOUR_REDIS_URL_HERE" \
     -e NEXTAUTH_SECRET="YOUR_NEXTAUTH_SECRET_HERE" \
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

### CI/CD Pipeline

The project includes a GitHub Actions CI pipeline (`.github/workflows/ci.yml`) that runs on every push to `master`/`main` and on pull requests:

1. **Lint, Type Check & Test** -- Runs ESLint, TypeScript compiler, and Jest with a PostgreSQL service container
2. **Build** -- Verifies the Next.js production build succeeds
3. **Docker Build** -- Builds the Docker image (only on pushes to master)

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
