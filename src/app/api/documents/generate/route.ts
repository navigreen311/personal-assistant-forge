import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { generateDocument } from '@/modules/documents/services/document-generation-service';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const generateSchema = z.object({
  templateId: z.string().min(1),
  variables: z.record(z.string(), z.string()),
  entityId: z.string().min(1).optional(),
  brandKit: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    logoUrl: z.string().optional(),
    fontFamily: z.string().optional(),
    toneGuide: z.string().optional(),
  }).optional(),
  outputFormat: z.enum(['DOCX', 'PDF', 'MARKDOWN', 'HTML']).default('MARKDOWN'),
  citationsEnabled: z.boolean().default(false),
});

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = generateSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        // entityId LAST: it overwrites whatever the caller asked for.
        const { entityId: _requested, ...draft } = parsed.data;
        const doc = await generateDocument({ ...draft, entityId });
        return success(doc, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "ai".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'ai', handlePOST);
}
