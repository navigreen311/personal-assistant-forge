import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const DecideSchema = z.object({
  chosenOptionId: z.string().min(1),
  rationale: z.string().min(1),
  reviewDate: z.string().datetime().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;

      // Fetch the decision
      const decision = await prisma.decision.findUnique({
        where: { id },
        include: { entity: { select: { userId: true } } },
      });

      if (!decision) {
        return error('NOT_FOUND', 'Decision not found', 404);
      }

      // Verify the decision belongs to the user's entity
      if (decision.entity.userId !== session.userId) {
        return error(
          'FORBIDDEN',
          'You do not have access to this decision',
          403
        );
      }

      // Validate that the decision hasn't already been decided
      if (decision.status === 'decided') {
        return error(
          'VALIDATION_ERROR',
          'This decision has already been decided',
          400
        );
      }

      // Parse and validate the request body
      const body = await req.json();
      const parsed = DecideSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const { chosenOptionId, rationale, reviewDate } = parsed.data;

      // Verify the chosen option exists in the decision's options
      const options = (decision.options as Array<{ id: string }>) ?? [];
      const optionExists = options.some((opt) => opt.id === chosenOptionId);

      if (!optionExists) {
        return error(
          'VALIDATION_ERROR',
          `Option "${chosenOptionId}" not found in this decision's options`,
          400
        );
      }

      // Update the decision
      const updated = await prisma.decision.update({
        where: { id },
        data: {
          status: 'decided',
          outcome: chosenOptionId,
          rationale,
          decidedAt: new Date(),
          decidedBy: session.userId,
        },
      });

      return success({
        id: updated.id,
        status: updated.status,
        outcome: updated.outcome,
        rationale: updated.rationale,
        decidedAt: updated.decidedAt,
        decidedBy: updated.decidedBy,
        reviewDate: reviewDate ?? null,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to record decision', 500);
    }
  });
}
