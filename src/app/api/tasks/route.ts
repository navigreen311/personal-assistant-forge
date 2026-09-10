/**
 * Tasks collection routes -- the canonical shape for the P-00 tenancy pattern.
 *
 * A NOTE ON `_session`, because it is the thing to grep for and the thing to
 * misread. The anti-pattern the audit found is
 *
 *     withAuth(request, async (req, _session) => { ...body.entityId... })
 *
 * -- authenticate, throw the session away, then let the caller name the tenant.
 * What you see below is
 *
 *     withEntityScope(request, async (req, _session, entityId) => ...)
 *
 * which is the opposite: the session was consumed by the middleware to PROVE
 * ownership, and `entityId` is its verified result. The handler underscores the
 * session only because it has no further use for it -- TypeScript positional
 * parameters mean it cannot be skipped. If a handler needs the caller's id (for
 * an actor on an audit row, say), name it `session` and use it; see POST below.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { withAuditedRoleEntityScope } from '@/modules/security/audit-wiring';
import { createTask, listTasks } from '@/modules/tasks/services/task-crud';
import type { TaskStatus, Priority } from '@/shared/types';
import type { TaskQueryFilters, TaskSortOptions } from '@/modules/tasks/types';

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  // entityId stays in the schema because clients still send it and rejecting it
  // would be a breaking change -- but the value below comes from
  // withEntityScope, never from here. See the note in POST.
  entityId: z.string().min(1).optional(),
  description: z.string().optional(),
  projectId: z.string().optional(),
  priority: z.enum(['P0', 'P1', 'P2']).optional(),
  dueDate: z.string().datetime().optional(),
  dependencies: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdFrom: z.object({ type: z.string(), sourceId: z.string() }).optional(),
});

/**
 * P-27 (T-037) — WHICH TASK ROUTES WRITE AN AUDIT ROW, AND WHY NOT ALL OF THEM.
 *
 * The audit's scenario says "the action is written to an append-only audit log
 * attributed to the real authenticated user", and its example of "the action"
 * is this exact route. Before P-27 the audit log was wired into thirty route
 * files, every one of them under crisis/, security/, admin/, delegation/ or
 * safety/ — and not the one the scenario names.
 *
 * AUDITED: POST here, and GET / PUT / DELETE on `[id]`. Every one of those
 * either changes a specific record or names one, so the row it produces answers
 * "who did what to which task", which is the only question an audit row is for.
 *
 * NOT AUDITED: GET on this collection route. Not an oversight, and not
 * squeamishness about volume for its own sake — `logAuditEntry` takes
 * `pg_advisory_xact_lock` keyed on the entity to keep the per-tenant hash chain
 * from forking under concurrency (see audit-service.ts). Every audited request
 * for one tenant therefore SERIALISES against every other. A task list is what
 * a dashboard polls; auditing it would put every page refresh in that queue,
 * behind every write, and fill the tenant's chain with rows recording that
 * somebody looked at a page. The chain would still verify and would say almost
 * nothing.
 *
 * The cost of that line, stated rather than glossed: a successful cross-tenant
 * LIST leaves no audit row. Today no such thing exists to record — one user's
 * two entities do not refuse each other at all, which is leg 7 and is P-29's.
 * When P-29 closes it, the refusal becomes a 403 worth recording and this
 * decision is worth revisiting with the volume question answered by a real
 * deployment rather than by me.
 */
const TASK_AUDIT = { resource: 'tasks', sensitivityLevel: 'INTERNAL' as const };

export async function POST(request: NextRequest) {
  return withAuditedRoleEntityScope(
    request,
    ['owner', 'admin', 'member'],
    TASK_AUDIT,
    async (req, session, entityId, report) => {
      try {
        const body = await req.json();
        const parsed = CreateTaskSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        // `entityId` is spread LAST and deliberately. `parsed.data.entityId` is a
        // plain string off the wire; `entityId` is the VerifiedEntityId
        // withEntityScope proved the caller owns. Put them the other way round
        // and createTask stops compiling -- which is the whole point.
        const { entityId: _requested, ...draft } = parsed.data;
        const task = await createTask(
          {
            ...draft,
            dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
            entityId,
          },
          session.userId
        );

        // The row now names the task it created. Without this the audit entry
        // for the audit's own example action says only that a task was made.
        report(task.id);

        return success(task, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create task';
        return error('CREATE_FAILED', message, 500);
      }
    }
  );
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = req.nextUrl.searchParams;

      // A list endpoint that leaks rows is a different failure from a
      // single-record 403: nothing here narrows the scope, so `filters` is a
      // TaskQueryFilters -- the filter bag with `entityId` removed at the type
      // level -- and the scope travels as its own argument.
      const filters: TaskQueryFilters = {};
      if (params.get('projectId')) filters.projectId = params.get('projectId')!;
      if (params.get('assigneeId')) filters.assigneeId = params.get('assigneeId')!;
      if (params.get('search')) filters.search = params.get('search')!;

      if (params.get('status')) {
        const statuses = params.get('status')!.split(',') as TaskStatus[];
        filters.status = statuses.length === 1 ? statuses[0] : statuses;
      }

      if (params.get('priority')) {
        const priorities = params.get('priority')!.split(',') as Priority[];
        filters.priority = priorities.length === 1 ? priorities[0] : priorities;
      }

      if (params.get('tags')) {
        filters.tags = params.get('tags')!.split(',');
      }

      let sort: TaskSortOptions | undefined;
      if (params.get('sort')) {
        const [field, direction] = params.get('sort')!.split(':');
        sort = {
          field: field as TaskSortOptions['field'],
          direction: (direction as 'asc' | 'desc') ?? 'desc',
        };
      }

      const page = parseInt(params.get('page') ?? '1', 10);
      const pageSize = parseInt(params.get('pageSize') ?? '20', 10);

      const result = await listTasks(entityId, filters, sort, page, pageSize);
      return paginated(result.data, result.total, page, pageSize);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list tasks';
      return error('LIST_FAILED', message, 500);
    }
  });
}
