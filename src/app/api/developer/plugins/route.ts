import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEntityScope } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { registerPlugin, getPlugins, submitForReview, approvePlugin, revokePlugin } from '@/modules/developer/services/plugin-service';

// P-13 / tenancy-pattern.md 5b -- SINGLE-ENTITY.
//
// A plugin is a `Document` row and `Document.entityId` is a required FK, so a
// plugin belongs to exactly one entity and `withEntityScope` narrows nothing.
//
// GET called `getPlugins(status)`, which had no entity filter at all: it listed
// every tenant's plugins and the permissions they declare. The three lifecycle
// actions (submit / approve / revoke) took a bare plugin id and mutated it.

const registerPluginSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  version: z.string(),
  author: z.string(),
  permissions: z.array(z.string()),
  entryPoint: z.string(),
  configSchema: z.record(z.string(), z.unknown()).default({}),
});

const pluginActionSchema = z.object({
  pluginId: z.string().min(1),
  action: z.enum(['submit', 'approve', 'revoke']),
  reason: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const status = req.nextUrl.searchParams.get('status') || undefined;
      const plugins = await getPlugins(status, entityId);
      return success(plugins);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const body = await req.json();

      if (body.action && body.pluginId) {
        const parsed = pluginActionSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        let result;
        switch (parsed.data.action) {
          case 'submit':
            result = await submitForReview(parsed.data.pluginId, entityId);
            break;
          case 'approve':
            result = await approvePlugin(parsed.data.pluginId, entityId);
            break;
          case 'revoke':
            result = await revokePlugin(parsed.data.pluginId, parsed.data.reason || 'Revoked', entityId);
            break;
        }
        return success(result);
      }

      const parsed = registerPluginSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      // `entityId` last, deliberately: it overwrites the caller's own value.
      const plugin = await registerPlugin(parsed.data, entityId);
      return success(plugin, 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('not found')) return error('NOT_FOUND', message, 404);
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
