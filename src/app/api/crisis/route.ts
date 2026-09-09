import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth, withAuditedEntityScope } from '@/modules/security/audit-wiring';
import * as detectionService from '@/modules/crisis/services/detection-service';

// entityId optional: a client that omits it gets its session's active entity.
const createCrisisSchema = z.object({
  entityId: z.string().min(1).optional(),
  type: z.enum(['LEGAL_THREAT', 'PR_ISSUE', 'HEALTH_EMERGENCY', 'FINANCIAL_ANOMALY', 'DATA_BREACH', 'CLIENT_COMPLAINT', 'REGULATORY_INQUIRY', 'NATURAL_DISASTER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string().min(1),
  description: z.string().min(1),
});

const AUDIT = { resource: 'crisis', sensitivityLevel: 'CONFIDENTIAL' as const };

/**
 * GET is USER-scoped, not entity-scoped, and that is deliberate — see
 * tenancy-pattern.md §5b. `getActiveCrises(userId)` answers "what is on fire for
 * me", across every entity I own; narrowing it to the session's active entity
 * would silently drop crises in the user's other entities from a page whose
 * whole job is to not miss one. `withAuditedAuth` keeps the existing breadth,
 * and the scope still comes from the verified session rather than the request.
 */
export async function GET(request: NextRequest) {
  return withAuditedAuth(request, AUDIT, async (req, session) => {
    try {
      const crises = await detectionService.getActiveCrises(session.userId);
      return success(crises);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuditedEntityScope(request, AUDIT, async (req, session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createCrisisSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { type, severity, title, description } = parsed.data;
      const crisis = await detectionService.createCrisisEvent(
        session.userId,
        entityId,
        type,
        severity,
        title,
        description,
      );
      return success(crisis, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
