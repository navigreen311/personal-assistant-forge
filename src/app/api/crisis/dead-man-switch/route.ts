import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth, withAuditedRole } from '@/modules/security/audit-wiring';
import * as dmsService from '@/modules/crisis/services/dead-man-switch-service';

const configSchema = z.object({
  isEnabled: z.boolean(),
  checkInIntervalHours: z.number().min(1),
  triggerAfterMisses: z.number().min(1),
  protocols: z.array(z.object({
    order: z.number(),
    action: z.string(),
    contactId: z.string().optional(),
    contactName: z.string(),
    message: z.string(),
    delayHoursAfterTrigger: z.number(),
  })),
});

const AUDIT = { resource: 'crisis.dead-man-switch', sensitivityLevel: 'RESTRICTED' as const };

// The switch is USER-scoped: `DeadManSwitch.userId` is unique and the model has
// no entityId. `session.userId` is therefore the whole authorization, and there
// is no path by which a caller can name someone else's switch.

export async function GET(request: NextRequest) {
  return withAuditedAuth(request, AUDIT, async (req, session) => {
    try {
      const status = await dmsService.getStatus(session.userId);
      // Report the evaluation alongside the configuration. Returning only the
      // stored row let a switch sit tripped while an operator looked straight
      // at it. This read has no side effects; POST /evaluate is what acts.
      const evaluation = await dmsService.evaluateSwitch(session.userId);
      return success({ ...status, evaluation });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedRole(request, ['owner', 'admin'], AUDIT, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = configSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const config = await dmsService.configure(session.userId, {
        ...parsed.data,
        userId: session.userId,
      });
      return success(config, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
