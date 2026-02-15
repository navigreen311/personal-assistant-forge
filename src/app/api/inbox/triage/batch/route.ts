import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { TriageService } from '@/modules/inbox';
import { batchTriageSchema } from '@/modules/inbox/inbox.validation';

const triageService = new TriageService();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = batchTriageSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid batch triage request', 400, {
        issues: parsed.error.issues,
      });
    }

    const result = await triageService.batchTriage(parsed.data);
    return success(result, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return error('INTERNAL_ERROR', message, 500);
  }
}
