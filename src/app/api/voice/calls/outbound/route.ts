import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { initiateOutboundCall } from '@/modules/voiceforge/services/outbound-agent';
import { withAuth } from '@/shared/middleware/auth';

const OutboundCallSchema = z.object({
  entityId: z.string().min(1),
  contactId: z.string().min(1),
  personaId: z.string().min(1),
  scriptId: z.string().optional(),
  purpose: z.string().min(1),
  maxDuration: z.number().positive().optional(),
  recordCall: z.boolean().optional(),
  guardrails: z.object({
    maxCommitments: z.number().int().nonnegative(),
    forbiddenTopics: z.array(z.string()),
    escalationTriggers: z.array(z.string()),
    complianceProfile: z.array(z.string()),
    maxSilenceSeconds: z.number().positive(),
  }),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = OutboundCallSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const result = await initiateOutboundCall(parsed.data);
      return success(result, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
