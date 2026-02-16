import { NextRequest } from 'next/server';
import { success, error, paginated } from '@/shared/utils/api-response';
import { EntityService, getCurrentUserId } from '@/modules/entities/entity.service';
import { createEntitySchema, listEntitiesSchema } from '@/modules/entities/entity.validation';

const entityService = new EntityService();

export async function GET(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request.headers);
    const searchParams = Object.fromEntries(request.nextUrl.searchParams);

    const parsed = listEntitiesSchema.safeParse(searchParams);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid query parameters', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = await entityService.listEntities(userId, parsed.data);
    return paginated(result.data, result.total, result.page, result.pageSize);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to list entities', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getCurrentUserId(request.headers);
    const body = await request.json();

    const parsed = createEntitySchema.safeParse(body);
    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid entity data', 400, {
        issues: parsed.error.issues,
      });
    }

    const entity = await entityService.createEntity(userId, parsed.data);
    return success(entity, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to create entity', 500);
  }
}
