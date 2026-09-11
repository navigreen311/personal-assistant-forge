import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope } from '@/shared/middleware/auth';
import type { VerifiedEntityId } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import {
  installPlugin,
  uninstallPlugin,
  loadPluginForUser,
  PluginRevokedError,
  PluginNotInstalledError,
} from '@/modules/developer/services/plugin-service';

/**
 * ===========================================================================
 * P-37 — THE PATH A USER'S REQUEST ACTUALLY TAKES TO RUN A PLUGIN.
 * ===========================================================================
 *
 * Before this file, `breakGlassRevoke` was an emergency control with nothing to
 * revoke FROM. `/api/developer/plugins` publishes and lists registry entries;
 * nothing installed a plugin for a user and nothing loaded one, so "stop
 * serving it" had no serving to stop and "how many users were affected" had no
 * users to count. That absence is why `affectedUsers: 0` could sit in the code
 * as a literal and look plausible.
 *
 *   POST   — install this plugin for the calling user.
 *   GET    — load it: the runtime handle (entryPoint + granted permissions).
 *   DELETE — uninstall it.
 *
 * All three refuse a revoked plugin with 403 `PLUGIN_REVOKED`, and all three
 * read Postgres on every call, so a revocation written by another process or
 * before a restart is in force on the next request.
 */

type RouteContext = { params: Promise<{ pluginId: string }> };

/**
 * tenancy-pattern.md sec.4 -- the entity is a property of the row, not the
 * request. `/api/developer/plugins/<id>` names no entity, so falling through to
 * the session's active entity would answer about a plugin the caller never
 * asked for. Resolve the owner from the Document row, then prove it.
 *
 * Duplicated per route file on purpose (sec.8 trap 3d): a Next.js route file may
 * export only HTTP handlers, so this cannot be hoisted into a shared module
 * here.
 */
async function withPluginScope(
  request: NextRequest,
  pluginId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  // Authenticate FIRST, so an anonymous caller never reaches the database.
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.document.findUnique({
      where: { id: pluginId },
      select: { entityId: true, type: true, deletedAt: true }, // the scope ONLY
    });

    if (!owner || owner.deletedAt || owner.type !== 'PLUGIN') {
      return error('NOT_FOUND', `Plugin ${pluginId} not found`, 404);
    }

    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

/** One place that decides the status, so all three verbs answer identically. */
function toResponse(err: unknown) {
  if (err instanceof PluginRevokedError) {
    return error('PLUGIN_REVOKED', err.message, 403);
  }
  if (err instanceof PluginNotInstalledError) {
    return error('PLUGIN_NOT_INSTALLED', err.message, 404);
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  if (message.includes('not found')) return error('NOT_FOUND', message, 404);
  return error('INTERNAL_ERROR', message, 500);
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { pluginId } = await context.params;
  return withPluginScope(request, pluginId, async (_req, session, entityId) => {
    try {
      return success(await loadPluginForUser(pluginId, session.userId, entityId));
    } catch (err) {
      return toResponse(err);
    }
  });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { pluginId } = await context.params;
  return withPluginScope(request, pluginId, async (_req, session, entityId) => {
    try {
      return success(await installPlugin(pluginId, session.userId, entityId), 201);
    } catch (err) {
      return toResponse(err);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { pluginId } = await context.params;
  return withPluginScope(request, pluginId, async (_req, session, entityId) => {
    try {
      const result = await uninstallPlugin(pluginId, session.userId, entityId);
      if (result.revoked) {
        // Deliberately not a silent success. The row stays as the revocation
        // tombstone, and saying "uninstalled" would be a small instance of this
        // codebase's defining bug.
        return error(
          'PLUGIN_REVOKED',
          'This plugin has been revoked; its record is retained as a revocation tombstone.',
          403
        );
      }
      return success(result);
    } catch (err) {
      return toResponse(err);
    }
  });
}
