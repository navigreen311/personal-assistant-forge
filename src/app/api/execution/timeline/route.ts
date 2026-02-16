import { z } from 'zod';
import { paginated, error } from '@/shared/utils/api-response';
import { getTimeline } from '@/modules/execution/services/operator-console';
import type { ActionActor, BlastRadius } from '@/shared/types';
import type { OperatorConsoleFilters } from '@/modules/execution/types';

const ActorValues: [string, ...string[]] = ['AI', 'HUMAN', 'SYSTEM'];
const BlastRadiusValues: [string, ...string[]] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const TimelineQuerySchema = z.object({
  actor: z.enum(ActorValues).optional(),
  entityId: z.string().optional(),
  from: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  to: z.string().datetime({ offset: true }).or(z.string().date()).optional(),
  blastRadius: z.enum(BlastRadiusValues).optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawQuery: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      rawQuery[key] = value;
    });

    const parsed = TimelineQuerySchema.safeParse(rawQuery);

    if (!parsed.success) {
      return error(
        'VALIDATION_ERROR',
        'Invalid query parameters',
        400,
        { issues: parsed.error.flatten().fieldErrors }
      );
    }

    const { actor, entityId, from, to, blastRadius, search, page, pageSize } =
      parsed.data;

    const filters: OperatorConsoleFilters = {};

    if (actor) {
      filters.actor = actor as ActionActor;
    }
    if (entityId) {
      filters.entityId = entityId;
    }
    if (from || to) {
      filters.dateRange = {
        from: from ? new Date(from) : new Date(0),
        to: to ? new Date(to) : new Date(),
      };
    }
    if (blastRadius) {
      filters.blastRadius = blastRadius as BlastRadius;
    }
    if (search) {
      filters.search = search;
    }

    const result = await getTimeline(filters, page, pageSize);

    return paginated(result.data, result.total, page, pageSize);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to retrieve timeline';
    return error('TIMELINE_ERROR', message, 500);
  }
}
