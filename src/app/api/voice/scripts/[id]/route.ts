import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getScript, updateScript } from '@/modules/voiceforge/services/script-engine';
import { withAuth } from '@/shared/middleware/auth';

const UpdateScriptSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  nodes: z
    .array(
      z.object({
        id: z.string().min(1),
        type: z.enum(['SPEAK', 'LISTEN', 'BRANCH', 'TRANSFER', 'END', 'COLLECT_INFO']),
        content: z.string(),
        branches: z.array(
          z.object({
            condition: z.string(),
            targetNodeId: z.string(),
            label: z.string(),
          })
        ),
        escalationTrigger: z.boolean().optional(),
        collectField: z.string().optional(),
        nextNodeId: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .optional(),
  startNodeId: z.string().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const script = await getScript(id);

      if (!script) {
        return error('NOT_FOUND', `Script ${id} not found`, 404);
      }

      return success(script);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
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
      const parsed = UpdateScriptSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const script = await updateScript(id, parsed.data);
      return success(script);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        return error('NOT_FOUND', err.message, 404);
      }
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
