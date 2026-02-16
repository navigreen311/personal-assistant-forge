# API Reference

## Authentication

All API routes require authentication unless explicitly noted. Include the session
cookie (set by NextAuth after login) with every request.

- Unauthenticated requests receive a `401 Unauthorized` response.
- Requests to resources the user does not own receive a `403 Forbidden` response.
- Entity-scoped routes require an active entity in the session.

## Response Format

All responses follow the standardized `ApiResponse<T>` format.

### Success

```json
{
  "success": true,
  "data": { ... },
  "meta": { "timestamp": "2026-01-15T12:00:00.000Z" }
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
  "meta": { "timestamp": "2026-01-15T12:00:00.000Z" }
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
    "timestamp": "2026-01-15T12:00:00.000Z"
  }
}
```

---

## Auth

### `POST /api/auth/register`
Create a new user account with email and password.

**Auth Required:** No

### `GET /api/auth/[...nextauth]`
### `POST /api/auth/[...nextauth]`
NextAuth.js handler for login, logout, OAuth callbacks, and session management.

**Auth Required:** No

### `GET /api/auth/profile`
Get the current authenticated user's profile.

**Auth Required:** Yes

### `PATCH /api/auth/profile`
Update the current user's profile and preferences.

**Auth Required:** Yes

### `POST /api/auth/switch-entity`
Switch the active entity context for the current session.

**Auth Required:** Yes

---

## Admin

### `GET /api/admin/dlp`
Get Data Loss Prevention rules configuration.

### `POST /api/admin/dlp`
Create or update DLP rules.

### `POST /api/admin/dlp/check`
Check content against DLP rules for policy violations.

### `GET /api/admin/ediscovery`
Get e-discovery configuration and search results.

### `POST /api/admin/ediscovery`
Run an e-discovery search or update configuration.

### `GET /api/admin/policies`
Get organizational policies.

### `POST /api/admin/policies`
Create or update organizational policies.

### `GET /api/admin/sso`
Get Single Sign-On configuration.

### `POST /api/admin/sso`
Configure SSO settings.

**Auth Required:** Yes (admin role)

---

## Analytics

### `GET /api/analytics/ai-accuracy`
Get AI accuracy metrics and scoring.

### `GET /api/analytics/bias`
Get bias detection analytics.

### `GET /api/analytics/call-analytics`
Get call center metrics and analytics.

### `GET /api/analytics/goals`
List tracked goals.

### `POST /api/analytics/goals`
Create a new goal.

### `GET /api/analytics/goals/[id]`
Get goal details.

### `PUT /api/analytics/goals/[id]`
Update a goal.

### `GET /api/analytics/habits`
List tracked habits.

### `POST /api/analytics/habits`
Create a new habit to track.

### `POST /api/analytics/habits/[id]/complete`
Mark a habit as completed for today.

### `GET /api/analytics/llm-costs`
Get LLM usage and cost metrics.

### `POST /api/analytics/overrides`
Record an AI override event.

### `GET /api/analytics/overrides/analysis`
Get analysis of AI override patterns.

### `GET /api/analytics/productivity`
Get productivity scoring and metrics.

### `GET /api/analytics/scorecard`
Get executive scorecard metrics.

### `GET /api/analytics/time-audit`
Get time audit analysis.

**Auth Required:** Yes

---

## Attention

### `GET /api/attention`
Get current attention budget state.

### `POST /api/attention`
Update attention settings.

### `GET /api/attention/budget`
Get attention budget allocation.

### `POST /api/attention/budget`
Update attention budget allocation.

### `GET /api/attention/dnd`
Get Do Not Disturb settings.

### `POST /api/attention/dnd`
Update Do Not Disturb settings.

**Auth Required:** Yes

---

## Billing

### `GET /api/billing/budget`
Get billing budget status.

### `POST /api/billing/budget`
Create or update billing budget.

### `POST /api/billing/budget/check`
Check if an operation is within budget.

### `GET /api/billing/cost-attribution`
Get cost attribution breakdown.

### `POST /api/billing/model-route`
Select optimal AI model based on task and budget.

### `GET /api/billing/usage`
Get usage metrics.

### `POST /api/billing/usage`
Record usage event.

**Auth Required:** Yes

---

## Calendar

### `GET /api/calendar`
List calendar events with optional date range filters.

### `POST /api/calendar`
Create a new calendar event.

### `GET /api/calendar/[eventId]`
Get event details.

### `PATCH /api/calendar/[eventId]`
Update an event.

### `DELETE /api/calendar/[eventId]`
Delete an event.

