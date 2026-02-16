import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import {
  getAvailableSources,
  initiateImport,
} from '@/modules/onboarding/services/migration-service';
import type { AuthSession } from '@/lib/auth/types';

// --- Validation ---

const importSchema = z.object({
  sourceId: z.string().min(1),
});

// --- Handlers ---

async function handleGet(_req: NextRequest, _session: AuthSession): Promise<Response> {
  try {
    const sources = getAvailableSources();
    return success(sources);
  } catch (err) {
    console.error('[migration] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load migration sources', 500);
  }
}

async function handlePost(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = importSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const source = await initiateImport(session.userId, parsed.data.sourceId);
    return success(source, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to initiate import';
    console.error('[migration] POST error:', err);

    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
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
