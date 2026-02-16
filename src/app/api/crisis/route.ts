import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import * as detectionService from '@/modules/crisis/services/detection-service';

const createCrisisSchema = z.object({
  userId: z.string().min(1),
  entityId: z.string().min(1),
  type: z.enum(['LEGAL_THREAT', 'PR_ISSUE', 'HEALTH_EMERGENCY', 'FINANCIAL_ANOMALY', 'DATA_BREACH', 'CLIENT_COMPLAINT', 'REGULATORY_INQUIRY', 'NATURAL_DISASTER']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string().min(1),
  description: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) return error('MISSING_PARAM', 'userId is required', 400);

    const crises = await detectionService.getActiveCrises(userId);
    return success(crises);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createCrisisSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { userId, entityId, type, severity, title, description } = parsed.data;
    const crisis = await detectionService.createCrisisEvent(userId, entityId, type, severity, title, description);
    return success(crisis, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
