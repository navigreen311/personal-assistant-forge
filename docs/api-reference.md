# API Reference

> **Base URL:** `http://localhost:3000/api`
>
> **Version:** 0.1.0
>
> Complete REST API reference for PersonalAssistantForge.

---

## Table of Contents

- [Authentication](#authentication)
- [Response Format](#response-format)
- [Pagination](#pagination)
- [Rate Limiting](#rate-limiting)
- [Error Codes](#error-codes)
- [API Groups](#api-groups)
  - [Auth](#auth)
  - [Entities](#entities)
  - [Tasks](#tasks)
  - [Contacts](#contacts)
  - [Calendar](#calendar)
  - [Inbox](#inbox)
  - [Finance](#finance)
  - [Knowledge](#knowledge)
  - [Workflows](#workflows)
  - [Documents](#documents)
  - [Decisions](#decisions)
  - [Admin](#admin)
  - [Analytics](#analytics)
  - [Attention](#attention)
  - [Billing](#billing)
  - [Capture](#capture)
  - [Crisis](#crisis)
  - [Delegation](#delegation)
  - [Developer](#developer)
  - [Execution](#execution)
  - [Health (System)](#health-system)
  - [Health (Personal Wellness)](#health-personal-wellness)
  - [Household](#household)
  - [Memory](#memory)
  - [Rules](#rules)
  - [Safety](#safety)
  - [Travel](#travel)
  - [Voice](#voice)

---

## Authentication

All API routes require authentication unless explicitly noted. The platform uses **NextAuth.js v4** with JWT-based sessions.

### How to Authenticate

1. **Register** a user via `POST /api/auth/register` (no auth required).
2. **Sign in** via the NextAuth.js endpoint `POST /api/auth/[...nextauth]` (credentials or OAuth provider). This sets a signed session cookie.
3. **Include the session cookie** with every subsequent request. The cookie name is typically `next-auth.session-token` (or `__Secure-next-auth.session-token` over HTTPS).

### Session Object

The middleware extracts the following from the JWT:

| Field            | Type   | Description                        |
|------------------|--------|------------------------------------|
| `userId`         | string | Unique user ID                     |
| `email`          | string | User email                         |
| `name`           | string | Display name                       |
| `role`           | string | User role: `viewer`, `member`, `admin` |
| `activeEntityId` | string | Currently active entity (optional) |

### Authorization Levels

| Wrapper            | Description                                       |
|--------------------|---------------------------------------------------|
| `withAuth`         | Requires a valid session (any role)                |
| `withRole(roles)`  | Requires session + specific role (e.g., `admin`)   |
| `withEntityAccess` | Requires session + ownership of the target entity  |

Unauthenticated requests receive `401`. Unauthorized role/entity access receives `403`.

---

## Response Format

All responses follow a consistent `ApiResponse<T>` envelope.

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-20T12:00:00.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": {
      "fields": [{ "path": "email", "message": "Invalid email address" }]
    }
  },
  "meta": {
    "timestamp": "2026-02-20T12:00:00.000Z"
  }
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 142,
    "timestamp": "2026-02-20T12:00:00.000Z"
  }
}
```

---

## Pagination

Most list endpoints support cursor-based pagination using query parameters:

| Parameter  | Type   | Default | Description                  |
|------------|--------|---------|------------------------------|
| `page`     | number | `1`     | Page number (1-indexed)      |
| `pageSize` | number | `20`    | Items per page (max 100)     |

**Example:**

```bash
curl -b cookies.txt "http://localhost:3000/api/tasks?entityId=ent_123&page=2&pageSize=10"
```

The response `meta` object contains `page`, `pageSize`, and `total` for calculating total pages:

```
totalPages = Math.ceil(meta.total / meta.pageSize)
```

---

## Rate Limiting

The API uses a sliding-window rate limiter backed by Redis (fail-open when Redis is unavailable).

### How It Works

- Each request is identified by IP address (via `X-Forwarded-For` or direct IP).
- Requests are tracked in a Redis sorted set per time window.
- When the limit is exceeded, the API returns `429 Too Many Requests`.

### Response Headers

Every response includes rate limit headers:

| Header                | Description                          |
|-----------------------|--------------------------------------|
| `X-RateLimit-Limit`   | Maximum requests allowed in window   |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset`   | ISO 8601 timestamp when window resets |
| `Retry-After`         | Seconds until next request allowed (only on 429) |

### Rate Limited Response

```json
HTTP/1.1 429 Too Many Requests
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2026-02-20T12:01:00.000Z

{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests"
  },
  "meta": { "timestamp": "2026-02-20T12:00:00.000Z" }
}
```

---

## Error Codes

| HTTP Status | Code                | Description                                      |
|-------------|---------------------|--------------------------------------------------|
| `400`       | `VALIDATION_ERROR`  | Request body or query params failed Zod validation |
| `400`       | `WEAK_PASSWORD`     | Password does not meet strength requirements      |
| `400`       | `BAD_REQUEST`       | General bad request                               |
| `401`       | `UNAUTHORIZED`      | Missing or invalid session token                  |
| `403`       | `FORBIDDEN`         | Insufficient permissions or entity access denied  |
| `404`       | `NOT_FOUND`         | Requested resource does not exist                 |
| `409`       | `EMAIL_EXISTS`      | Registration email already in use                 |
| `429`       | `RATE_LIMITED`      | Too many requests                                 |
| `500`       | `INTERNAL_ERROR`    | Unexpected server error                           |
| `500`       | `CREATE_FAILED`     | Resource creation failed                          |
| `500`       | `LIST_FAILED`       | Resource listing failed                           |
| `500`       | `PARSE_FAILED`      | NLP parsing failed                                |
| `500`       | `FORECAST_FAILED`   | Forecasting computation failed                    |
| `500`       | `SIMULATION_ERROR`  | Action simulation failed                          |

---

## API Groups

---

## Auth

### `POST /api/auth/register`

Create a new user account. A default "Personal" entity is created automatically.

**Auth Required:** No

**Request Body:**

| Field      | Type   | Required | Constraints                       |
|------------|--------|----------|-----------------------------------|
| `name`     | string | Yes      | 2-100 characters                  |
| `email`    | string | Yes      | Valid email                       |
| `password` | string | Yes      | Min 8 characters, strength checked |

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "SecureP@ss123!"
  }'
```

**Response (201):**

```json
{
  "success": true,
  "data": { "userId": "cm1abc123..." },
  "meta": { "timestamp": "2026-02-20T12:00:00.000Z" }
}
```

---

### `GET/POST /api/auth/[...nextauth]`

NextAuth.js handler for sign-in, sign-out, OAuth callbacks, CSRF token, and session management.

**Auth Required:** No

Refer to the [NextAuth.js documentation](https://next-auth.js.org/getting-started/rest-api) for available sub-routes:

- `GET /api/auth/signin` -- Sign-in page
- `POST /api/auth/signin/:provider` -- Initiate sign-in
- `GET /api/auth/signout` -- Sign-out page
- `POST /api/auth/signout` -- Sign out
- `GET /api/auth/session` -- Get current session
- `GET /api/auth/csrf` -- Get CSRF token
- `GET /api/auth/providers` -- List configured providers

---

### `GET /api/auth/profile`

Get the authenticated user's profile, preferences, and entity list.

**Auth Required:** Yes

**Example Request:**

```bash
curl -b cookies.txt http://localhost:3000/api/auth/profile
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "cm1abc123...",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "preferences": {
      "defaultTone": "WARM",
      "attentionBudget": 10,
      "focusHours": [],
      "vipContacts": [],
      "meetingFreedays": [],
      "autonomyLevel": "SUGGEST"
    },
    "timezone": "America/Chicago",
    "chronotype": null,
    "entityIds": ["ent_abc123"],
    "createdAt": "2026-02-20T10:00:00.000Z",
    "updatedAt": "2026-02-20T10:00:00.000Z"
  },
  "meta": { "timestamp": "2026-02-20T12:00:00.000Z" }
}
```

---

### `PATCH /api/auth/profile`

Update the authenticated user's profile and preferences.

**Auth Required:** Yes

**Request Body (all fields optional):**

| Field          | Type   | Description                                    |
|----------------|--------|------------------------------------------------|
| `name`         | string | 2-100 characters                               |
| `timezone`     | string | IANA timezone (e.g., `America/Chicago`)        |
| `chronotype`   | enum   | `EARLY_BIRD`, `NIGHT_OWL`, `FLEXIBLE`          |
| `preferences`  | object | Nested preferences (merged with existing)      |

**Preferences sub-fields:**

| Field              | Type     | Description                                                  |
|--------------------|----------|--------------------------------------------------------------|
| `defaultTone`      | enum     | `FIRM`, `DIPLOMATIC`, `WARM`, `DIRECT`, `CASUAL`, `FORMAL`, `EMPATHETIC`, `AUTHORITATIVE` |
| `attentionBudget`  | number   | 1-100, daily notification budget                             |
| `focusHours`       | array    | `[{ start: "09:00", end: "12:00" }]`                        |
| `vipContacts`      | string[] | Contact IDs that bypass DND                                  |
| `meetingFreedays`  | number[] | Day of week (0=Sunday, 6=Saturday)                           |
| `autonomyLevel`    | enum     | `SUGGEST`, `DRAFT`, `EXECUTE_WITH_APPROVAL`, `EXECUTE_AUTONOMOUS` |

**Example Request:**

```bash
curl -X PATCH -b cookies.txt http://localhost:3000/api/auth/profile \
  -H "Content-Type: application/json" \
  -d '{
    "timezone": "America/New_York",
    "preferences": { "autonomyLevel": "DRAFT" }
  }'
```

---

### `POST /api/auth/switch-entity`

Switch the active entity for the current session.

**Auth Required:** Yes

**Request Body:**

| Field      | Type   | Required | Description         |
|------------|--------|----------|---------------------|
| `entityId` | string | Yes      | Target entity ID    |

**Response (200):**

```json
{
  "success": true,
  "data": { "activeEntityId": "ent_xyz789" },
  "meta": { "timestamp": "..." }
}
```

Returns `403` if the user does not own the entity.

---

## Entities

Multi-entity management for businesses, personal accounts, and organizations.

### `GET /api/entities`

List entities owned by the current user.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** Standard pagination (`page`, `pageSize`), plus entity-specific filters parsed by `listEntitiesSchema`.

```bash
curl -b cookies.txt "http://localhost:3000/api/entities?page=1&pageSize=10"
```

---

### `POST /api/entities`

Create a new entity.

**Auth Required:** Yes

**Request Body:** Validated by `createEntitySchema` (name, type, metadata fields).

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/entities \
  -H "Content-Type: application/json" \
  -d '{ "name": "Acme LLC", "type": "Business" }'
```

**Response (201):** Returns the created entity object.

---

### `GET /api/entities/:entityId`

Get a single entity's details.

**Auth Required:** Yes (entity owner)

---

### `PATCH /api/entities/:entityId`

Update an entity.

**Auth Required:** Yes (entity owner)

**Request Body:** Validated by `updateEntitySchema`.

---

### `DELETE /api/entities/:entityId`

Delete an entity.

**Auth Required:** Yes (entity owner)

**Response (200):** `{ "deleted": true }`

---

### `GET /api/entities/:entityId/compliance`

Get compliance status for an entity.

**Auth Required:** Yes (entity owner)

---

### `GET /api/entities/:entityId/dashboard`

Get dashboard data for an entity (aggregated metrics).

**Auth Required:** Yes (entity owner)

---

### `GET /api/entities/:entityId/health`

Get entity health metrics.

**Auth Required:** Yes (entity owner)

---

### `GET /api/entities/:entityId/persona`

Get the AI persona context configured for this entity.

**Auth Required:** Yes (entity owner)

---

### `GET /api/entities/executive-view`

Get a unified executive view across all entities owned by the user.

**Auth Required:** Yes

```bash
curl -b cookies.txt http://localhost:3000/api/entities/executive-view
```

---

### `GET /api/entities/shared-contacts`

Find contacts that appear across multiple entities.

**Auth Required:** Yes

---

## Tasks

Full task management with CRUD, dependencies, AI-powered prioritization, NLP parsing, and forecasting.

### `GET /api/tasks`

List tasks with filtering, sorting, and pagination.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter    | Type   | Description                                     |
|--------------|--------|-------------------------------------------------|
| `entityId`   | string | Filter by entity                                |
| `projectId`  | string | Filter by project                               |
| `assigneeId` | string | Filter by assignee                              |
| `status`     | string | Comma-separated: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED` |
| `priority`   | string | Comma-separated: `P0`, `P1`, `P2`              |
| `tags`       | string | Comma-separated tag list                        |
| `search`     | string | Full-text search                                |
| `sort`       | string | `field:direction` (e.g., `dueDate:asc`)         |
| `page`       | number | Page number                                     |
| `pageSize`   | number | Items per page                                  |

**Example:**

```bash
curl -b cookies.txt "http://localhost:3000/api/tasks?entityId=ent_123&status=TODO,IN_PROGRESS&priority=P0&sort=dueDate:asc&page=1&pageSize=20"
```

---

### `POST /api/tasks`

Create a new task.

**Auth Required:** Yes

**Request Body:**

| Field          | Type     | Required | Description                       |
|----------------|----------|----------|-----------------------------------|
| `title`        | string   | Yes      | Task title                        |
| `entityId`     | string   | Yes      | Parent entity                     |
| `description`  | string   | No       | Detailed description              |
| `projectId`    | string   | No       | Parent project                    |
| `priority`     | enum     | No       | `P0`, `P1`, `P2`                  |
| `dueDate`      | datetime | No       | ISO 8601 datetime                 |
| `dependencies` | string[] | No       | IDs of blocking tasks             |
| `assigneeId`   | string   | No       | Assigned user ID                  |
| `tags`         | string[] | No       | Tags for categorization           |
| `createdFrom`  | object   | No       | `{ type: string, sourceId: string }` |

**Example:**

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Review Q1 financials",
    "entityId": "ent_123",
    "priority": "P0",
    "dueDate": "2026-03-01T17:00:00.000Z",
    "tags": ["finance", "quarterly"]
  }'
```

**Response (201):** Returns the created task object.

---

### `GET /api/tasks/:id`

Get task details.

**Auth Required:** Yes

---

### `PUT /api/tasks/:id`

Update a task (full replace of provided fields).

**Auth Required:** Yes

---

### `DELETE /api/tasks/:id`

Delete a task.

**Auth Required:** Yes

---

### `PATCH /api/tasks/bulk`

Bulk update multiple tasks.

**Auth Required:** Yes

**Request Body:**

| Field     | Type     | Required | Description                    |
|-----------|----------|----------|--------------------------------|
| `taskIds` | string[] | Yes      | Array of task IDs (min 1)      |
| `updates` | object   | Yes      | Fields to update               |

**Updates sub-fields:**

| Field        | Type   | Description                                 |
|--------------|--------|---------------------------------------------|
| `status`     | enum   | `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`, `CANCELLED` |
| `priority`   | enum   | `P0`, `P1`, `P2`                            |
| `assigneeId` | string | New assignee                                |
| `projectId`  | string | New project                                 |

```bash
curl -X PATCH -b cookies.txt http://localhost:3000/api/tasks/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "taskIds": ["task_1", "task_2", "task_3"],
    "updates": { "status": "DONE" }
  }'
```

---

### `GET /api/tasks/dependencies`

Build a dependency graph for a project.

**Auth Required:** Yes

**Query Parameters:**

| Parameter   | Type   | Required | Description  |
|-------------|--------|----------|--------------|
| `projectId` | string | Yes      | Project ID   |

---

### `GET /api/tasks/forecast`

Get AI-powered completion forecast for a task or project.

**Auth Required:** Yes

**Query Parameters (one required):**

| Parameter   | Type   | Description                 |
|-------------|--------|-----------------------------|
| `taskId`    | string | Forecast a single task      |
| `projectId` | string | Forecast a whole project    |

---

### `POST /api/tasks/parse`

Parse natural language text into structured task data using AI.

**Auth Required:** Yes

**Request Body:**

| Field      | Type   | Required | Description                       |
|------------|--------|----------|-----------------------------------|
| `text`     | string | Yes      | Natural language task description |
| `entityId` | string | Yes      | Entity context                    |

**Example:**

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/tasks/parse \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Call John about the contract by Friday at 5pm",
    "entityId": "ent_123"
  }'
```

**Response (200):** Parsed task fields (title, dueDate, priority, etc.).

---

### `GET /api/tasks/prioritize`

Get the daily top 3 recommended tasks.

**Auth Required:** Yes

**Query Parameters:**

| Parameter  | Type   | Required |
|------------|--------|----------|
| `userId`   | string | Yes      |
| `entityId` | string | Yes      |

---

### `POST /api/tasks/prioritize`

Score and prioritize a batch of tasks using AI.

**Auth Required:** Yes

**Request Body:**

| Field      | Type     | Required | Description                |
|------------|----------|----------|----------------------------|
| `entityId` | string   | Yes      | Entity context             |
| `taskIds`  | string[] | No       | Specific tasks to score (all open tasks if omitted) |

---

### `GET /api/tasks/procrastination`

Detect tasks being procrastinated on.

**Auth Required:** Yes

**Query Parameters:**

| Parameter  | Type   | Required |
|------------|--------|----------|
| `entityId` | string | Yes      |

---

### `GET /api/tasks/recurring`

List recurring task configurations for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/tasks/recurring`

Create a recurring task configuration.

**Auth Required:** Yes

**Request Body:**

| Field              | Type    | Required | Description                         |
|--------------------|---------|----------|-------------------------------------|
| `taskTemplateId`   | string  | Yes      | Template task ID                    |
| `cadence`          | object  | Yes      | Cadence config (discriminated union)|
| `nextDue`          | datetime| Yes      | Next due date                       |
| `slaHours`         | number  | No       | SLA hours for completion            |
| `autoAdjust`       | boolean | Yes      | Auto-adjust cadence based on completion patterns |
| `isActive`         | boolean | Yes      | Whether the recurring config is active |

**Cadence types:** `DAILY`, `WEEKLY` (dayOfWeek), `BIWEEKLY` (dayOfWeek), `MONTHLY` (dayOfMonth), `QUARTERLY` (month, dayOfMonth), `CUSTOM` (cronExpression).

---

### `PUT /api/tasks/recurring`

Auto-adjust cadence for a recurring task.

**Auth Required:** Yes

**Request Body:** `{ "configId": "..." }`

---

### `DELETE /api/tasks/recurring`

Deactivate a recurring task configuration.

**Auth Required:** Yes

**Request Body:** `{ "configId": "..." }`

---

## Contacts

Contact management with communication cadence, commitments, and relationship scoring.

### `GET /api/contacts`

List contacts with optional filters.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter  | Type   | Description                     |
|------------|--------|---------------------------------|
| `entityId` | string | Filter by entity                |
| `tags`     | string | Comma-separated tags            |
| `page`     | number | Page number                     |
| `pageSize` | number | Items per page (max 100)        |

---

### `POST /api/contacts`

Create a new contact.

**Auth Required:** Yes

**Request Body:**

| Field         | Type     | Required | Description                         |
|---------------|----------|----------|-------------------------------------|
| `entityId`    | string   | Yes      | Parent entity                       |
| `name`        | string   | Yes      | Contact name                        |
| `email`       | string   | No       | Email address                       |
| `phone`       | string   | No       | Phone number                        |
| `channels`    | array    | No       | Communication channels              |
| `preferences` | object   | No       | Contact preferences                 |
| `tags`        | string[] | No       | Tags                                |

**Channel object:** `{ type: "EMAIL"|"SMS"|"SLACK"|"TEAMS"|"DISCORD"|"WHATSAPP"|"TELEGRAM"|"VOICE"|"MANUAL", handle: "..." }`

**Preferences object:**

| Field              | Type    | Default    |
|--------------------|---------|------------|
| `preferredChannel` | enum    | `EMAIL`    |
| `preferredTone`    | enum    | `DIRECT`   |
| `timezone`         | string  | --         |
| `doNotContact`     | boolean | `false`    |

**Example:**

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/contacts \
  -H "Content-Type: application/json" \
  -d '{
    "entityId": "ent_123",
    "name": "Bob Smith",
    "email": "bob@example.com",
    "channels": [{ "type": "EMAIL", "handle": "bob@example.com" }],
    "tags": ["client", "vip"]
  }'
```

---

### `GET /api/contacts/:id`

Get contact details including recent messages and calls (last 10 each).

**Auth Required:** Yes

---

### `PUT /api/contacts/:id`

Update a contact. All fields optional; preferences are merged with existing.

**Auth Required:** Yes

---

### `DELETE /api/contacts/:id`

Soft-delete a contact (marks `doNotContact: true` and adds `_deleted` tag).

**Auth Required:** Yes

---

### `GET /api/contacts/:id/cadence`

Get the communication cadence configured for a contact.

**Auth Required:** Yes

---

### `PUT /api/contacts/:id/cadence`

Set communication cadence for a contact.

**Auth Required:** Yes

**Request Body:**

| Field       | Type | Required | Values                                           |
|-------------|------|----------|--------------------------------------------------|
| `frequency` | enum | Yes      | `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY`, `QUARTERLY` |

---

### `GET /api/contacts/:id/commitments`

List commitments associated with a contact.

**Auth Required:** Yes

---

### `POST /api/contacts/:id/commitments`

Add a commitment to a contact.

**Auth Required:** Yes

**Request Body:**

| Field         | Type     | Required | Description                          |
|---------------|----------|----------|--------------------------------------|
| `description` | string   | Yes      | What was committed                   |
| `direction`   | enum     | Yes      | `TO` (you committed to them) or `FROM` (they committed to you) |
| `status`      | enum     | No       | `OPEN`, `FULFILLED`, `BROKEN` (default `OPEN`) |
| `dueDate`     | datetime | No       | When the commitment is due           |

---

### `GET /api/contacts/:id/relationship-score`

Calculate and return the relationship health score for a contact.

**Auth Required:** Yes

**Response (200):**

```json
{
  "success": true,
  "data": { "contactId": "ct_123", "score": { ... } }
}
```

---

## Calendar

Event management with scheduling, conflict detection, availability, and AI-powered prep packets.

### `GET /api/calendar`

Get calendar view data.

**Auth Required:** Yes

**Query Parameters:**

| Parameter  | Type   | Default  | Description                    |
|------------|--------|----------|--------------------------------|
| `viewMode` | string | `week`   | `day`, `week`, `month`         |
| `date`     | string | now      | ISO 8601 date to center on     |
| `entityId` | string | --       | Filter by entity               |

---

### `POST /api/calendar`

Create a calendar event.

**Auth Required:** Yes

**Request Body:** Validated by `scheduleRequestSchema` plus a `selectedSlot` object.

| Field          | Type   | Required | Description              |
|----------------|--------|----------|--------------------------|
| `selectedSlot` | object | Yes      | `{ start: datetime, end: datetime }` |
| (other fields) | --     | Yes      | Schedule request fields  |

---

### `GET /api/calendar/:eventId`

Get event details.

**Auth Required:** Yes

**Response:** Full `CalendarEvent` object including `prepPacket`, `meetingNotes`, `bufferBefore`, `bufferAfter`.

---

### `PATCH /api/calendar/:eventId`

Update an event.

**Auth Required:** Yes

---

### `DELETE /api/calendar/:eventId`

Delete an event.

**Auth Required:** Yes

**Response:** `{ "deleted": true }`

---

### `GET /api/calendar/availability`

Get available time slots within a date range (business hours 8am-6pm, weekdays only).

**Auth Required:** Yes

**Query Parameters:**

| Parameter   | Type   | Required | Description         |
|-------------|--------|----------|---------------------|
| `startDate` | date   | Yes      | Range start         |
| `endDate`   | date   | Yes      | Range end           |
| `entityId`  | string | No       | Filter by entity    |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "totalEvents": 12,
    "freeSlots": [
      { "start": "2026-02-20T08:00:00.000Z", "end": "2026-02-20T09:30:00.000Z" }
    ],
    "busySlots": [
      { "start": "...", "end": "...", "title": "Team standup", "eventId": "evt_123" }
    ]
  }
}
```

---

### `POST /api/calendar/conflicts`

Check for scheduling conflicts in a time range.

**Auth Required:** Yes

**Request Body:** Validated by `conflictCheckSchema` (entityId, startTime, endTime, excludeEventId).

---

### `POST /api/calendar/schedule`

Find available time slots for a new meeting.

**Auth Required:** Yes

**Request Body:** Validated by `scheduleRequestSchema`, plus optional `lookAheadDays`.

---

### `POST /api/calendar/schedule/natural`

Schedule a meeting using natural language input.

**Auth Required:** Yes

---

### `POST /api/calendar/parse`

Parse natural language into calendar event data.

**Auth Required:** Yes

---

### `POST /api/calendar/optimize`

Optimize the schedule based on energy levels and priorities.

**Auth Required:** Yes

---

### `GET /api/calendar/analytics`

Get calendar analytics (meeting load, time distribution).

**Auth Required:** Yes

---

### `GET /api/calendar/:eventId/prep-packet`

Get or generate a meeting preparation packet.

**Auth Required:** Yes

---

### `POST /api/calendar/:eventId/prep-packet`

Generate a meeting preparation packet.

**Auth Required:** Yes

---

### `POST /api/calendar/:eventId/post-meeting`

Record post-meeting notes and action items.

**Auth Required:** Yes

---

### `POST /api/calendar/:eventId/reschedule`

Reschedule an event.

**Auth Required:** Yes

---

## Inbox

Message management with AI triage, draft generation, follow-up tracking, and canned responses.

### `GET /api/inbox`

List inbox messages with filters.

**Auth Required:** Yes

**Query Parameters:** Validated by `inboxListSchema` (entityId, status, priority, page, pageSize, etc.).

**Response (200):**

```json
{
  "success": true,
  "data": {
    "items": [ ... ],
    "stats": { "unread": 12, "urgent": 3 },
    "meta": { "page": 1, "pageSize": 20, "total": 85 }
  }
}
```

---

### `GET /api/inbox/:messageId`

Get full message details.

**Auth Required:** Yes

---

### `PATCH /api/inbox/:messageId`

Update message state (read, star, archive).

**Auth Required:** Yes

**Request Body (all optional):**

| Field       | Type    | Description          |
|-------------|---------|----------------------|
| `isRead`    | boolean | Mark as read/unread  |
| `isStarred` | boolean | Toggle star          |
| `archived`  | boolean | Archive the message  |

---

### `DELETE /api/inbox/:messageId`

Archive a message.

**Auth Required:** Yes

---

### `POST /api/inbox/triage`

AI-triage a single message (classify priority, suggest action).

**Auth Required:** Yes

**Request Body:** Validated by `triageMessageSchema` (messageId, entityId).

---

### `POST /api/inbox/triage/batch`

Batch AI-triage multiple messages.

**Auth Required:** Yes

---

### `POST /api/inbox/draft`

Generate an AI draft reply.

**Auth Required:** Yes

**Request Body:** Validated by `draftRequestSchema`.

---

### `POST /api/inbox/draft/refine`

AI-refine an existing draft message.

**Auth Required:** Yes

---

### `POST /api/inbox/send`

Send a draft message.

**Auth Required:** Yes

**Request Body:**

| Field       | Type   | Required | Description     |
|-------------|--------|----------|-----------------|
| `messageId` | string | Yes      | Draft to send   |

---

### `GET /api/inbox/follow-up`

List follow-up reminders.

**Auth Required:** Yes

**Query Parameters:** `entityId` (optional)

---

### `POST /api/inbox/follow-up`

Create a follow-up reminder.

**Auth Required:** Yes

**Request Body:** Validated by `createFollowUpSchema`.

---

### `PATCH /api/inbox/follow-up/:followUpId`

Update a follow-up.

**Auth Required:** Yes

---

### `DELETE /api/inbox/follow-up/:followUpId`

Delete a follow-up.

**Auth Required:** Yes

---

### `GET /api/inbox/canned-responses`

List canned response templates.

**Auth Required:** Yes

---

### `POST /api/inbox/canned-responses`

Create a canned response template.

**Auth Required:** Yes

---

### `GET /api/inbox/canned-responses/:responseId`

Get canned response details.

**Auth Required:** Yes

---

### `PATCH /api/inbox/canned-responses/:responseId`

Update a canned response.

**Auth Required:** Yes

---

### `DELETE /api/inbox/canned-responses/:responseId`

Delete a canned response.

**Auth Required:** Yes

---

### `GET /api/inbox/stats`

Get inbox statistics (unread count, response times, etc.).

**Auth Required:** Yes

**Query Parameters:** `entityId` (optional)

---

## Finance

Budgets, expenses, invoices, P&L, cash flow forecasting, and unified financial dashboard.

### `GET /api/finance/budget`

List budgets for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/finance/budget`

Create a new budget.

**Auth Required:** Yes

**Request Body:**

| Field            | Type     | Required | Description                         |
|------------------|----------|----------|-------------------------------------|
| `entityId`       | string   | Yes      | Entity                              |
| `name`           | string   | Yes      | Budget name                         |
| `period`         | object   | Yes      | `{ start: datetime, end: datetime }`|
| `categories`     | array    | Yes      | Budget categories (min 1)           |
| `totalBudgeted`  | number   | Yes      | Total budget amount                 |
| `status`         | enum     | No       | `ACTIVE`, `DRAFT`, `CLOSED` (default `DRAFT`) |

**Category object:**

| Field       | Type   | Description        |
|-------------|--------|--------------------|
| `category`  | string | Category name      |
| `budgeted`  | number | Budgeted amount    |
| `spent`     | number | Amount spent       |

---

### `GET /api/finance/budget/:id`

Get budget details.

**Auth Required:** Yes

---

### `GET /api/finance/expenses`

List expenses with filters.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter   | Type     | Required | Description               |
|-------------|----------|----------|---------------------------|
| `entityId`  | string   | Yes      | Entity                    |
| `category`  | string   | No       | Filter by category        |
| `vendor`    | string   | No       | Filter by vendor          |
| `startDate` | datetime | No       | Date range start          |
| `endDate`   | datetime | No       | Date range end            |

---

### `POST /api/finance/expenses`

Create an expense.

**Auth Required:** Yes

**Request Body:**

| Field                | Type     | Required | Description                          |
|----------------------|----------|----------|--------------------------------------|
| `entityId`           | string   | Yes      | Entity                               |
| `amount`             | number   | Yes      | Positive amount                      |
| `currency`           | string   | No       | Default `USD`                        |
| `category`           | string   | No       | Expense category                     |
| `vendor`             | string   | Yes      | Vendor name                          |
| `description`        | string   | Yes      | Description                          |
| `date`               | datetime | Yes      | Expense date                         |
| `receiptUrl`         | string   | No       | Receipt file URL                     |
| `ocrData`            | object   | No       | OCR extraction data                  |
| `isRecurring`        | boolean  | No       | Default `false`                      |
| `recurringFrequency` | enum     | No       | `WEEKLY`, `MONTHLY`, `QUARTERLY`, `ANNUAL` |
| `tags`               | string[] | No       | Tags                                 |

---

### `GET /api/finance/expenses/categories`

List expense categories for an entity.

**Auth Required:** Yes

---

### `GET /api/finance/invoices`

List invoices with filters.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `entityId` (required), `status`, `contactId`, `page`, `pageSize`

---

### `POST /api/finance/invoices`

Create an invoice.

**Auth Required:** Yes

**Request Body:**

| Field          | Type     | Required | Description                          |
|----------------|----------|----------|--------------------------------------|
| `entityId`     | string   | Yes      | Entity                               |
| `contactId`    | string   | No       | Client contact                       |
| `lineItems`    | array    | Yes      | Line items (min 1)                   |
| `tax`          | number   | Yes      | Tax amount                           |
| `currency`     | string   | No       | Default `USD`                        |
| `status`       | enum     | No       | `DRAFT`, `SENT`, `VIEWED`, `PAID`, `OVERDUE`, `CANCELLED` |
| `issuedDate`   | datetime | Yes      | Issue date                           |
| `dueDate`      | datetime | Yes      | Due date                             |
| `paidDate`     | datetime | No       | Payment date                         |
| `notes`        | string   | No       | Notes                                |
| `paymentTerms` | string   | No       | Default `Net 30`                     |

**Line item:** `{ description, quantity, unitPrice, total }`

---

### `GET /api/finance/invoices/:id`

Get invoice details.

**Auth Required:** Yes

---

### `PUT /api/finance/invoices/:id`

Update an invoice.

**Auth Required:** Yes

---

### `GET /api/finance/invoices/aging`

Get invoice aging analysis.

**Auth Required:** Yes

---

### `GET /api/finance/pnl`

Generate a Profit & Loss statement.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `startDate` (required), `endDate` (required)

---

### `GET /api/finance/forecast`

Get cash flow forecast.

**Auth Required:** Yes

**Query Parameters:**

| Parameter         | Type   | Default | Description             |
|-------------------|--------|---------|-------------------------|
| `entityId`        | string | --      | Required                |
| `days`            | number | `90`    | Forecast horizon (1-365)|
| `startingBalance` | number | `0`     | Starting cash balance   |

---

### `POST /api/finance/forecast/scenario`

Run a financial scenario analysis.

**Auth Required:** Yes

---

### `GET /api/finance/dashboard`

Get unified financial dashboard.

**Auth Required:** Yes

**Query Parameters:** `userId` (required), `startDate` (required), `endDate` (required)

---

### `GET /api/finance/renewals`

Get renewal tracking data (subscriptions, contracts).

**Auth Required:** Yes

---

## Knowledge

Knowledge base with capture, search, knowledge graph, SOPs, and learning tracker.

### `GET /api/knowledge`

List knowledge entries.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `entityId` (required), `type`, `tags`, `page`, `pageSize`

---

### `POST /api/knowledge`

Capture a new knowledge entry.

**Auth Required:** Yes

**Request Body:**

| Field      | Type     | Required | Description                          |
|------------|----------|----------|--------------------------------------|
| `entityId` | string   | Yes      | Entity                               |
| `type`     | enum     | Yes      | `NOTE`, `BOOKMARK`, `VOICE_MEMO`, `CODE_SNIPPET`, `QUOTE`, `ARTICLE`, `IMAGE_NOTE` |
| `content`  | string   | Yes      | Content body                         |
| `title`    | string   | No       | Title                                |
| `source`   | string   | Yes      | Where it came from                   |
| `tags`     | string[] | No       | Tags                                 |
| `metadata` | object   | No       | Arbitrary metadata                   |

---

### `GET /api/knowledge/:id`

Get knowledge entry details.

**Auth Required:** Yes

---

### `PUT /api/knowledge/:id`

Update a knowledge entry.

**Auth Required:** Yes

---

### `DELETE /api/knowledge/:id`

Delete a knowledge entry.

**Auth Required:** Yes

---

### `GET /api/knowledge/:id/links`

Get linked knowledge entries.

**Auth Required:** Yes

---

### `POST /api/knowledge/:id/links`

Create a link between knowledge entries.

**Auth Required:** Yes

---

### `GET /api/knowledge/search`

Full-text search across knowledge entries.

**Auth Required:** Yes

**Query Parameters:**

| Parameter   | Type   | Required | Description                  |
|-------------|--------|----------|------------------------------|
| `entityId`  | string | Yes      | Entity                       |
| `query`     | string | No       | Search query                 |
| `types`     | string | No       | Comma-separated types        |
| `tags`      | string | No       | Comma-separated tags         |
| `source`    | string | No       | Filter by source             |
| `startDate` | string | No       | Date range start             |
| `endDate`   | string | No       | Date range end               |

---

### `GET /api/knowledge/graph`

Build and return the knowledge graph for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/knowledge/ingest`

Ingest a document into the knowledge base.

**Auth Required:** Yes

**Request Body:**

| Field      | Type   | Required | Description        |
|------------|--------|----------|--------------------|
| `entityId` | string | Yes      | Entity             |
| `filename` | string | Yes      | File name          |
| `mimeType` | string | Yes      | MIME type          |
| `content`  | string | Yes      | File content       |
| `source`   | string | Yes      | Source identifier  |

---

### `GET /api/knowledge/sops`

List Standard Operating Procedures.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `status`, `tags`

---

### `POST /api/knowledge/sops`

Create a SOP.

**Auth Required:** Yes

**Request Body:**

| Field               | Type     | Required | Description                      |
|---------------------|----------|----------|----------------------------------|
| `entityId`          | string   | Yes      | Entity                           |
| `title`             | string   | Yes      | SOP title                        |
| `description`       | string   | Yes      | Description                      |
| `steps`             | array    | Yes      | SOP steps (min 1)                |
| `triggerConditions` | string[] | Yes      | When to trigger this SOP         |
| `tags`              | string[] | Yes      | Tags                             |
| `status`            | enum     | Yes      | `DRAFT`, `ACTIVE`, `ARCHIVED`    |

**Step object:** `{ order, instruction, notes?, estimatedMinutes?, isOptional }`

---

### `GET /api/knowledge/sops/:id`

Get SOP details.

**Auth Required:** Yes

---

### `PUT /api/knowledge/sops/:id`

Update a SOP.

**Auth Required:** Yes

---

### `GET /api/knowledge/learning`

List learning items.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `status`

---

### `POST /api/knowledge/learning`

Add a learning item.

**Auth Required:** Yes

**Request Body:**

| Field            | Type     | Required | Description                      |
|------------------|----------|----------|----------------------------------|
| `entityId`       | string   | Yes      | Entity                           |
| `title`          | string   | Yes      | Learning item title              |
| `type`           | enum     | Yes      | `BOOK`, `COURSE`, `ARTICLE`, `PODCAST`, `VIDEO`, `PAPER` |
| `status`         | enum     | Yes      | `QUEUED`, `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `progress`       | number   | Yes      | 0-100                            |
| `notes`          | string[] | Yes      | Notes                            |
| `keyTakeaways`   | string[] | Yes      | Key takeaways                    |
| `tags`           | string[] | Yes      | Tags                             |

---

### `PUT /api/knowledge/learning/:id`

Update a learning item.

**Auth Required:** Yes

---

### `GET /api/knowledge/learning/review`

Get items due for spaced repetition review.

**Auth Required:** Yes

---

### `POST /api/knowledge/surface`

AI-suggest relevant knowledge entries for a given context.

**Auth Required:** Yes

---

## Workflows

Workflow automation with graph-based definitions, triggers, simulation, and approval flows.

### `GET /api/workflows`

List workflows for an entity.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `entityId` (required), `status`, `page`, `pageSize`

---

### `POST /api/workflows`

Create a new workflow.

**Auth Required:** Yes

**Request Body:**

| Field      | Type     | Required | Description                   |
|------------|----------|----------|-------------------------------|
| `name`     | string   | Yes      | Workflow name                 |
| `entityId` | string   | Yes      | Entity                        |
| `graph`    | object   | Yes      | `{ nodes: [...], edges: [...] }` |
| `triggers` | array    | Yes      | Trigger configurations        |

---

### `GET /api/workflows/:id`

Get workflow details.

**Auth Required:** Yes

---

### `PUT /api/workflows/:id`

Update a workflow.

**Auth Required:** Yes

---

### `DELETE /api/workflows/:id`

Delete a workflow.

**Auth Required:** Yes

---

### `POST /api/workflows/:id/trigger`

Manually trigger a workflow.

**Auth Required:** Yes

---

### `POST /api/workflows/:id/simulate`

Simulate a workflow execution (dry run).

**Auth Required:** Yes

---

### `GET /api/workflows/:id/executions`

List execution history for a workflow.

**Auth Required:** Yes

---

### `GET /api/workflows/:id/executions/:executionId`

Get execution details.

**Auth Required:** Yes

---

### `DELETE /api/workflows/:id/executions/:executionId`

Delete an execution record.

**Auth Required:** Yes

---

### `POST /api/workflows/:id/executions/:executionId/rollback`

Rollback a workflow execution.

**Auth Required:** Yes

---

### `GET /api/workflows/approvals`

List pending workflow approvals.

**Auth Required:** Yes

---

### `POST /api/workflows/approvals`

Submit an approval decision.

**Auth Required:** Yes

---

## Documents

Document generation from templates, e-signatures, versioning, redlining, and brand kit management.

### `GET /api/documents/templates`

List document templates.

**Auth Required:** Yes

**Query Parameters:** `type`, `category`

---

### `POST /api/documents/templates`

Create a document template.

**Auth Required:** Yes

**Request Body:**

| Field              | Type     | Required | Description                    |
|--------------------|----------|----------|--------------------------------|
| `name`             | string   | Yes      | Template name                  |
| `type`             | string   | Yes      | Document type                  |
| `category`         | string   | Yes      | Category                       |
| `content`          | string   | Yes      | Template content (with variables) |
| `variables`        | array    | Yes      | Template variable definitions  |
| `brandKitRequired` | boolean  | No       | Default `false`                |
| `outputFormats`    | enum[]   | Yes      | `DOCX`, `PDF`, `MARKDOWN`, `HTML` |

**Variable object:** `{ name, label, type: "TEXT"|"DATE"|"NUMBER"|"SELECT"|"ENTITY_REF"|"CONTACT_REF", required, defaultValue?, options? }`

---

### `POST /api/documents/generate`

Generate a document from a template.

**Auth Required:** Yes

**Request Body:**

| Field              | Type   | Required | Description                        |
|--------------------|--------|----------|------------------------------------|
| `templateId`       | string | Yes      | Template to use                    |
| `variables`        | object | Yes      | `{ variableName: "value" }`        |
| `entityId`         | string | Yes      | Entity                             |
| `brandKit`         | object | No       | Brand kit overrides                |
| `outputFormat`     | enum   | No       | `DOCX`, `PDF`, `MARKDOWN`, `HTML` (default `MARKDOWN`) |
| `citationsEnabled` | boolean| No       | Default `false`                    |

---

### `POST /api/documents/:id/sign`

Initiate e-signature process for a document.

**Auth Required:** Yes

**Request Body:**

| Field     | Type   | Required | Description                       |
|-----------|--------|----------|-----------------------------------|
| `signers` | array  | Yes      | `[{ name, email, order }]`        |
| `provider`| string | No       | E-signature provider              |

---

### `GET /api/documents/:id/versions`

Get version history for a document.

**Auth Required:** Yes

---

### `GET /api/documents/:id/redline`

Get a redline (diff) comparison between two document versions.

**Auth Required:** Yes

**Query Parameters:** `v1` (required, version number), `v2` (required, version number)

---

### `GET /api/documents/brand-kit`

Get brand kit configuration for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `PUT /api/documents/brand-kit`

Update brand kit configuration.

**Auth Required:** Yes

**Request Body:**

| Field            | Type   | Required | Description          |
|------------------|--------|----------|----------------------|
| `entityId`       | string | Yes      | Entity               |
| `primaryColor`   | string | No       | Hex color            |
| `secondaryColor` | string | No       | Hex color            |
| `logoUrl`        | string | No       | Logo URL             |
| `fontFamily`     | string | No       | Font family          |
| `headerTemplate` | string | No       | Header HTML/Markdown |
| `footerTemplate` | string | No       | Footer HTML/Markdown |
| `watermark`      | string | No       | Watermark text       |

---

## Decisions

Decision support with weighted matrices, pre-mortem analysis, research agents, and decision journals.

### `GET /api/decisions`

List decision briefs for an entity.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `entityId` (required), `page`, `pageSize`

---

### `POST /api/decisions`

Create a new decision brief.

**Auth Required:** Yes

**Request Body:**

| Field          | Type     | Required | Description                       |
|----------------|----------|----------|-----------------------------------|
| `entityId`     | string   | Yes      | Entity                            |
| `title`        | string   | Yes      | Decision title (max 200 chars)    |
| `description`  | string   | Yes      | Description                       |
| `context`      | string   | Yes      | Context and background            |
| `deadline`     | datetime | No       | Decision deadline                 |
| `stakeholders` | string[] | Yes      | Stakeholder names/IDs             |
| `constraints`  | string[] | Yes      | Known constraints                 |
| `blastRadius`  | enum     | Yes      | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |

---

### `GET /api/decisions/:id`

Get decision brief details.

**Auth Required:** Yes

---

### `DELETE /api/decisions/:id`

Delete a decision brief.

**Auth Required:** Yes

---

### `POST /api/decisions/:id/matrix`

Run a weighted decision matrix analysis.

**Auth Required:** Yes

**Request Body:**

| Field      | Type  | Required | Description               |
|------------|-------|----------|---------------------------|
| `criteria` | array | Yes      | Evaluation criteria       |
| `scores`   | array | Yes      | Scores for each option    |

**Criterion:** `{ id, name, weight (0-1), description? }`

**Score:** `{ criterionId, optionId, score (1-10), rationale }`

Weights must sum to 1.0.

---

### `POST /api/decisions/:id/pre-mortem`

Run a pre-mortem analysis on a decision.

**Auth Required:** Yes

**Request Body:**

| Field            | Type   | Required | Description                          |
|------------------|--------|----------|--------------------------------------|
| `chosenOptionId` | string | Yes      | The option being analyzed            |
| `timeHorizon`    | enum   | Yes      | `30_DAYS`, `90_DAYS`, `1_YEAR`, `3_YEARS` |

---

### `GET /api/decisions/journal`

List decision journal entries.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `entityId` (required), `upcomingDays` (optional, returns entries due for review), `page`, `pageSize`

---

### `POST /api/decisions/journal`

Create a decision journal entry.

**Auth Required:** Yes

**Request Body:**

| Field               | Type     | Required | Description                |
|---------------------|----------|----------|----------------------------|
| `entityId`          | string   | Yes      | Entity                     |
| `decisionId`        | string   | No       | Linked decision brief      |
| `title`             | string   | Yes      | Entry title (max 200)      |
| `context`           | string   | Yes      | Decision context           |
| `optionsConsidered` | string[] | Yes      | Options that were evaluated|
| `chosenOption`      | string   | Yes      | The chosen option          |
| `rationale`         | string   | Yes      | Why this was chosen        |
| `expectedOutcomes`  | string[] | Yes      | Expected outcomes          |
| `reviewDate`        | datetime | Yes      | When to review this decision |

---

### `PUT /api/decisions/journal/:id/review`

Review and update a journal entry.

**Auth Required:** Yes

---

### `POST /api/decisions/research`

Conduct AI-powered research on a topic.

**Auth Required:** Yes

**Request Body:**

| Field         | Type     | Required | Description                          |
|---------------|----------|----------|--------------------------------------|
| `query`       | string   | Yes      | Research query (max 500 chars)       |
| `entityId`    | string   | Yes      | Entity                               |
| `depth`       | enum     | Yes      | `QUICK`, `STANDARD`, `DEEP`         |
| `sourceTypes` | enum[]   | Yes      | `WEB`, `DOCUMENT`, `KNOWLEDGE`       |
| `maxSources`  | number   | Yes      | 1-20                                 |

---

## Admin

Administrative endpoints for DLP, e-discovery, policies, and SSO. All require `admin` role.

### `GET /api/admin/dlp`

List DLP (Data Loss Prevention) rules.

**Auth Required:** Yes (admin) | **Query:** `entityId` (required)

---

### `POST /api/admin/dlp`

Create a DLP rule.

**Auth Required:** Yes (admin)

**Request Body:**

| Field      | Type    | Required | Description                       |
|------------|---------|----------|-----------------------------------|
| `entityId` | string  | Yes      | Entity                            |
| `name`     | string  | Yes      | Rule name                         |
| `pattern`  | string  | Yes      | Regex pattern to match            |
| `action`   | enum    | Yes      | `BLOCK`, `WARN`, `LOG`, `REDACT`  |
| `scope`    | enum    | Yes      | `OUTBOUND_MESSAGES`, `DOCUMENTS`, `ALL` |
| `isActive` | boolean | No       | Default `true`                    |

---

### `POST /api/admin/dlp/check`

Check content against DLP rules.

**Auth Required:** Yes (admin)

**Request Body:** `{ entityId, content, scope }`

---

### `GET /api/admin/ediscovery`

List e-discovery exports.

**Auth Required:** Yes (admin) | **Query:** `entityId` (required)

---

### `POST /api/admin/ediscovery`

Request a data export.

**Auth Required:** Yes (admin)

**Request Body:**

| Field         | Type     | Required | Description             |
|---------------|----------|----------|-------------------------|
| `entityId`    | string   | Yes      | Entity                  |
| `requestedBy` | string   | Yes      | Requester identifier    |
| `dateRange`   | object   | Yes      | `{ start, end }`        |
| `dataTypes`   | string[] | Yes      | Types of data to export |

---

### `GET /api/admin/policies`

List organization policies.

**Auth Required:** Yes (admin) | **Query:** `entityId` (required), `type` (optional)

---

### `POST /api/admin/policies`

Create an organization policy.

**Auth Required:** Yes (admin)

**Request Body:**

| Field      | Type    | Required | Description                       |
|------------|---------|----------|-----------------------------------|
| `entityId` | string  | Yes      | Entity                            |
| `name`     | string  | Yes      | Policy name                       |
| `type`     | enum    | Yes      | `RETENTION`, `SHARING`, `COMPLIANCE`, `ACCESS`, `DLP` |
| `config`   | object  | Yes      | Policy configuration              |
| `isActive` | boolean | No       | Default `true`                    |

---

### `GET /api/admin/sso`

Get SSO configuration.

**Auth Required:** Yes (admin) | **Query:** `entityId` (required)

---

### `POST /api/admin/sso`

Configure SSO settings.

**Auth Required:** Yes (admin)

**Request Body:**

| Field                    | Type   | Required | Description                      |
|--------------------------|--------|----------|----------------------------------|
| `entityId`               | string | Yes      | Entity                           |
| `provider`               | enum   | Yes      | `SAML`, `OIDC`                   |
| `action`                 | enum   | No       | `configure`, `enable`, `disable` |
| `issuerUrl`              | string | No       | IdP issuer URL                   |
| `clientId`               | string | No       | OAuth client ID                  |
| `certificateFingerprint` | string | No       | SAML certificate fingerprint     |

---

## Analytics

Productivity scoring, AI accuracy, habits, goals, time audits, and cost analytics.

### `GET /api/analytics/productivity`

Get productivity score for a user.

**Auth Required:** Yes

**Query Parameters:**

| Parameter | Type   | Description                          |
|-----------|--------|--------------------------------------|
| `userId`  | string | User (defaults to self)              |
| `days`    | number | Return trend for N days (1-365)      |
| `date`    | string | Get score for specific date          |

---

### `GET /api/analytics/ai-accuracy`

Get AI accuracy metrics.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `period` or `periods` (for trend)

---

### `GET /api/analytics/bias`

Get bias detection analytics.

**Auth Required:** Yes

---

### `GET /api/analytics/call-analytics`

Get call center metrics and analytics.

**Auth Required:** Yes

---

### `GET /api/analytics/habits`

List tracked habits.

**Auth Required:** Yes

**Query Parameters:** `userId` (optional, defaults to self)

---

### `POST /api/analytics/habits`

Create a habit to track.

**Auth Required:** Yes

**Request Body:**

| Field       | Type   | Required | Description                    |
|-------------|--------|----------|--------------------------------|
| `name`      | string | Yes      | Habit name                     |
| `frequency` | enum   | Yes      | `DAILY`, `WEEKDAY`, `WEEKLY`   |
| `userId`    | string | No       | Defaults to self               |

---

### `POST /api/analytics/habits/:id/complete`

Mark a habit as completed for today.

**Auth Required:** Yes

---

### `GET /api/analytics/goals`

List goals.

**Auth Required:** Yes

**Query Parameters:** `userId` (optional), `entityId` (optional)

---

### `POST /api/analytics/goals`

Create a goal.

**Auth Required:** Yes

**Request Body:**

| Field              | Type     | Required | Description                       |
|--------------------|----------|----------|-----------------------------------|
| `title`            | string   | Yes      | Goal title                        |
| `description`      | string   | No       | Description                       |
| `framework`        | enum     | Yes      | `OKR`, `SMART`, `CUSTOM`          |
| `targetValue`      | number   | Yes      | Target metric value               |
| `unit`             | string   | Yes      | Measurement unit                  |
| `startDate`        | date     | Yes      | Start date                        |
| `endDate`          | date     | Yes      | End date                          |
| `autoProgress`     | boolean  | No       | Auto-track progress               |
| `linkedTaskIds`    | string[] | No       | Linked tasks                      |
| `linkedWorkflowIds`| string[] | No       | Linked workflows                  |
| `milestones`       | array    | No       | `[{ title, targetValue, targetDate }]` |

---

### `GET /api/analytics/goals/:id`

Get goal details.

**Auth Required:** Yes

---

### `PUT /api/analytics/goals/:id`

Update a goal.

**Auth Required:** Yes

---

### `GET /api/analytics/time-audit`

Generate a time audit report.

**Auth Required:** Yes

**Query Parameters:** `userId` (optional), `start` (required, datetime), `end` (required, datetime)

---

### `GET /api/analytics/scorecard`

Get executive scorecard.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `period` (optional)

---

### `GET /api/analytics/llm-costs`

Get LLM cost dashboard.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `period` (optional, `YYYY-MM` format)

---

### `POST /api/analytics/overrides`

Record an AI override event.

**Auth Required:** Yes

---

### `GET /api/analytics/overrides/analysis`

Get analysis of AI override patterns.

**Auth Required:** Yes

---

## Attention

Attention budget management, notification routing, and Do Not Disturb.

### `GET /api/attention`

Get notification routing configuration.

**Auth Required:** Yes

---

### `POST /api/attention`

Route a notification or update routing config.

**Auth Required:** Yes

**Request Body (route a notification):**

| Field      | Type   | Required | Description                   |
|------------|--------|----------|-------------------------------|
| `title`    | string | Yes      | Notification title            |
| `body`     | string | Yes      | Notification body             |
| `source`   | string | Yes      | Source system                 |
| `priority` | enum   | Yes      | `P0`, `P1`, `P2`             |

**Request Body (update routing config):**

```json
{
  "config": [
    {
      "priority": "P0",
      "action": "INTERRUPT",
      "channels": ["sms", "push"]
    },
    {
      "priority": "P1",
      "action": "NEXT_DIGEST",
      "channels": ["email"]
    }
  ]
}
```

**Actions:** `INTERRUPT`, `NEXT_DIGEST`, `WEEKLY_REVIEW`, `SILENT`

---

### `GET /api/attention/budget`

Get current attention budget status (daily budget, remaining, consumed).

**Auth Required:** Yes

---

### `POST /api/attention/budget`

Set, consume, or reset attention budget.

**Auth Required:** Yes

**Set budget:** `{ "dailyBudget": 15 }`

**Consume budget:** `{ "action": "consume", "amount": 1 }`

**Reset budget:** `{ "action": "reset" }`

---

### `GET /api/attention/dnd`

Get Do Not Disturb configuration.

**Auth Required:** Yes

**Query Parameters:** `checkActive=true` returns just the active status.

---

### `POST /api/attention/dnd`

Update DND settings.

**Auth Required:** Yes

**Request Body (all optional):**

| Field                    | Type     | Description                          |
|--------------------------|----------|--------------------------------------|
| `isActive`               | boolean  | Enable/disable DND                   |
| `mode`                   | enum     | `MANUAL`, `FOCUS_HOURS`, `CALENDAR_AWARE`, `SMART` |
| `vipBreakthroughEnabled` | boolean  | Allow VIP contacts to break through  |
| `vipContactIds`          | string[] | VIP contact IDs                      |
| `startTime`              | string   | DND start time                       |
| `endTime`                | string   | DND end time                         |
| `reason`                 | string   | Reason for DND                       |

---

## Billing

Usage metering, cost attribution, budget management, and AI model routing.

### `GET /api/billing/usage`

Get usage summary for an entity.

**Auth Required:** Yes

**Query Parameters:**

| Parameter  | Type     | Required | Description                            |
|------------|----------|----------|----------------------------------------|
| `entityId` | string   | Yes      | Entity                                 |
| `start`    | datetime | No       | Period start (defaults to month start) |
| `end`      | datetime | No       | Period end (defaults to now)           |

---

### `POST /api/billing/usage`

Record a usage event.

**Auth Required:** Yes

**Request Body:**

| Field        | Type   | Required | Description                               |
|--------------|--------|----------|-------------------------------------------|
| `entityId`   | string | Yes      | Entity                                    |
| `metricType` | enum   | Yes      | `TOKENS`, `VOICE_MINUTES`, `STORAGE_MB`, `WORKFLOW_RUNS`, `API_CALLS` |
| `amount`     | number | Yes      | Positive number                           |
| `source`     | string | Yes      | Source system identifier                  |

---

### `GET /api/billing/budget`

Get billing budget for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/billing/budget`

Set a billing budget.

**Auth Required:** Yes

**Request Body:**

| Field              | Type     | Required | Description                           |
|--------------------|----------|----------|---------------------------------------|
| `entityId`         | string   | Yes      | Entity                                |
| `monthlyCapUsd`    | number   | Yes      | Monthly spending cap in USD           |
| `alertThresholds`  | number[] | No       | Alert at these % (e.g., `[0.5, 0.8]`)|
| `overageBehavior`  | enum     | No       | `BLOCK`, `WARN`, `ALLOW_WITH_APPROVAL`|

---

### `POST /api/billing/budget/check`

Check if an operation is within budget.

**Auth Required:** Yes

**Request Body:** `{ "entityId": "...", "additionalCost": 0.50 }`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "allowed": true,
    "currentSpend": 45.20,
    "cap": 100.00,
    "remainingBudget": 54.80
  }
}
```

---

### `GET /api/billing/cost-attribution`

Get top costly workflows for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `limit` (optional, default 10)

---

### `POST /api/billing/model-route`

Select the optimal AI model based on input complexity and budget.

**Auth Required:** Yes

**Request Body:**

| Field       | Type   | Required | Description              |
|-------------|--------|----------|--------------------------|
| `inputText` | string | Yes      | The text to process      |
| `taskType`  | string | No       | Type of task             |

---

## Capture

Quick capture from multiple sources with batch processing and routing rules.

### `GET /api/capture`

List captured items.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:** `userId` (required), `source`, `status`, `entityId`, `page`, `pageSize`

---

### `POST /api/capture`

Create a capture item.

**Auth Required:** Yes

**Request Body:**

| Field         | Type   | Required | Description                          |
|---------------|--------|----------|--------------------------------------|
| `userId`      | string | Yes      | User                                 |
| `source`      | enum   | Yes      | `VOICE`, `SCREENSHOT`, `CLIPBOARD`, `SHARE_SHEET`, `BROWSER_EXTENSION`, `EMAIL_FORWARD`, `SMS_BRIDGE`, `DESKTOP_TRAY`, `CAMERA_SCAN`, `MANUAL` |
| `contentType` | enum   | Yes      | `TEXT`, `IMAGE`, `AUDIO`, `URL`, `DOCUMENT`, `BUSINESS_CARD`, `RECEIPT`, `WHITEBOARD`, `SCREENSHOT` |
| `rawContent`  | string | Yes      | Raw captured content                 |
| `entityId`    | string | No       | Target entity                        |
| `metadata`    | object | No       | `{ sourceApp?, sourceUrl?, deviceInfo?, geolocation? }` |

---

### `GET /api/capture/:id`

Get capture item details.

**Auth Required:** Yes

---

### `PATCH /api/capture/:id`

Update a capture item.

**Auth Required:** Yes

---

### `DELETE /api/capture/:id`

Delete a capture item.

**Auth Required:** Yes

---

### `POST /api/capture/batch`

Batch create capture items.

**Auth Required:** Yes

---

### `PUT /api/capture/batch`

Batch update capture items.

**Auth Required:** Yes

---

### `GET /api/capture/metrics`

Get capture metrics.

**Auth Required:** Yes

---

### `POST /api/capture/process`

Process a capture item (route, classify, create tasks/contacts).

**Auth Required:** Yes

---

### `GET /api/capture/rules`

List capture routing rules.

**Auth Required:** Yes

---

### `POST /api/capture/rules`

Create a routing rule.

**Auth Required:** Yes

---

### `PUT /api/capture/rules`

Update a routing rule.

**Auth Required:** Yes

---

### `DELETE /api/capture/rules`

Delete a routing rule.

**Auth Required:** Yes

---

## Crisis

Crisis detection, management, war rooms, and dead man's switch.

### `GET /api/crisis`

List active crises for the current user.

**Auth Required:** Yes

---

### `POST /api/crisis`

Create a crisis event.

**Auth Required:** Yes

**Request Body:**

| Field         | Type   | Required | Description                          |
|---------------|--------|----------|--------------------------------------|
| `entityId`    | string | Yes      | Entity                               |
| `type`        | enum   | Yes      | `LEGAL_THREAT`, `PR_ISSUE`, `HEALTH_EMERGENCY`, `FINANCIAL_ANOMALY`, `DATA_BREACH`, `CLIENT_COMPLAINT`, `REGULATORY_INQUIRY`, `NATURAL_DISASTER` |
| `severity`    | enum   | Yes      | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`  |
| `title`       | string | Yes      | Crisis title                         |
| `description` | string | Yes      | Description                          |

---

### `GET /api/crisis/:id`

Get crisis details.

**Auth Required:** Yes

---

### `POST /api/crisis/:id/acknowledge`

Acknowledge a crisis event.

**Auth Required:** Yes

---

### `POST /api/crisis/:id/war-room`

Activate or deactivate a war room for a crisis.

**Auth Required:** Yes

**Request Body:**

| Field    | Type | Required | Description                   |
|----------|------|----------|-------------------------------|
| `action` | enum | Yes      | `activate` or `deactivate`    |

---

### `POST /api/crisis/detect`

Analyze signals for potential crisis detection.

**Auth Required:** Yes

**Request Body:**

```json
{
  "signals": [
    {
      "source": "email",
      "signalType": "legal_threat",
      "confidence": 0.85,
      "rawData": { ... },
      "timestamp": "2026-02-20T10:00:00.000Z"
    }
  ]
}
```

---

### `GET /api/crisis/dead-man-switch`

Get dead man's switch status.

**Auth Required:** Yes

---

### `POST /api/crisis/dead-man-switch`

Configure the dead man's switch.

**Auth Required:** Yes

**Request Body:**

| Field                   | Type    | Required | Description                     |
|-------------------------|---------|----------|---------------------------------|
| `isEnabled`             | boolean | Yes      | Enable/disable                  |
| `checkInIntervalHours`  | number  | Yes      | Hours between required check-ins|
| `triggerAfterMisses`    | number  | Yes      | Missed check-ins before trigger |
| `protocols`             | array   | Yes      | Escalation protocols            |

**Protocol object:** `{ order, action, contactId?, contactName, message, delayHoursAfterTrigger }`

---

### `POST /api/crisis/dead-man-switch/check-in`

Check in with the dead man's switch (reset the timer).

**Auth Required:** Yes

---

## Delegation

Task delegation with context packs, approval workflows, and scoring.

### `GET /api/delegation`

List delegations.

**Auth Required:** Yes

**Query Parameters:**

| Parameter   | Type | Required | Values                           |
|-------------|------|----------|----------------------------------|
| `direction` | enum | Yes      | `delegated_by` or `delegated_to` |

---

### `POST /api/delegation`

Delegate a task to someone.

**Auth Required:** Yes

**Request Body:**

| Field         | Type   | Required | Description                       |
|---------------|--------|----------|-----------------------------------|
| `taskId`      | string | Yes      | Task to delegate                  |
| `delegatedTo` | string | Yes      | Recipient user/contact ID         |
| `contextPack` | object | No       | Pre-built context (auto-generated if omitted) |

**Context pack:** `{ summary, relevantDocuments[], relevantMessages[], relevantContacts[], deadlines[], notes, permissions[] }`

---

### `POST /api/delegation/:id/approve`

Approve a delegation request.

**Auth Required:** Yes

---

### `GET /api/delegation/inbox`

Get delegation inbox (tasks delegated to you).

**Auth Required:** Yes

---

### `GET /api/delegation/scores`

Get delegation scoring metrics.

**Auth Required:** Yes

---

## Developer

Plugin system and webhook management for integrations.

### `GET /api/developer/plugins`

List registered plugins.

**Auth Required:** Yes

**Query Parameters:** `status` (optional)

---

### `POST /api/developer/plugins`

Register a new plugin or perform a plugin action (submit/approve/revoke).

**Auth Required:** Yes

**Register plugin:**

| Field          | Type     | Required | Description              |
|----------------|----------|----------|--------------------------|
| `name`         | string   | Yes      | Plugin name              |
| `description`  | string   | Yes      | Description              |
| `version`      | string   | Yes      | Semver version           |
| `author`       | string   | Yes      | Author name              |
| `permissions`  | string[] | Yes      | Required permissions     |
| `entryPoint`   | string   | Yes      | Entry point module       |
| `configSchema` | object   | No       | Configuration schema     |

**Plugin action:**

```json
{ "pluginId": "...", "action": "submit"|"approve"|"revoke", "reason": "..." }
```

---

### `GET /api/developer/webhooks`

List webhooks or get webhook event history.

**Auth Required:** Yes

**Query Parameters:** `entityId` (for listing), or `webhookId` + `limit` (for event history)

---

### `POST /api/developer/webhooks`

Create, trigger, or delete a webhook.

**Auth Required:** Yes

**Create webhook:**

| Field       | Type     | Required | Description              |
|-------------|----------|----------|--------------------------|
| `entityId`  | string   | Yes      | Entity                   |
| `direction` | enum     | Yes      | `INBOUND` or `OUTBOUND`  |
| `url`       | string   | Yes      | Webhook URL              |
| `events`    | string[] | Yes      | Events to subscribe to   |

**Trigger webhook:** `{ "action": "trigger", "webhookId": "...", "event": "...", "payload": {...} }`

**Delete webhook:** `{ "action": "delete", "webhookId": "..." }`

---

## Execution

Action queue with blast radius assessment, runbooks, gates, simulation, rollback, and operator timeline.

### `GET /api/execution/queue`

List queued actions with filters.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter     | Type   | Description                                         |
|---------------|--------|-----------------------------------------------------|
| `status`      | enum   | `QUEUED`, `APPROVED`, `EXECUTING`, `EXECUTED`, `REJECTED`, `ROLLED_BACK`, `FAILED` |
| `actor`       | enum   | `AI`, `HUMAN`, `SYSTEM`                              |
| `blastRadius` | enum   | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`                  |
| `entityId`    | string | Filter by entity                                    |

---

### `POST /api/execution/queue`

Enqueue an action for execution.

**Auth Required:** Yes

**Request Body:**

| Field              | Type    | Required | Description                          |
|--------------------|---------|----------|--------------------------------------|
| `actionType`       | string  | Yes      | Type of action                       |
| `target`           | string  | Yes      | Target resource                      |
| `description`      | string  | Yes      | Human-readable description           |
| `reason`           | string  | Yes      | Why this action is needed            |
| `impact`           | string  | Yes      | Expected impact                      |
| `rollbackPlan`     | string  | Yes      | How to reverse the action            |
| `blastRadius`      | enum    | Yes      | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`  |
| `reversible`       | boolean | Yes      | Whether the action can be rolled back|
| `entityId`         | string  | Yes      | Entity                               |
| `actor`            | enum    | Yes      | `AI`, `HUMAN`, `SYSTEM`              |
| `actorId`          | string  | No       | Actor identifier                     |
| `estimatedCost`    | number  | No       | Estimated cost in USD                |
| `projectId`        | string  | No       | Related project                      |
| `scheduledFor`     | date    | No       | Schedule for future execution        |

---

### `GET /api/execution/queue/:id`

Get queued action status.

**Auth Required:** Yes

---

### `PATCH /api/execution/queue/:id`

Update an action in the queue (approve, reject, etc.).

**Auth Required:** Yes

---

### `DELETE /api/execution/queue/:id`

Cancel a queued action.

**Auth Required:** Yes

---

### `POST /api/execution/queue/bulk`

Bulk enqueue actions.

**Auth Required:** Yes

---

### `POST /api/execution/simulate`

Simulate an action without executing it.

**Auth Required:** Yes

**Request Body:**

| Field        | Type   | Required | Description          |
|--------------|--------|----------|----------------------|
| `actionType` | string | Yes      | Action type          |
| `target`     | string | Yes      | Target resource      |
| `parameters` | object | Yes      | Action parameters    |
| `entityId`   | string | Yes      | Entity               |

---

### `GET /api/execution/gates`

List execution gates (safety checks that must pass before actions execute).

**Auth Required:** Yes

**Query Parameters:** `scope` (`GLOBAL`, `ENTITY`, `RUNBOOK`), `entityId`

---

### `POST /api/execution/gates`

Create an execution gate.

**Auth Required:** Yes

**Request Body:**

| Field        | Type    | Required | Description                     |
|--------------|---------|----------|---------------------------------|
| `name`       | string  | Yes      | Gate name                       |
| `expression` | string  | Yes      | Gate expression/condition       |
| `description`| string  | Yes      | Description                     |
| `scope`      | enum    | Yes      | `GLOBAL`, `ENTITY`, `RUNBOOK`   |
| `entityId`   | string  | No       | Entity (for ENTITY scope)       |
| `isActive`   | boolean | Yes      | Active status                   |

---

### `PUT /api/execution/gates`

Update an execution gate.

**Auth Required:** Yes

**Request Body:** `{ "id": "...", ...updates }`

---

### `DELETE /api/execution/gates`

Delete an execution gate.

**Auth Required:** Yes

**Request Body:** `{ "id": "..." }`

---

### `GET /api/execution/runbooks`

List runbooks.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required), `isActive` (`true`/`false`), `tag`

---

### `POST /api/execution/runbooks`

Create a runbook.

**Auth Required:** Yes

**Request Body:**

| Field        | Type     | Required | Description                     |
|--------------|----------|----------|---------------------------------|
| `name`       | string   | Yes      | Runbook name                    |
| `description`| string   | Yes      | Description                     |
| `entityId`   | string   | Yes      | Entity                          |
| `steps`      | array    | Yes      | Ordered steps (min 1)           |
| `tags`       | string[] | Yes      | Tags                            |
| `isActive`   | boolean  | Yes      | Active status                   |
| `createdBy`  | string   | Yes      | Creator identifier              |
| `schedule`   | string   | No       | Cron schedule                   |

**Step object:** `{ order, name, description, actionType, parameters, requiresApproval, maxBlastRadius, continueOnFailure, timeout? }`

---

### `GET /api/execution/runbooks/:id`

Get runbook details.

**Auth Required:** Yes

---

### `PUT /api/execution/runbooks/:id`

Update a runbook.

**Auth Required:** Yes

---

### `DELETE /api/execution/runbooks/:id`

Delete a runbook.

**Auth Required:** Yes

---

### `POST /api/execution/runbooks/:id/execute`

Execute a runbook.

**Auth Required:** Yes

---

### `GET /api/execution/runbooks/:id/executions`

List execution history for a runbook.

**Auth Required:** Yes

---

### `GET /api/execution/rollback/:id`

Get rollback details for an action.

**Auth Required:** Yes

---

### `POST /api/execution/rollback/:id`

Execute rollback for an action.

**Auth Required:** Yes

---

### `GET /api/execution/timeline`

Get execution timeline (paginated audit log of all actions).

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter     | Type     | Description                         |
|---------------|----------|-------------------------------------|
| `actor`       | enum     | `AI`, `HUMAN`, `SYSTEM`             |
| `entityId`    | string   | Filter by entity                    |
| `from`        | datetime | Start date                          |
| `to`          | datetime | End date                            |
| `blastRadius` | enum     | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `search`      | string   | Full-text search                    |
| `pageSize`    | number   | Max 200 (default 50)                |

---

### `GET /api/execution/timeline/summary`

Get execution timeline summary.

**Auth Required:** Yes

---

### `GET /api/execution/costs`

Get cost estimates for actions.

**Auth Required:** Yes

---

## Health (System)

System health check endpoint. No authentication required.

### `GET /api/health`

Returns system health status including database connectivity.

**Auth Required:** No

**Response (200):**

```json
{
  "status": "ok",
  "timestamp": "2026-02-20T12:00:00.000Z",
  "version": "0.1.0",
  "uptime": 86400.5,
  "checks": {
    "database": {
      "status": "ok",
      "latencyMs": 2
    }
  }
}
```

Returns `503` if the system is degraded.

---

## Health (Personal Wellness)

Personal wellness tracking: energy, sleep, stress, medical records, and wearables.

### `GET /api/health/energy`

Get energy forecast for a date.

**Auth Required:** Yes

**Query Parameters:** `date` (optional, defaults to today)

---

### `GET /api/health/sleep`

Get sleep history.

**Auth Required:** Yes

**Query Parameters:** `days` (optional, default 7)

---

### `GET /api/health/stress`

Get stress history.

**Auth Required:** Yes

**Query Parameters:** `days` (optional, default 7)

---

### `POST /api/health/stress`

Record a stress level measurement.

**Auth Required:** Yes

**Request Body:**

| Field      | Type     | Required | Description         |
|------------|----------|----------|---------------------|
| `level`    | number   | Yes      | 0-100               |
| `source`   | string   | Yes      | Source of stress     |
| `triggers` | string[] | No       | Trigger descriptions |

---

### `GET /api/health/medical`

List medical records.

**Auth Required:** Yes

**Query Parameters:** `type` (optional)

---

### `POST /api/health/medical`

Add a medical record.

**Auth Required:** Yes

**Request Body:**

| Field      | Type     | Required | Description                          |
|------------|----------|----------|--------------------------------------|
| `type`     | enum     | Yes      | `APPOINTMENT`, `MEDICATION`, `PRESCRIPTION`, `LAB_RESULT`, `IMMUNIZATION` |
| `title`    | string   | Yes      | Record title                         |
| `provider` | string   | No       | Healthcare provider                  |
| `date`     | date     | Yes      | Record date                          |
| `nextDate` | date     | No       | Next appointment/refill date         |
| `notes`    | string   | No       | Notes                                |
| `reminders`| array    | No       | `[{ daysBefore, sent }]`            |

---

### `GET /api/health/wearables`

Get connected wearable devices.

**Auth Required:** Yes

---

### `POST /api/health/wearables`

Connect a wearable device.

**Auth Required:** Yes

**Request Body:**

| Field      | Type | Required | Description                                        |
|------------|------|----------|----------------------------------------------------|
| `provider` | enum | Yes      | `APPLE_WATCH`, `FITBIT`, `OURA`, `WHOOP`, `GARMIN` |

---

## Household

Household management: maintenance schedules, shopping lists, and vehicle tracking.

### `GET /api/household/maintenance`

List upcoming maintenance tasks (next 365 days).

**Auth Required:** Yes

---

### `POST /api/household/maintenance`

Create a maintenance task.

**Auth Required:** Yes

**Request Body:**

| Field                | Type   | Required | Description                          |
|----------------------|--------|----------|--------------------------------------|
| `category`           | enum   | Yes      | `HVAC`, `PLUMBING`, `ELECTRICAL`, `LAWN`, `APPLIANCE`, `ROOF`, `PEST`, `GENERAL` |
| `title`              | string | Yes      | Task title                           |
| `description`        | string | No       | Description                          |
| `frequency`          | enum   | Yes      | `MONTHLY`, `QUARTERLY`, `BIANNUAL`, `ANNUAL`, `ONE_TIME` |
| `season`             | enum   | No       | `SPRING`, `SUMMER`, `FALL`, `WINTER`, `ANY` |
| `nextDueDate`        | date   | Yes      | Next due date                        |
| `assignedProviderId` | string | No       | Service provider                     |
| `estimatedCostUsd`   | number | No       | Estimated cost                       |

---

### `GET /api/household/shopping`

Get the shopping list.

**Auth Required:** Yes

---

### `POST /api/household/shopping`

Add an item to the shopping list.

**Auth Required:** Yes

**Request Body:**

| Field               | Type    | Required | Description          |
|---------------------|---------|----------|----------------------|
| `name`              | string  | Yes      | Item name            |
| `category`          | string  | Yes      | Category             |
| `quantity`          | number  | Yes      | Quantity (min 1)     |
| `unit`              | string  | No       | Unit of measurement  |
| `store`             | string  | No       | Preferred store      |
| `estimatedPrice`    | number  | No       | Estimated price      |
| `isRecurring`       | boolean | No       | Default `false`      |
| `recurringFrequency`| string  | No       | Frequency string     |

---

### `GET /api/household/vehicles`

List vehicles.

**Auth Required:** Yes

---

### `POST /api/household/vehicles`

Add a vehicle.

**Auth Required:** Yes

**Request Body:**

| Field                | Type   | Required | Description              |
|----------------------|--------|----------|--------------------------|
| `make`               | string | Yes      | Vehicle make             |
| `model`              | string | Yes      | Vehicle model            |
| `year`               | number | Yes      | Model year               |
| `vin`                | string | No       | Vehicle Identification Number |
| `mileage`            | number | Yes      | Current mileage          |
| `nextServiceDate`    | date   | No       | Next service date        |
| `nextServiceType`    | string | No       | Type of service          |
| `insuranceExpiry`    | date   | No       | Insurance expiration     |
| `registrationExpiry` | date   | No       | Registration expiration  |

---

## Memory

Episodic memory system with decay, reinforcement, and search.

### `GET /api/memory`

List memory entries.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter  | Type   | Description                          |
|------------|--------|--------------------------------------|
| `type`     | enum   | `SHORT_TERM`, `WORKING`, `LONG_TERM`, `EPISODIC` |
| `page`     | number | Page number                          |
| `pageSize` | number | Items per page                       |

When `type` is specified, returns the top entries by strength for that type.

---

### `POST /api/memory`

Create a memory entry.

**Auth Required:** Yes

**Request Body:**

| Field     | Type   | Required | Description                          |
|-----------|--------|----------|--------------------------------------|
| `type`    | enum   | Yes      | `SHORT_TERM`, `WORKING`, `LONG_TERM`, `EPISODIC` |
| `content` | string | Yes      | Memory content                       |
| `context` | string | Yes      | Context of the memory                |

---

### `GET /api/memory/:id`

Get a memory entry (also reinforces the memory, increasing strength).

**Auth Required:** Yes

---

### `PUT /api/memory/:id`

Update a memory entry.

**Auth Required:** Yes

**Request Body (all optional):**

| Field     | Type   | Description            |
|-----------|--------|------------------------|
| `content` | string | Updated content        |
| `context` | string | Updated context        |
| `type`    | enum   | Change memory type     |

---

### `DELETE /api/memory/:id`

Delete a memory entry.

**Auth Required:** Yes

---

### `POST /api/memory/search`

Search memory entries semantically.

**Auth Required:** Yes

**Request Body:**

| Field         | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `query`       | string   | Yes      | Search query                   |
| `types`       | enum[]   | No       | Filter by memory types         |
| `minStrength` | number   | No       | Min strength 0-1               |
| `limit`       | number   | No       | Max results (1-100)            |

---

### `POST /api/memory/decay`

Apply memory decay (reduce strength over time based on half-life curves).

**Auth Required:** Yes

**Request Body (optional config):**

```json
{
  "config": {
    "shortTermHalfLifeHours": 4,
    "workingHalfLifeDays": 7,
    "longTermHalfLifeDays": 90,
    "episodicHalfLifeDays": 365,
    "reinforcementBoost": 0.3,
    "minimumStrength": 0.01
  }
}
```

---

### `GET /api/memory/stats`

Get memory statistics (counts by type, average strength, etc.).

**Auth Required:** Yes

---

## Rules

Rule engine for automated behavior with conflict detection, evaluation, and AI suggestions.

### `GET /api/rules`

List rules with filters.

**Auth Required:** Yes | **Paginated:** Yes

**Query Parameters:**

| Parameter  | Type    | Description                                  |
|------------|---------|----------------------------------------------|
| `scope`    | enum    | `GLOBAL`, `ENTITY`, `PROJECT`, `CONTACT`, `CHANNEL` |
| `entityId` | string  | Filter by entity                             |
| `isActive` | boolean | Filter by active status                      |

---

### `POST /api/rules`

Create a rule.

**Auth Required:** Yes

**Request Body:**

| Field        | Type    | Required | Description                                  |
|--------------|---------|----------|----------------------------------------------|
| `name`       | string  | Yes      | Rule name                                    |
| `scope`      | enum    | Yes      | `GLOBAL`, `ENTITY`, `PROJECT`, `CONTACT`, `CHANNEL` |
| `entityId`   | string  | No       | Entity (for non-GLOBAL scope)                |
| `condition`  | object  | Yes      | Condition expression (JSON)                  |
| `action`     | object  | Yes      | Action to take when matched (JSON)           |
| `precedence` | number  | No       | Priority (higher = more important, default 0)|
| `createdBy`  | enum    | No       | `AI`, `HUMAN`, `SYSTEM` (default `HUMAN`)    |
| `isActive`   | boolean | No       | Default `true`                               |

**Example:**

```bash
curl -X POST -b cookies.txt http://localhost:3000/api/rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Auto-archive low priority after 30 days",
    "scope": "ENTITY",
    "entityId": "ent_123",
    "condition": { "type": "inbox", "priority": "P2", "age_days_gt": 30 },
    "action": { "type": "archive" },
    "precedence": 5
  }'
```

---

### `GET /api/rules/:id`

Get rule details.

**Auth Required:** Yes

---

### `PUT /api/rules/:id`

Update a rule. All fields optional.

**Auth Required:** Yes

---

### `DELETE /api/rules/:id`

Delete a rule.

**Auth Required:** Yes

---

### `GET /api/rules/:id/audit`

Get audit trail for a rule (action logs where the rule was applied).

**Auth Required:** Yes

**Response (200):**

```json
{
  "success": true,
  "data": {
    "ruleId": "rule_123",
    "ruleName": "Auto-archive low priority",
    "auditEntries": [
      {
        "actionId": "act_456",
        "timestamp": "...",
        "actor": "AI",
        "actionType": "archive",
        "status": "EXECUTED",
        "consentReceipt": null
      }
    ],
    "totalEntries": 15
  }
}
```

---

### `POST /api/rules/conflicts`

Detect conflicts between rules.

**Auth Required:** Yes

**Request Body:**

| Field      | Type   | Required | Description                    |
|------------|--------|----------|--------------------------------|
| `context`  | object | Yes      | Context to evaluate against    |
| `entityId` | string | No       | Scope to entity                |

---

### `POST /api/rules/evaluate`

Evaluate rules against a context and get the winning action.

**Auth Required:** Yes

**Request Body:**

| Field      | Type   | Required | Description                    |
|------------|--------|----------|--------------------------------|
| `context`  | object | Yes      | Context to evaluate against    |
| `entityId` | string | No       | Scope to entity                |

**Response (200):**

```json
{
  "success": true,
  "data": {
    "evaluatedRules": [ ... ],
    "winningRule": { ... },
    "matchedCount": 3,
    "totalEvaluated": 12
  }
}
```

---

### `GET /api/rules/suggestions`

Get AI-suggested rules based on user correction patterns.

**Auth Required:** Yes

**Query Parameters:** `lookbackDays` (optional)

---

## Safety

Trust and safety endpoints: email header analysis, fraud detection, injection scanning, reputation checks, and throttling. Most require `admin` role.

### `POST /api/safety/email-headers`

Analyze email headers for spoofing indicators.

**Auth Required:** Yes (admin)

**Request Body:** `{ "headers": { "From": "...", "Reply-To": "...", ... } }`

---

### `POST /api/safety/fraud-check`

Check an action for fraud patterns.

**Auth Required:** Yes (admin)

**Request Body:**

| Field     | Type   | Required | Description             |
|-----------|--------|----------|-------------------------|
| `action`  | object | Yes      | Action log entry        |
| `history` | array  | No       | Previous action history |

**Action fields:** `id`, `actor` (AI/HUMAN/SYSTEM), `actionType`, `target`, `reason`, `blastRadius`, `reversible`, `status`, `cost?`, `timestamp`

---

### `POST /api/safety/injection-check`

Scan text for prompt injection attempts.

**Auth Required:** Yes (admin)

**Request Body:** `{ "input": "text to scan..." }`

---

### `GET /api/safety/reputation`

Get domain/sender reputation dashboard.

**Auth Required:** Yes (admin)

**Query Parameters:** `entityId` (required)

---

### `GET /api/safety/throttle`

Check throttle status for a user/action combination.

**Auth Required:** Yes (admin)

**Query Parameters:** `userId` (required), `actionType` (required)

---

### `POST /api/safety/throttle`

Record an action and get updated throttle status.

**Auth Required:** Yes (admin)

**Request Body:** `{ "userId": "...", "actionType": "..." }`

---

## Travel

Travel itinerary management, preferences, and visa requirement checking.

### `GET /api/travel/itineraries`

List travel itineraries.

**Auth Required:** Yes

**Query Parameters:** `status` (optional)

---

### `POST /api/travel/itineraries`

Create a travel itinerary.

**Auth Required:** Yes

**Request Body:**

| Field  | Type   | Required | Description         |
|--------|--------|----------|---------------------|
| `name` | string | Yes      | Itinerary name      |
| `legs` | array  | Yes      | Travel legs         |

**Leg object:**

| Field                | Type   | Required | Description                          |
|----------------------|--------|----------|--------------------------------------|
| `order`              | number | Yes      | Leg order                            |
| `type`               | enum   | Yes      | `FLIGHT`, `HOTEL`, `CAR_RENTAL`, `TRAIN`, `TRANSFER`, `ACTIVITY` |
| `departureLocation`  | string | Yes      | Departure city/location              |
| `arrivalLocation`    | string | Yes      | Arrival city/location                |
| `departureTime`      | date   | Yes      | Departure datetime                   |
| `arrivalTime`        | date   | Yes      | Arrival datetime                     |
| `timezone`           | string | Yes      | Timezone                             |
| `confirmationNumber` | string | No       | Booking confirmation                 |
| `provider`           | string | No       | Airline/hotel/etc.                   |
| `costUsd`            | number | Yes      | Cost in USD                          |
| `status`             | enum   | Yes      | `BOOKED`, `PENDING`, `CANCELLED`, `COMPLETED` |
| `notes`              | string | No       | Notes                                |

---

### `GET /api/travel/itineraries/:id`

Get itinerary details.

**Auth Required:** Yes

---

### `GET /api/travel/preferences`

Get travel preferences.

**Auth Required:** Yes

---

### `PUT /api/travel/preferences`

Update travel preferences.

**Auth Required:** Yes

**Request Body (all optional):**

| Field               | Type     | Description                          |
|---------------------|----------|--------------------------------------|
| `airlines`          | array    | `[{ name, loyaltyNumber?, seatPreference, class }]` |
| `hotels`            | array    | `[{ chain, loyaltyNumber?, roomType }]` |
| `dietary`           | string[] | Dietary requirements                 |
| `budgetPerDayUsd`   | number   | Daily budget                         |
| `preferredAirports` | string[] | Airport codes                        |

---

### `GET /api/travel/visa`

Check visa requirements for a destination.

**Auth Required:** Yes

**Query Parameters:**

| Parameter     | Type   | Required | Description            |
|---------------|--------|----------|------------------------|
| `citizenship` | string | Yes      | Country of citizenship |
| `destination` | string | Yes      | Destination country    |

**Example:**

```bash
curl -b cookies.txt "http://localhost:3000/api/travel/visa?citizenship=US&destination=JP"
```

---

## Voice

AI voice agents with personas, scripts, campaigns, phone number management, and call handling.

### `GET /api/voice/persona`

List voice personas for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/voice/persona`

Create a voice persona.

**Auth Required:** Yes

**Request Body:**

| Field          | Type   | Required | Description                      |
|----------------|--------|----------|----------------------------------|
| `entityId`     | string | Yes      | Entity                           |
| `name`         | string | Yes      | Persona name                     |
| `description`  | string | Yes      | Description                      |
| `voiceConfig`  | object | Yes      | Voice settings                   |
| `personality`  | object | Yes      | Personality traits               |
| `status`       | enum   | No       | `ACTIVE`, `DRAFT`, `ARCHIVED`    |
| `consentChain` | array  | No       | Consent records                  |

**voiceConfig:** `{ provider, voiceId, speed (0.5-2.0), pitch (0.5-2.0), language, accent? }`

**personality:** `{ defaultTone, formality (0-10), empathy (0-10), assertiveness (0-10), humor (0-10), vocabulary: "SIMPLE"|"MODERATE"|"ADVANCED" }`

---

### `GET /api/voice/persona/:id`

Get persona details.

**Auth Required:** Yes

---

### `PUT /api/voice/persona/:id`

Update a persona.

**Auth Required:** Yes

---

### `POST /api/voice/persona/clone`

Clone an existing persona.

**Auth Required:** Yes

---

### `GET /api/voice/scripts`

List call scripts for an entity.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/voice/scripts`

Create a call script (conversation flow).

**Auth Required:** Yes

**Request Body:**

| Field         | Type     | Required | Description                    |
|---------------|----------|----------|--------------------------------|
| `entityId`    | string   | Yes      | Entity                         |
| `name`        | string   | Yes      | Script name                    |
| `description` | string   | Yes      | Description                    |
| `nodes`       | array    | Yes      | Conversation nodes             |
| `startNodeId` | string   | Yes      | Entry node ID                  |
| `status`      | enum     | No       | `DRAFT`, `ACTIVE`, `ARCHIVED`  |

**Node object:** `{ id, type: "SPEAK"|"LISTEN"|"BRANCH"|"TRANSFER"|"END"|"COLLECT_INFO", content, branches: [{ condition, targetNodeId, label }], escalationTrigger?, collectField?, nextNodeId? }`

---

### `GET /api/voice/scripts/:id`

Get script details.

**Auth Required:** Yes

---

### `PUT /api/voice/scripts/:id`

Update a script.

**Auth Required:** Yes

---

### `POST /api/voice/scripts/:id/validate`

Validate a call script (check for dead ends, unreachable nodes, etc.).

**Auth Required:** Yes

---

### `POST /api/voice/calls/outbound`

Initiate an outbound AI voice call.

**Auth Required:** Yes

**Request Body:**

| Field         | Type    | Required | Description                    |
|---------------|---------|----------|--------------------------------|
| `entityId`    | string  | Yes      | Entity                         |
| `contactId`   | string  | Yes      | Contact to call                |
| `personaId`   | string  | Yes      | Voice persona to use           |
| `scriptId`    | string  | No       | Call script to follow          |
| `purpose`     | string  | Yes      | Purpose of the call            |
| `maxDuration` | number  | No       | Max call duration in seconds   |
| `recordCall`  | boolean | No       | Record the call                |
| `guardrails`  | object  | Yes      | Safety guardrails              |

**Guardrails:** `{ maxCommitments, forbiddenTopics[], escalationTriggers[], complianceProfile[], maxSilenceSeconds }`

---

### `GET /api/voice/calls/:id`

Get call details.

**Auth Required:** Yes

---

### `GET /api/voice/calls/:id/summary`

Get AI-generated call summary.

**Auth Required:** Yes

---

### `GET /api/voice/calls/:id/transcript`

Get call transcript.

**Auth Required:** Yes

---

### `GET /api/voice/calls/inbound/config`

Get inbound call configuration.

**Auth Required:** Yes

---

### `POST /api/voice/calls/inbound/config`

Update inbound call configuration.

**Auth Required:** Yes

---

### `GET /api/voice/campaigns`

List voice campaigns.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/voice/campaigns`

Create a voice campaign.

**Auth Required:** Yes

**Request Body:**

| Field              | Type     | Required | Description                    |
|--------------------|----------|----------|--------------------------------|
| `entityId`         | string   | Yes      | Entity                         |
| `name`             | string   | Yes      | Campaign name                  |
| `description`      | string   | Yes      | Description                    |
| `personaId`        | string   | Yes      | Persona to use                 |
| `scriptId`         | string   | Yes      | Script to use                  |
| `targetContactIds` | string[] | Yes      | Contacts to call               |
| `schedule`         | object   | Yes      | Scheduling config              |
| `stopConditions`   | array    | Yes      | When to stop the campaign      |
| `status`           | enum     | No       | `DRAFT`, `ACTIVE`, `PAUSED`, `COMPLETED`, `STOPPED` |

**Schedule:** `{ startDate, endDate?, callWindowStart, callWindowEnd, timezone, maxCallsPerDay, retryAttempts, retryDelayHours }`

**Stop condition:** `{ type: "MAX_CALLS"|"MAX_CONNECTS"|"DATE"|"CONVERSION_TARGET"|"NEGATIVE_SENTIMENT", threshold }`

---

### `GET /api/voice/campaigns/:id`

Get campaign details.

**Auth Required:** Yes

---

### `PUT /api/voice/campaigns/:id`

Update a campaign.

**Auth Required:** Yes

---

### `GET /api/voice/numbers`

List provisioned phone numbers.

**Auth Required:** Yes

**Query Parameters:** `entityId` (required)

---

### `POST /api/voice/numbers/provision`

Provision a new phone number.

**Auth Required:** Yes

---

### `DELETE /api/voice/numbers/:id`

Release a phone number.

**Auth Required:** Yes
