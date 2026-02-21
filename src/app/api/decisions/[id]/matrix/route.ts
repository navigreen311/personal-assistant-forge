import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { createMatrix } from '@/modules/decisions/services/decision-matrix';

const CriterionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  weight: z.number().min(0).max(1),
  description: z.string().optional(),
});

const ScoreSchema = z.object({
  criterionId: z.string().min(1),
  optionId: z.string().min(1),
  score: z.number().min(1).max(10),
  rationale: z.string().min(1),
});

const MatrixRequestSchema = z.object({
  criteria: z.array(CriterionSchema).min(1),
  scores: z.array(ScoreSchema).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id: decisionId } = await params;
      const body = await req.json();
      const parsed = MatrixRequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = createMatrix(decisionId, parsed.data.criteria, parsed.data.scores);
      return success(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to run decision matrix';
      if (message.includes('Weights sum to') || message.includes('negative weight')) {
        return error('VALIDATION_ERROR', message, 400);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
