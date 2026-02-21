import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getRuleById, updateRule, deleteRule } from '@/engines/policy/rule-crud';
import { withAuth } from '@/shared/middleware/auth';

const UpdateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  scope: z.enum(['GLOBAL', 'ENTITY', 'PROJECT', 'CONTACT', 'CHANNEL']).optional(),
  entityId: z.string().optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
  precedence: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const rule = await getRuleById(id);

      if (!rule) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      return success(rule);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdateRuleSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const existing = await getRuleById(id);
      if (!existing) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      const updated = await updateRule(id, parsed.data);
      return success(updated);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const existing = await getRuleById(id);

      if (!existing) {
        return error('NOT_FOUND', `Rule ${id} not found`, 404);
      }

      await deleteRule(id);
      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}