### `GET /api/calendar/analytics`
Get calendar analytics (meeting load, time distribution).

### `GET /api/calendar/availability`
Find available time slots.

### `POST /api/calendar/conflicts`
Detect scheduling conflicts.

### `POST /api/calendar/optimize`
Optimize schedule based on energy and priorities.

### `POST /api/calendar/parse`
Parse natural language into calendar event data.

### `POST /api/calendar/schedule`
Schedule a new meeting.

### `POST /api/calendar/schedule/natural`
Schedule a meeting using natural language input.

### `POST /api/calendar/[eventId]/post-meeting`
Record post-meeting notes and action items.

### `GET /api/calendar/[eventId]/prep-packet`
Get meeting preparation packet.

### `POST /api/calendar/[eventId]/prep-packet`
Generate a meeting preparation packet.

### `POST /api/calendar/[eventId]/reschedule`
Reschedule an event.

**Auth Required:** Yes

---

## Capture

### `GET /api/capture`
List captured items.

### `POST /api/capture`
Create a new capture item (quick capture).

### `GET /api/capture/[id]`
Get capture item details.

### `PATCH /api/capture/[id]`
Update a capture item.

### `DELETE /api/capture/[id]`
Delete a capture item.

### `POST /api/capture/batch`
Batch create capture items.

### `PUT /api/capture/batch`
Batch update capture items.

### `PATCH /api/capture/batch`
Batch partial update.

### `GET /api/capture/metrics`
Get capture metrics.

### `POST /api/capture/process`
Process a capture item (route, classify, create tasks).

### `GET /api/capture/rules`
List capture routing rules.

### `POST /api/capture/rules`
Create a routing rule.

### `PUT /api/capture/rules`
Update a routing rule.

### `DELETE /api/capture/rules`
Delete a routing rule.

**Auth Required:** Yes

---

## Contacts

### `GET /api/contacts`
List contacts with optional filters.

### `POST /api/contacts`
Create a new contact.

### `GET /api/contacts/[id]`
Get contact details.

### `PUT /api/contacts/[id]`
Update a contact.

### `DELETE /api/contacts/[id]`
Delete a contact.

### `GET /api/contacts/[id]/cadence`
Get contact communication cadence.

### `PUT /api/contacts/[id]/cadence`
Update contact cadence settings.

### `GET /api/contacts/[id]/commitments`
List commitments with a contact.

### `POST /api/contacts/[id]/commitments`
Create a new commitment.

### `GET /api/contacts/[id]/relationship-score`
Get contact relationship score.

**Auth Required:** Yes

---

## Crisis

### `GET /api/crisis`
List crisis events.

### `POST /api/crisis`
Create a crisis record.

### `GET /api/crisis/[id]`
Get crisis details.

### `POST /api/crisis/[id]/acknowledge`
Acknowledge a crisis.

### `POST /api/crisis/[id]/war-room`
Activate or manage war room for a crisis.

### `POST /api/crisis/detect`
Run crisis detection analysis.

### `GET /api/crisis/dead-man-switch`
Get dead man's switch configuration.

### `POST /api/crisis/dead-man-switch`
Configure dead man's switch.

### `POST /api/crisis/dead-man-switch/check-in`
Check in with the dead man's switch.

**Auth Required:** Yes

---

## Decisions

### `GET /api/decisions`
List decisions.

### `POST /api/decisions`
Create a new decision record.

### `GET /api/decisions/[id]`
Get decision details.

### `DELETE /api/decisions/[id]`
Delete a decision.

### `POST /api/decisions/[id]/matrix`
Generate or update a decision matrix.

### `POST /api/decisions/[id]/pre-mortem`
Run a pre-mortem analysis on a decision.

### `GET /api/decisions/journal`
List decision journal entries.

### `POST /api/decisions/journal`
Create a journal entry.

### `PUT /api/decisions/journal/[id]/review`
Review and update a journal entry.

### `POST /api/decisions/research`
Research a decision topic using AI.

**Auth Required:** Yes

---

## Delegation

### `GET /api/delegation`
List delegations.

### `POST /api/delegation`
Create a delegation.

### `POST /api/delegation/[id]/approve`
Approve a delegation request.

### `GET /api/delegation/inbox`
Get delegation inbox for the current user.

### `GET /api/delegation/scores`
Get delegation scoring metrics.

**Auth Required:** Yes

---

## Developer

### `GET /api/developer/plugins`
List installed plugins.

### `POST /api/developer/plugins`
Install or register a plugin.

### `GET /api/developer/webhooks`
List configured webhooks.

### `POST /api/developer/webhooks`
Create a webhook subscription.

