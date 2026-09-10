import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { createScript, listScripts } from '@/modules/voiceforge/services/script-engine';
import { withEntityScope, withRole } from '@/shared/middleware/auth';

const ScriptNodeSchema = z.object({
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
});

const CreateScriptSchema = z.object({
  entityId: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string(),
  nodes: z.array(ScriptNodeSchema),
  startNodeId: z.string().min(1),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).default('DRAFT'),
});

/** Single-entity list (section 5b): a script library belongs to one entity. */
export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const scripts = await listScripts(entityId);
      return success(scripts);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = CreateScriptSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        // entityId LAST, deliberately: it overwrites the caller's own value.
        const { entityId: _requested, ...draft } = parsed.data;
        const script = await createScript({ ...draft, entityId });
        return success(script, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
