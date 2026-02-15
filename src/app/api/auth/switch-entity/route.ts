import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

const switchEntitySchema = z.object({
  entityId: z.string().min(1, 'Entity ID is required'),
});

export async function POST(req: NextRequest) {
  return withAuth(req, async (_req, session) => {
    try {
      const body = await req.json();
      const parsed = switchEntitySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid input', 400, {
          fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }

      const { entityId } = parsed.data;

      // Verify user owns the entity
      const entity = await prisma.entity.findFirst({
        where: { id: entityId, userId: session.userId },
      });

      if (!entity) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      return success({ activeEntityId: entityId });
    } catch (err) {
      console.error('Entity switch error:', err);
      return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  });
}
