import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedRole } from '@/modules/security/audit-wiring';
import { analyzeEmailHeaders } from '@/engines/trust-safety/reputation-service';

const RequestSchema = z.object({
  headers: z.record(z.string(), z.string()),
});

export async function POST(request: NextRequest) {
// P-10/T-002: audited. Stateless analyser with no entity in the model, so
// `withAuditedRole` (no entity scope) is the right helper — see
// src/modules/security/audit-wiring.ts for why that is a named choice.
  return withAuditedRole(
    request,
    ['admin'],
    { resource: 'safety.email-headers', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const analysis = analyzeEmailHeaders(parsed.data.headers);
      return success(analysis);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to analyze email headers', 500);
    }
    },
  );
}
