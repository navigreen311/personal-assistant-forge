import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { registerPlugin, getPlugins, submitForReview, approvePlugin, revokePlugin } from '@/modules/developer/services/plugin-service';

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
  try {
    const status = request.nextUrl.searchParams.get('status') || undefined;
    const plugins = await getPlugins(status);
    return success(plugins);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if this is an action (submit/approve/revoke) or registration
    if (body.action && body.pluginId) {
      const parsed = pluginActionSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      let result;
      switch (parsed.data.action) {
        case 'submit':
          result = await submitForReview(parsed.data.pluginId);
          break;
        case 'approve':
          result = await approvePlugin(parsed.data.pluginId);
          break;
        case 'revoke':
          result = await revokePlugin(parsed.data.pluginId, parsed.data.reason || 'Revoked');
          break;
      }
      return success(result);
    }

    const parsed = registerPluginSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const plugin = await registerPlugin(parsed.data);
    return success(plugin, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
