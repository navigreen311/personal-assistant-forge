import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRole } from '@/modules/security/audit-wiring';
import { checkForFraud } from '@/engines/trust-safety/fraud-detector';
import type { ActionLog } from '@/shared/types';

const ActionLogSchema = z.object({
  id: z.string(),
  actor: z.enum(['AI', 'HUMAN', 'SYSTEM']),
  actorId: z.string().optional(),
  actionType: z.string(),
  target: z.string(),
  reason: z.string(),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  reversible: z.boolean(),
  rollbackPath: z.string().optional(),
  status: z.enum(['PENDING', 'EXECUTED', 'ROLLED_BACK', 'FAILED']),
  cost: z.number().optional(),
  timestamp: z.string().transform(s => new Date(s)),
});

const RequestSchema = z.object({
  action: ActionLogSchema,
  history: z.array(ActionLogSchema).optional(),
});

export async function POST(request: NextRequest) {
// P-10/T-002: audited. Stateless analyser with no entity in the model, so
// `withAuditedRole` (no entity scope) is the right helper — see
// src/modules/security/audit-wiring.ts for why that is a named choice.
  return withAuditedRole(
    request,
    ['owner', 'admin'],
    { resource: 'safety.fraud-check', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await checkForFraud(
        parsed.data.action as ActionLog,
        parsed.data.history as ActionLog[] | undefined
      );
      return success(result);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to check for fraud', 500);
    }
    },
  );
}
