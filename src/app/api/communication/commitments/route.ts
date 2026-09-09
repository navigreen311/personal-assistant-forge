import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// entityId is optional: withEntityScope resolves and verifies it.
const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  type: z.enum(['made_by_me', 'made_to_me']).optional(),
});

interface Commitment {
  description: string;
  direction: string;
  status: string;
  dueDate?: string;
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // entityId comes from withEntityScope, already proven; the caller's own
      // copy in parsed.data is discarded.
      const { type } = parsed.data;

      let commitments: Array<{
        id: string;
        description: string;
        contactName: string;
        dueDate: string | null;
        status: string;
        type: string;
      }> = [];

      try {
        const contacts = await (prisma as any).contact.findMany({
          where: {
            entityId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            commitments: true,
          },
        });

        for (const contact of contacts) {
          const rawCommitments = (contact.commitments as unknown as Commitment[]) ?? [];

          for (let i = 0; i < rawCommitments.length; i++) {
            const c = rawCommitments[i];

            // Map direction to type filter
            const commitmentType = c.direction === 'TO' ? 'made_by_me' : 'made_to_me';

            // Filter by type if specified
            if (type && commitmentType !== type) continue;

            // Only include open commitments
            if (c.status !== 'OPEN') continue;

            commitments.push({
              id: `${contact.id}-commitment-${i}`,
              description: c.description,
              contactName: contact.name,
              dueDate: c.dueDate ?? null,
              status: c.status,
              type: commitmentType,
            });
          }
        }
      } catch {
        // Contact or commitment model may not exist; return empty array
        commitments = [];
      }

      return success({ commitments });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch commitments',
        500
      );
    }
  });
}