**Auth Required:** Yes

---

## Documents

### `GET /api/documents/brand-kit`
Get brand kit configuration.

### `PUT /api/documents/brand-kit`
Update brand kit settings.

### `POST /api/documents/generate`
Generate a document from template.

### `GET /api/documents/templates`
List document templates.

### `POST /api/documents/templates`
Create a document template.

### `GET /api/documents/[id]/redline`
Get redline comparison for a document.

### `POST /api/documents/[id]/sign`
Initiate e-signature process.

### `GET /api/documents/[id]/versions`
List document version history.

**Auth Required:** Yes

---

## Entities

### `GET /api/entities`
List all entities for the current user.

### `POST /api/entities`
Create a new entity.

### `GET /api/entities/[entityId]`
Get entity details.

### `PATCH /api/entities/[entityId]`
Update an entity.

### `DELETE /api/entities/[entityId]`
Delete an entity.

### `GET /api/entities/[entityId]/compliance`
Get entity compliance status.

### `GET /api/entities/[entityId]/dashboard`
Get entity dashboard data.

### `GET /api/entities/[entityId]/health`
Get entity health metrics.

### `GET /api/entities/[entityId]/persona`
Get entity voice persona settings.

### `GET /api/entities/executive-view`
Get executive view across all entities.

### `GET /api/entities/shared-contacts`
Get contacts shared across entities.

**Auth Required:** Yes

---

## Execution

### `GET /api/execution/costs`
Get cost estimates for actions.

### `POST /api/execution/costs`
Calculate cost for a proposed action.

### `GET /api/execution/gates`
List execution gates.

### `POST /api/execution/gates`
Create an execution gate.

### `PUT /api/execution/gates`
Update an execution gate.

### `DELETE /api/execution/gates`
Delete an execution gate.

### `GET /api/execution/queue`
List queued actions.

### `POST /api/execution/queue`
Enqueue a new action.

### `GET /api/execution/queue/[id]`
Get action status.

### `PATCH /api/execution/queue/[id]`
Update action in queue.

### `DELETE /api/execution/queue/[id]`
Cancel a queued action.

### `POST /api/execution/queue/bulk`
Bulk enqueue actions.

### `GET /api/execution/rollback/[id]`
Get rollback details for an action.

### `POST /api/execution/rollback/[id]`
Execute rollback for an action.

### `GET /api/execution/runbooks`
List runbooks.

### `POST /api/execution/runbooks`
Create a runbook.

### `GET /api/execution/runbooks/[id]`
Get runbook details.

### `PUT /api/execution/runbooks/[id]`
Update a runbook.

### `DELETE /api/execution/runbooks/[id]`
Delete a runbook.

### `POST /api/execution/runbooks/[id]/execute`
Execute a runbook.

### `GET /api/execution/runbooks/[id]/executions`
List execution history for a runbook.

### `POST /api/execution/simulate`
Simulate an action execution.

### `GET /api/execution/timeline`
Get execution timeline.

### `GET /api/execution/timeline/summary`
Get execution timeline summary.

**Auth Required:** Yes

---

## Finance

### `GET /api/finance/budget`
List budgets.

### `POST /api/finance/budget`
Create a budget.

### `GET /api/finance/budget/[id]`
Get budget details.

### `GET /api/finance/dashboard`
Get financial dashboard data.

### `GET /api/finance/expenses`
List expenses.

### `POST /api/finance/expenses`
Create an expense.

### `GET /api/finance/expenses/categories`
List expense categories.

### `GET /api/finance/forecast`
Get financial forecast.

### `POST /api/finance/forecast/scenario`
Run a financial scenario analysis.

### `GET /api/finance/invoices`
List invoices.

### `POST /api/finance/invoices`
Create an invoice.

### `GET /api/finance/invoices/[id]`
Get invoice details.

### `PUT /api/finance/invoices/[id]`
Update an invoice.

### `GET /api/finance/invoices/aging`
Get invoice aging analysis.

### `GET /api/finance/pnl`
Get profit and loss statement.

### `GET /api/finance/renewals`
Get renewal tracking data.

**Auth Required:** Yes

---

## Health

### `GET /api/health/energy`
Get energy levels.

### `GET /api/health/medical`
Get medical records.

### `POST /api/health/medical`
Create a medical record.

### `GET /api/health/sleep`
Get sleep tracking data.

### `GET /api/health/stress`
Get stress monitoring data.

### `POST /api/health/stress`
Record stress measurement.

### `GET /api/health/wearables`
Get wearable device data.

