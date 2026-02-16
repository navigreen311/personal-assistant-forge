import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getSOP, updateSOP } from '@/modules/knowledge/services/sop-service';
import { withAuth } from '@/shared/middleware/auth';

const sopStepSchema = z.object({
  order: z.number(),
  instruction: z.string().min(1),
  notes: z.string().optional(),
  estimatedMinutes: z.number().optional(),
  isOptional: z.boolean(),
});

const updateSOPSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  steps: z.array(sopStepSchema).optional(),
  triggerConditions: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const sop = await getSOP(id);

      if (!sop) {
        return error('NOT_FOUND', 'SOP not found', 404);
      }

      return success(sop);
    } catch (err) {
      return error('INTERNAL_ERROR', 'Failed to get SOP', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = updateSOPSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const sop = await updateSOP(id, parsed.data);
      return success(sop);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update SOP';
      if (message.includes('not found')) {
        return error('NOT_FOUND', message, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
