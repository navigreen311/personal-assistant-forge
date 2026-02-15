import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createTask, listTasks } from '@/modules/tasks/services/task-crud';
import type { TaskStatus, Priority } from '@/shared/types';
import type { TaskFilters, TaskSortOptions } from '@/modules/tasks/types';

const CreateTaskSchema = z.object({
  title: z.string().min(1),
  entityId: z.string().min(1),
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
  try {
    const body = await request.json();
    const parsed = CreateTaskSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    const task = await createTask({
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
    });

    return success(task, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create task';
    return error('CREATE_FAILED', message, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    const filters: TaskFilters = {};
    if (params.get('entityId')) filters.entityId = params.get('entityId')!;
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

    const result = await listTasks(filters, sort, page, pageSize);
    return paginated(result.data, result.total, page, pageSize);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list tasks';
    return error('LIST_FAILED', message, 500);
  }
}
