import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { provisionNumber } from '@/modules/voiceforge/services/number-manager';

const ProvisionSchema = z.object({
  entityId: z.string().min(1),
  areaCode: z.string().length(3),
  label: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ProvisionSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const number = await provisionNumber(
      parsed.data.entityId,
      parsed.data.areaCode,
      parsed.data.label
    );
    return success(number, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
