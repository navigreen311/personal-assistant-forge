import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getDLPRules, createDLPRule } from '@/modules/admin/services/dlp-service';

const createDLPRuleSchema = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  pattern: z.string().min(1),
  action: z.enum(['BLOCK', 'WARN', 'LOG', 'REDACT']),
  scope: z.enum(['OUTBOUND_MESSAGES', 'DOCUMENTS', 'ALL']),
  isActive: z.boolean().default(true),
});

export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

    const rules = await getDLPRules(entityId);
    return success(rules);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createDLPRuleSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const rule = await createDLPRule(parsed.data);
    return success(rule, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
