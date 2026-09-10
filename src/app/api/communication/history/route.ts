import { NextRequest } from 'next/server';
import { z } from 'zod';
import { error, paginated } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// entityId is optional: withEntityScope resolves and verifies it.
const querySchema = z.object({
  entityId: z.string().min(1).optional(),
  status: z.enum(['draft', 'sent', 'opened', 'replied']).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { status, page, pageSize } = parsed.data;

      const skip = (page - 1) * pageSize;

      let messages: Array<Record<string, unknown>> = [];
      let total = 0;

      try {
        const where: Record<string, unknown> = {
          entityId,
          deletedAt: null,
        };

        if (status) {
          where.draftStatus = status;
        }

        total = await prisma.message.count({ where });

        const rawMessages = await prisma.message.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            createdAt: true,
            recipientId: true,
            channel: true,
            subject: true,
            draftStatus: true,
          },
        });

        // Resolve recipient names
        const recipientIds = [
          ...new Set(rawMessages.map((m: Record<string, unknown>) => m.recipientId)),
        ] as string[];

        let contactMap: Record<string, string> = {};
        try {
          const contacts = await prisma.contact.findMany({
            where: { id: { in: recipientIds }, entityId },
            select: { id: true, name: true },
          });
          contactMap = Object.fromEntries(
            contacts.map((c: { id: string; name: string }) => [c.id, c.name])
          );
        } catch {
          // Contact lookup failed; use IDs as fallback
        }

        messages = rawMessages.map((m: Record<string, unknown>) => ({
          id: m.id,
          date: m.createdAt,
          recipientName: contactMap[m.recipientId as string] ?? m.recipientId,
          channel: m.channel,
          subject: m.subject ?? '(no subject)',
          status: m.draftStatus ?? 'unknown',
        }));
      } catch {
        // Message model may not exist; return empty results
        messages = [];
        total = 0;
      }

      return paginated(messages, total, page, pageSize);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch communication history',
        500
      );
    }
  });
}
