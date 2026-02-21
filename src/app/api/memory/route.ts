import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error, paginated } from '@/shared/utils/api-response';
import { createMemory, getMemoriesByType } from '@/engines/memory/memory-service';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';

const CreateMemorySchema = z.object({
  type: z.enum(['SHORT_TERM', 'WORKING', 'LONG_TERM', 'EPISODIC']),
  content: z.string().min(1),
  context: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const { searchParams } = req.nextUrl;
      const userId = session.userId;

      const type = searchParams.get('type') as 'SHORT_TERM' | 'WORKING' | 'LONG_TERM' | 'EPISODIC' | null;
      const page = parseInt(searchParams.get('page') ?? '1', 10);
      const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10);

      if (type) {
        const entries = await getMemoriesByType(userId, type, pageSize);
        return success(entries);
      }

      const [entries, total] = await Promise.all([
        prisma.memoryEntry.findMany({
          where: { userId },
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { strength: 'desc' },
        }),
        prisma.memoryEntry.count({ where: { userId } }),
      ]);

      return paginated(entries, total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = CreateMemorySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const entry = await createMemory(
        session.userId,
        parsed.data.type,
        parsed.data.content,
        parsed.data.context
      );

      return success(entry, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
