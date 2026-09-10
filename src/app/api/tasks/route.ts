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
import { withEntityScope, withRole } from '@/shared/middleware/auth';
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

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, session, entityId) => {
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

        return success(task, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to create task';
        return error('CREATE_FAILED', message, 500);
      }
    })
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
