import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { provisionNumber } from '@/modules/voiceforge/services/number-manager';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

const ProvisionSchema = z.object({
  entityId: z.string().min(1).optional(),
  areaCode: z.string().length(3),
  label: z.string().min(1),
});

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = ProvisionSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // The verified scope, never parsed.data.entityId: provisioning a number
        // into another tenant is a billable write.
        const number = await provisionNumber(
          entityId,
          parsed.data.areaCode,
          parsed.data.label
        );
        return success(number, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
