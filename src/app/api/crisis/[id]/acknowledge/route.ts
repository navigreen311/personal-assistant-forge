import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { getCrisisForUser } from '@/modules/crisis/services/detection-service';
import * as escalationService from '@/modules/crisis/services/escalation-service';

// P-10/T-001. Prove ownership BEFORE escalating: acknowledging another user's
// escalation step silences the contact chain that was trying to reach them.
const acknowledgeSchema = z.object({
  stepOrder: z.number().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuditedAuth(
    request,
    { resource: 'crisis.acknowledge', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session) => {
      try {
        const { id } = await params;
        if (!getCrisisForUser(id, session.userId)) {
          return error('NOT_FOUND', 'Crisis not found', 404);
        }

        const body = await req.json();
        const parsed = acknowledgeSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        const crisis = await escalationService.acknowledgeEscalation(id, parsed.data.stepOrder);
        return success(crisis);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
