import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

const bulkActionSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1, 'At least one contactId is required'),
  action: z.enum(['tag', 'setCadence', 'changeEntity', 'delete']),
  data: z.any().optional(),
});

const tagDataSchema = z.object({
  tags: z.array(z.string().min(1)).min(1, 'At least one tag is required'),
});

const setCadenceDataSchema = z.object({
  cadenceDays: z.number().int().positive('cadenceDays must be a positive integer'),
});

const changeEntityDataSchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = bulkActionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const { contactIds, action, data } = parsed.data;

      // Validate all contactIds belong to user's entities
      const userEntities = await prisma.entity.findMany({
        where: { userId: session.userId },
        select: { id: true },
      });
      const userEntityIds = new Set(userEntities.map((e) => e.id));

      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          deletedAt: null,
        },
        select: { id: true, entityId: true, tags: true, preferences: true },
      });

      // Filter to only contacts belonging to user's entities
      const validContacts = contacts.filter((c) => userEntityIds.has(c.entityId));
      const validIds = validContacts.map((c) => c.id);
      const failedCount = contactIds.length - validIds.length;

      if (validIds.length === 0) {
        return error('VALIDATION_ERROR', 'No valid contacts found for the given IDs', 400);
      }

      let updated = 0;

      switch (action) {
        case 'tag': {
          const tagParsed = tagDataSchema.safeParse(data);
          if (!tagParsed.success) {
            return error('VALIDATION_ERROR', 'Invalid tag data', 400, {
              issues: tagParsed.error.issues,
            });
          }
          const newTags = tagParsed.data.tags;

          // Merge tags per contact to avoid duplicates
          for (const contact of validContacts) {
            const existingTags = Array.isArray(contact.tags) ? contact.tags : [];
            const mergedTags = [...new Set([...existingTags, ...newTags])];
            await prisma.contact.update({
              where: { id: contact.id },
              data: { tags: mergedTags },
            });
            updated++;
          }
          break;
        }

        case 'setCadence': {
          const cadenceParsed = setCadenceDataSchema.safeParse(data);
          if (!cadenceParsed.success) {
            return error('VALIDATION_ERROR', 'Invalid cadence data', 400, {
              issues: cadenceParsed.error.issues,
            });
          }
          const { cadenceDays } = cadenceParsed.data;

          for (const contact of validContacts) {
            const existingPrefs =
              contact.preferences && typeof contact.preferences === 'object'
                ? (contact.preferences as Record<string, unknown>)
                : {};
            const updatedPrefs = { ...existingPrefs, cadenceDays };
            await prisma.contact.update({
              where: { id: contact.id },
              data: { preferences: updatedPrefs },
            });
            updated++;
          }
          break;
        }

        case 'changeEntity': {
          const entityParsed = changeEntityDataSchema.safeParse(data);
          if (!entityParsed.success) {
            return error('VALIDATION_ERROR', 'Invalid entity data', 400, {
              issues: entityParsed.error.issues,
            });
          }
          const targetEntityId = entityParsed.data.entityId;

          // Verify user owns target entity
          if (!userEntityIds.has(targetEntityId)) {
            return error('FORBIDDEN', 'You do not have access to the target entity', 403);
          }

          const result = await prisma.contact.updateMany({
            where: { id: { in: validIds } },
            data: { entityId: targetEntityId },
          });
          updated = result.count;
          break;
        }

        case 'delete': {
          const result = await prisma.contact.updateMany({
            where: { id: { in: validIds } },
            data: { deletedAt: new Date() },
          });
          updated = result.count;
          break;
        }
      }

      return success({ updated, failed: failedCount });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to perform bulk operation',
        500
      );
    }
  });
}
