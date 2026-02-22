import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { withAuth } from '@/shared/middleware/auth';

export async function POST(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      const result = await prisma.memoryEntry.deleteMany({
        where: {
          userId: session.userId,
          strength: { lt: 0.1 },
        },
      });

      return success({
        purged: result.count,
        message: `Purged ${result.count} decayed memories with strength below 10%.`,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
