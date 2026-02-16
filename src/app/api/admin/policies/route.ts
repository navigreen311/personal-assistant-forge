import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getPolicies, createPolicy } from '@/modules/admin/services/org-policy-service';

const createPolicySchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['RETENTION', 'SHARING', 'COMPLIANCE', 'ACCESS', 'DLP']),
  config: z.record(z.string(), z.unknown()),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

    const type = request.nextUrl.searchParams.get('type') || undefined;
    const policies = await getPolicies(entityId, type);
    return success(policies);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createPolicySchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const policy = await createPolicy(parsed.data);
    return success(policy, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
