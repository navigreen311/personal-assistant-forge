import { NextRequest } from 'next/server';
import { success, error, paginated } from '@/shared/utils/api-response';
import { EntityService } from '@/modules/entities/entity.service';
import { createEntitySchema, listEntitiesSchema } from '@/modules/entities/entity.validation';
import { withAuth } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const searchParams = Object.fromEntries(req.nextUrl.searchParams);

      const parsed = listEntitiesSchema.safeParse(searchParams);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await entityService.listEntities(session.userId, parsed.data);
      return paginated(result.data, result.total, result.page, result.pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to list entities', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();

      const parsed = createEntitySchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid entity data', 400, {
          issues: parsed.error.issues,
        });
      }

      const entity = await entityService.createEntity(session.userId, parsed.data);
      return success(entity, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to create entity', 500);
    }
  });
}
