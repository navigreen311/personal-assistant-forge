import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { createSOP, listSOPs } from '@/modules/knowledge/services/sop-service';
import { withEntityScope } from '@/shared/middleware/auth';

const sopStepSchema = z.object({
  order: z.number(),
  instruction: z.string().min(1),
  notes: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  isOptional: z.boolean(),
});

const createSOPSchema = z.object({
  entityId: z.string().min(1).optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  steps: z.array(sopStepSchema).min(1),
  triggerConditions: z.array(z.string()),
  tags: z.array(z.string()),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']),
  lastUsed: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = req.nextUrl;
      const status = searchParams.get('status');
      const tags = searchParams.get('tags');

      const sops = await listSOPs(entityId, {
        status: status || undefined,
        tags: tags ? tags.split(',') : undefined,
      });

      return success(sops);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to list SOPs', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = createSOPSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId: _requested, ...draft } = parsed.data;
      const data = {
        ...draft,
        lastUsed: draft.lastUsed ? new Date(draft.lastUsed) : undefined,
      };

      const sop = await createSOP(data, entityId);
      return success(sop, 201);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to create SOP', 500);
    }
  });
}
