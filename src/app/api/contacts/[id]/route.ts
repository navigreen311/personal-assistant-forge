import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import {
  withAuth,
  withEntityScope,
  type VerifiedEntityId,
} from '@/shared/middleware/auth';
import type { AuthSession } from '@/lib/auth/types';


const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  channels: z.array(z.object({
    type: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']),
    handle: z.string().min(1),
  })).optional(),
  preferences: z.object({
    preferredChannel: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']).optional(),
    preferredTone: z.enum(['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE']).optional(),
    timezone: z.string().optional(),
    doNotContact: z.boolean().optional(),
  }).optional(),
  tags: z.array(z.string()).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * The entity of a contact is a property of the row, not of the request.
 *
 * Authenticate first -- an anonymous caller must never reach the database --
 * then read the owning entity id ONLY (no contact data crosses this line) and
 * let withEntityScope prove the caller owns it. See
 * docs/parallel-build/tenancy-pattern.md sec.4.
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
      const contact = await prisma.contact.findFirst({
        where: { id, entityId },
        include: {
          messages: { where: { entityId }, take: 10, orderBy: { createdAt: 'desc' } },
          calls: { where: { entityId }, take: 10, orderBy: { createdAt: 'desc' } },
        },
      });

      if (!contact) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      return success(contact);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get contact', 500);
    }
  });
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (req, _session, entityId) => {
    try {
      const body = await req.json();
      const parsed = updateContactSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const existing = await prisma.contact.findFirst({ where: { id, entityId } });
      if (!existing) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      const data = parsed.data;
      const updateData: Record<string, unknown> = {};

      if (data.name !== undefined) updateData.name = data.name;
      if (data.email !== undefined) updateData.email = data.email;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.channels !== undefined) updateData.channels = data.channels;
      if (data.tags !== undefined) updateData.tags = data.tags;
      if (data.preferences !== undefined) {
        const existingPrefs = (existing.preferences as Record<string, unknown>) ?? {};
        updateData.preferences = { ...existingPrefs, ...data.preferences };
      }

      // updateMany, because a unique WHERE cannot also carry the entity.
      const written = await prisma.contact.updateMany({
        where: { id, entityId },
        data: updateData,
      });
      if (written.count === 0) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      const updated = await prisma.contact.findFirst({ where: { id, entityId } });
      return success(updated);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update contact', 500);
    }
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  return withContactScope(request, id, async (_req, _session, entityId) => {
    try {
      const existing = await prisma.contact.findFirst({ where: { id, entityId } });
      if (!existing) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      // Soft-delete: mark doNotContact and add a deleted tag
      const existingPrefs = (existing.preferences as Record<string, unknown>) ?? {};
      const written = await prisma.contact.updateMany({
        where: { id, entityId },
        data: {
          preferences: { ...existingPrefs, doNotContact: true },
          tags: [...(existing.tags ?? []), '_deleted'],
        },
      });
      if (written.count === 0) {
        return error('NOT_FOUND', `Contact not found: ${id}`, 404);
      }

      return success({ deleted: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete contact', 500);
    }
  });
}
