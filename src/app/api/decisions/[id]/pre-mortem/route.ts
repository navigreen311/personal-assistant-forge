import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { runPreMortem } from '@/modules/decisions/services/pre-mortem';

const PreMortemRequestSchema = z.object({
  chosenOptionId: z.string().min(1),
  timeHorizon: z.enum(['30_DAYS', '90_DAYS', '1_YEAR', '3_YEARS']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: decisionId } = await params;
    const body = await request.json();
    const parsed = PreMortemRequestSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = await runPreMortem({
      decisionId,
      chosenOptionId: parsed.data.chosenOptionId,
      timeHorizon: parsed.data.timeHorizon,
    });

    return success(result);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to run pre-mortem analysis', 500);
  }
}