### `POST /api/health/wearables`
Sync wearable device data.

**Auth Required:** Yes

---

## Household

### `GET /api/household/maintenance`
List maintenance items.

### `POST /api/household/maintenance`
Create a maintenance item.

### `GET /api/household/shopping`
Get shopping list.

### `POST /api/household/shopping`
Add items to shopping list.

### `GET /api/household/vehicles`
List vehicles.

### `POST /api/household/vehicles`
Add a vehicle.

**Auth Required:** Yes

---

## Inbox

### `GET /api/inbox`
List messages with optional filters.

### `GET /api/inbox/[messageId]`
Get message details.

### `PATCH /api/inbox/[messageId]`
Update message (mark read, archive, etc.).

### `DELETE /api/inbox/[messageId]`
Delete a message.

### `GET /api/inbox/canned-responses`
List canned response templates.

### `POST /api/inbox/canned-responses`
Create a canned response.

### `GET /api/inbox/canned-responses/[responseId]`
Get canned response details.

### `PATCH /api/inbox/canned-responses/[responseId]`
Update a canned response.

### `DELETE /api/inbox/canned-responses/[responseId]`
Delete a canned response.

### `POST /api/inbox/draft`
Create a message draft.

### `POST /api/inbox/draft/refine`
AI-refine a draft message.

### `GET /api/inbox/follow-up`
List follow-up items.

### `POST /api/inbox/follow-up`
Create a follow-up reminder.

### `PATCH /api/inbox/follow-up/[followUpId]`
Update a follow-up.

### `DELETE /api/inbox/follow-up/[followUpId]`
Delete a follow-up.

### `POST /api/inbox/send`
Send a message.

### `GET /api/inbox/stats`
Get inbox statistics.

### `POST /api/inbox/triage`
Triage a single message.

### `POST /api/inbox/triage/batch`
Batch triage multiple messages.

**Auth Required:** Yes

---

## Knowledge

### `GET /api/knowledge`
List knowledge entries.

### `POST /api/knowledge`
Create a knowledge entry.

### `GET /api/knowledge/[id]`
Get knowledge entry details.

### `PUT /api/knowledge/[id]`
Update a knowledge entry.

### `DELETE /api/knowledge/[id]`
Delete a knowledge entry.

### `GET /api/knowledge/[id]/links`
Get linked entries.

### `POST /api/knowledge/[id]/links`
Create a link between entries.

### `GET /api/knowledge/graph`
Get knowledge graph visualization data.

### `POST /api/knowledge/ingest`
Ingest a document into the knowledge base.

### `GET /api/knowledge/learning`
List learning items.

### `POST /api/knowledge/learning`
Create a learning item.

### `PUT /api/knowledge/learning/[id]`
Update a learning item.

### `GET /api/knowledge/learning/review`
Get items due for spaced repetition review.

### `GET /api/knowledge/search`
Full-text search across knowledge entries.

### `GET /api/knowledge/sops`
List Standard Operating Procedures.

### `POST /api/knowledge/sops`
Create a SOP.

### `GET /api/knowledge/sops/[id]`
Get SOP details.

### `PUT /api/knowledge/sops/[id]`
Update a SOP.

### `POST /api/knowledge/surface`
AI-suggest relevant knowledge for a context.

**Auth Required:** Yes

---

## Memory

### `GET /api/memory`
List memory entries.

### `POST /api/memory`
Create a memory entry.

### `GET /api/memory/[id]`
Get memory entry details.

### `PUT /api/memory/[id]`
Update a memory entry.

### `DELETE /api/memory/[id]`
Delete a memory entry.

### `POST /api/memory/decay`
Apply decay to memory entries (reduce strength over time).

### `POST /api/memory/search`
Search memory entries.

### `GET /api/memory/stats`
Get memory statistics.

**Auth Required:** Yes

---

## Rules

### `GET /api/rules`
List rules with optional filters.

### `POST /api/rules`
Create a new rule.

### `GET /api/rules/[id]`
Get rule details.

### `PUT /api/rules/[id]`
Update a rule.

### `DELETE /api/rules/[id]`
Delete a rule.

### `GET /api/rules/[id]/audit`
Get audit log for a rule.

### `POST /api/rules/conflicts`
Detect conflicts between rules.

### `POST /api/rules/evaluate`
Evaluate a rule against input data.

### `GET /api/rules/suggestions`
Get AI-suggested rules based on patterns.

**Auth Required:** Yes

---

## Safety

### `POST /api/safety/email-headers`
Parse and analyze email headers for spoofing indicators.

**Auth Required:** Yes

