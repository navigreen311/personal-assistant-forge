import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import * as detectionService from '@/modules/crisis/services/detection-service';

const createCrisisSchema = z.object({
  entityId: z.string().min(1),
  type: z.enum(['LEGAL_THREAT', 'PR_ISSUE', 'HEALTH_EMERGENCY', 'FINANCIAL_ANOMALY', 'DATA_BREACH', 'CLIENT_COMPLAINT', 'REGULATORY_INQUIRY', 'NATURAL_DISASTER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string().min(1),
  description: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const crises = await detectionService.getActiveCrises(session.userId);
      return success(crises);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = createCrisisSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const { entityId, type, severity, title, description } = parsed.data;
      const crisis = await detectionService.createCrisisEvent(session.userId, entityId, type, severity, title, description);
      return success(crisis, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
