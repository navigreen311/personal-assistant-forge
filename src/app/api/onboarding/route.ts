import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import {
  initializeWizard,
  getWizard,
  completeStep,
  skipStep,
} from '@/modules/onboarding/services/wizard-service';
import type { AuthSession } from '@/lib/auth/types';

// --- Validation ---

const stepActionSchema = z.object({
  stepId: z.string().min(1),
  action: z.enum(['complete', 'skip']),
});

// --- Handlers ---

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const wizard = await getWizard(session.userId);
    return success(wizard);
  } catch (err) {
    console.error('[onboarding] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load onboarding state', 500);
  }
}

async function handlePost(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const existing = await getWizard(session.userId);
    if (existing) {
      return success(existing);
    }

    const wizard = await initializeWizard(session.userId);
    return success(wizard, 201);
  } catch (err) {
    console.error('[onboarding] POST error:', err);
    return error('INTERNAL_ERROR', 'Failed to initialize onboarding', 500);
  }
}

async function handlePatch(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = stepActionSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const { stepId, action } = parsed.data;

    const wizard = action === 'complete'
      ? await completeStep(session.userId, stepId)
      : await skipStep(session.userId, stepId);

    return success(wizard);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update step';
    console.error('[onboarding] PATCH error:', err);

    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    if (message.includes('Cannot skip')) {
      return error('VALIDATION_ERROR', message, 400);
    }

    return error('INTERNAL_ERROR', message, 500);
  }
}

// --- Route Exports ---

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function POST(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePost);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePatch);
}
