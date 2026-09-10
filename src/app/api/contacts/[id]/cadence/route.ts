import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, withEntityScope, type VerifiedEntityId, withRole } from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';
import { setCadence } from '@/modules/communication/services/cadence-engine';

const setCadenceSchema = z.object({
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY']),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * This route had NO AUTHENTICATION AT ALL: it did not import withAuth, so
 * anyone who could reach the URL could read and set the follow-up cadence of
 * any contact in the database by id. Both halves are added here -- a session
 * is required, and the entity that owns the contact row must belong to it.
 */
async function withContactScope(
  request: NextRequest,
  contactId: string,
  handler: (
    req: NextRequest,
    session: AuthSession,
    entityId: VerifiedEntityId
  ) => Promise<Response>
): Promise<Response> {
  return withAuth(request, async (authedReq) => {
    const owner = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { entityId: true },
    });
    if (!owner) {
      return error('NOT_FOUND', `Contact not found: ${contactId}`, 404);
    }
    return withEntityScope(authedReq, handler, owner.entityId);
  });
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (_req, _session, entityId) => {
    try {
      const contact = await prisma.contact.findFirst({ where: { id, entityId } });
      if (!contact) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      const preferences = (contact.preferences as Record<string, unknown>) ?? {};
      const frequency = preferences.cadenceFrequency as string | undefined;

      if (!frequency) {
        return success({ contactId: id, cadence: null, message: 'No cadence set for this contact.' });
      }

      return success({
        contactId: id,
        frequency,
        escalationAfterMisses: preferences.escalationAfterMisses ?? 3,
        escalated: preferences.escalated ?? false,
      });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get cadence', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withRole(request, ['owner', 'admin', 'member'], () =>
    withContactScope(request, id, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = setCadenceSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const cadence = await setCadence(id, parsed.data.frequency, entityId);
        return success(cadence);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to set cadence';
        if (message.includes('not found')) {
          return error('NOT_FOUND', message, 404);
        }
        return error('INTERNAL_ERROR', message, 500);
      }
    })
  );
}