### `POST /api/safety/fraud-check`
Run fraud detection on a transaction or communication.

**Auth Required:** Yes

### `POST /api/safety/injection-check`
Detect prompt injection attempts in text.

**Auth Required:** Yes

### `GET /api/safety/reputation`
Check domain or sender reputation.

**Auth Required:** Yes

### `GET /api/safety/throttle`
Get current rate limiting status.

### `POST /api/safety/throttle`
Apply rate limiting check.

**Auth Required:** Yes

---

## Tasks

### `GET /api/tasks`
List tasks with optional filters (status, priority, assignee, entity).

### `POST /api/tasks`
Create a new task.

### `GET /api/tasks/[id]`
Get task details.

### `PUT /api/tasks/[id]`
Update a task.

### `DELETE /api/tasks/[id]`
Delete a task.

### `PATCH /api/tasks/bulk`
Bulk update tasks.

### `GET /api/tasks/dependencies`
Get task dependency graph.

### `GET /api/tasks/forecast`
Get task completion forecast.

### `POST /api/tasks/parse`
Parse natural language into task data.

### `GET /api/tasks/prioritize`
Get AI-recommended prioritization.

### `POST /api/tasks/prioritize`
Request AI prioritization of tasks.

### `GET /api/tasks/procrastination`
Get procrastination alerts.

### `GET /api/tasks/recurring`
List recurring tasks.

### `POST /api/tasks/recurring`
Create a recurring task.

### `PUT /api/tasks/recurring`
Update a recurring task.

### `DELETE /api/tasks/recurring`
Delete a recurring task.

**Auth Required:** Yes

---

## Travel

### `GET /api/travel/itineraries`
List travel itineraries.

### `POST /api/travel/itineraries`
Create an itinerary.

### `GET /api/travel/itineraries/[id]`
Get itinerary details.

### `GET /api/travel/preferences`
Get travel preferences.

### `PUT /api/travel/preferences`
Update travel preferences.

### `GET /api/travel/visa`
Get visa requirements for a destination.

**Auth Required:** Yes

---

## Voice

### `GET /api/voice/calls/[id]`
Get call details.

### `GET /api/voice/calls/[id]/summary`
Get call summary.

### `GET /api/voice/calls/[id]/transcript`
Get call transcript.

### `GET /api/voice/calls/inbound/config`
Get inbound call configuration.

### `POST /api/voice/calls/inbound/config`
Update inbound call configuration.

### `POST /api/voice/calls/outbound`
Initiate an outbound call.

### `GET /api/voice/campaigns`
List voice campaigns.

### `POST /api/voice/campaigns`
Create a voice campaign.

### `GET /api/voice/campaigns/[id]`
Get campaign details.

### `PUT /api/voice/campaigns/[id]`
Update a campaign.

### `GET /api/voice/numbers`
List provisioned phone numbers.

### `DELETE /api/voice/numbers/[id]`
Release a phone number.

### `POST /api/voice/numbers/provision`
Provision a new phone number.

### `GET /api/voice/persona`
List voice personas.

### `POST /api/voice/persona`
Create a voice persona.

### `GET /api/voice/persona/[id]`
Get persona details.

### `PUT /api/voice/persona/[id]`
Update a persona.

### `POST /api/voice/persona/clone`
Clone an existing persona.

### `GET /api/voice/scripts`
List call scripts.

### `POST /api/voice/scripts`
Create a call script.

### `GET /api/voice/scripts/[id]`
Get script details.

### `PUT /api/voice/scripts/[id]`
Update a script.

### `POST /api/voice/scripts/[id]/validate`
Validate a call script.

**Auth Required:** Yes

---

## Workflows

### `GET /api/workflows`
List workflows.

### `POST /api/workflows`
Create a new workflow.

### `GET /api/workflows/[id]`
Get workflow details.

### `PUT /api/workflows/[id]`
Update a workflow.

### `DELETE /api/workflows/[id]`
Delete a workflow.

### `POST /api/workflows/[id]/trigger`
Manually trigger a workflow.

### `POST /api/workflows/[id]/simulate`
Simulate a workflow execution.

### `GET /api/workflows/[id]/executions`
List workflow execution history.

### `GET /api/workflows/[id]/executions/[executionId]`
Get execution details.

### `DELETE /api/workflows/[id]/executions/[executionId]`
Delete an execution record.

### `POST /api/workflows/[id]/executions/[executionId]/rollback`
Rollback a workflow execution.

### `GET /api/workflows/approvals`
List pending approvals.

### `POST /api/workflows/approvals`
Submit an approval decision.

**Auth Required:** Yes
