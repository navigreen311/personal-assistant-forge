# P-02 Escalation — playbooks route schemas speak a vocabulary the table does not have

**Package:** P-02 — Shadow compliance repair + all remaining type errors
**Branch:** `feature/p-02-typecheck-repair`
**Status:** P-02 is complete (`tsc --noEmit` = 0). This is a follow-up that P-02
was not permitted to make, not a blocker.

## What I found

`src/modules/shadow/compliance/call-playbook.ts` was the one entry on the rename
map that is **not** a mechanical rename. `prisma.shadowCallPlaybook` →
`prisma.voiceforgeCallPlaybook` is correct, but the service also described a
different *entity* than the table it now addresses:

| service DTO (before)                | `VoiceforgeCallPlaybook` (actual)                        |
| ----------------------------------- | -------------------------------------------------------- |
| `description`, `type`               | `scenario`                                               |
| `steps: PlaybookStep[]`             | — (no column; not a step-flow model)                     |
| `isActive`, `tags`                  | — (no columns)                                           |
| `createdAt`, `updatedAt`            | — (no columns; `orderBy: { updatedAt }` could not resolve) |
| —                                   | `openingScript`, `dataAllowed`, `neverDisclose`, `escalationTriggers`, `escalationAction`, `maxDuration`, `outcomeFields` |

The table is a **call-guardrail** model (what the agent may say, what it must
never disclose, when to escalate). The service modelled a **step-by-step flow**.
Since the schema is frozen and the seed data (`prisma/seed.ts`, 3 rows) is in the
table's shape, I rewrote the service to serve the real table.

## What still needs doing — outside my file list

These two files still validate the old vocabulary:

- `src/app/api/shadow/playbooks/route.ts` — `CreatePlaybookSchema`
- `src/app/api/shadow/playbooks/[id]/route.ts` — `UpdatePlaybookSchema`

`z.object()` **strips unknown keys**, so a client sending the real fields
(`scenario`, `openingScript`, `dataAllowed`, `neverDisclose`,
`escalationTriggers`, `escalationAction`, `maxDuration`, `outcomeFields`) has
them silently discarded before the service sees them. The API can therefore
create and read playbooks, but cannot set any of the guardrail fields.

**These files do not type-error** (the service still takes
`Record<string, unknown>`), so they were never in P-02's scope and touching them
would have been a scope violation. No agent's package as written covers them.

## Mitigation already in place

`createPlaybook`/`updatePlaybook` accept `scenario` **or** the legacy
`description` as the scenario text, so the existing route keeps working rather
than failing on the required, defaultless `scenario` column.

## Suggested fix

Replace both zod schemas with the `VoiceforgeCallPlaybook` field set. There are
no frontend consumers of `/api/shadow/playbooks` (verified by grep), so this is
a contained change.

## Note on reachability

The `shadow/compliance` services were unreachable before this PR — every one of
them addressed a Prisma model that does not exist and threw on first call. They
now compile and will actually execute. See the PR body for the behaviour changes
this surfaced.
