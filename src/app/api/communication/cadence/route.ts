// ============================================================================
// GET /api/communication/cadence - Cadence data for contacts
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

// --- Validation Schema ---

const querySchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
});

// --- Cadence helpers ---

function getCadenceDays(frequency: string): number | null {
  switch (frequency) {
    case 'DAILY':
      return 1;
    case 'WEEKLY':
      return 7;
    case 'BIWEEKLY':
      return 14;
    case 'MONTHLY':
      return 30;
    case 'QUARTERLY':
      return 90;
    default:
      return null;
  }
}

function computeCadenceStatus(
  frequency: string,
  lastContactDate: Date | null
): string {
  if (!lastContactDate) return 'NO_CONTACT';

  const cadenceDays = getCadenceDays(frequency);
  if (cadenceDays === null) return 'UNKNOWN';

  const now = new Date();
  const daysSinceContact = Math.floor(
    (now.getTime() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceContact <= cadenceDays) return 'ON_TRACK';
  if (daysSinceContact <= cadenceDays * 1.5) return 'DUE_SOON';
  return 'OVERDUE';
}

// --- Handler ---

export async function GET(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId } = parsed.data;

      // Verify entity ownership
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
      });

      if (!entity) {
        return error('NOT_FOUND', 'Entity not found', 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      let contacts: Array<{
        id: string;
        name: string;
        entityName: string;
        cadenceFrequency: string;
        lastContactDate: string | null;
        status: string;
      }> = [];

      try {
        const rawContacts = await (prisma as any).contact.findMany({
          where: {
            entityId,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            preferences: true,
            lastTouch: true,
          },
        });

        for (const contact of rawContacts) {
          const prefs = (contact.preferences as Record<string, unknown>) ?? {};
          const cadenceFrequency = (prefs.cadenceFrequency as string) ?? null;

          // Only include contacts that have a cadence frequency set
          if (!cadenceFrequency) continue;

          const lastContactDate = contact.lastTouch
            ? new Date(contact.lastTouch)
            : null;

          contacts.push({
            id: contact.id,
            name: contact.name,
            entityName: entity.name,
            cadenceFrequency,
            lastContactDate: lastContactDate
              ? lastContactDate.toISOString()
              : null,
            status: computeCadenceStatus(cadenceFrequency, lastContactDate),
          });
        }
      } catch {
        // Contact model may not exist; return empty array
        contacts = [];
      }

      return success({ contacts });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to fetch cadence data',
        500
      );
    }
  });
}
