import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withEntityScope, withRole } from '@/shared/middleware/auth';


const createContactSchema = z.object({
  // Optional: withEntityScope resolves and verifies the entity, so a client
  // that names none gets its own active entity rather than a 400.
  entityId: z.string().min(1).optional(),
  name: z.string().min(1, 'name is required'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  channels: z.array(z.object({
    type: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']),
    handle: z.string().min(1),
  })).default([]),
  preferences: z.object({
    preferredChannel: z.enum(['EMAIL', 'SMS', 'SLACK', 'TEAMS', 'DISCORD', 'WHATSAPP', 'TELEGRAM', 'VOICE', 'MANUAL']).default('EMAIL'),
    preferredTone: z.enum(['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE']).default('DIRECT'),
    timezone: z.string().optional(),
    doNotContact: z.boolean().default(false),
  }).default({ preferredChannel: 'EMAIL' as const, preferredTone: 'DIRECT' as const, doNotContact: false }),
  tags: z.array(z.string()).default([]),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (req, _session, entityId) => {
    try {
      const { searchParams } = new URL(req.url);
      const tags = searchParams.get('tags');
      const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));

      const where: Record<string, unknown> = {};
      if (tags) {
        where.tags = { hasSome: tags.split(',').map((t) => t.trim()) };
      }

      // The scope, applied last and unconditionally. Previously `entityId` was
      // read off the query string and applied only `if (entityId)` -- omitting
      // it listed every contact in the database.
      where.entityId = entityId;

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
        }),
        prisma.contact.count({ where }),
      ]);

      return paginated(contacts, total, page, pageSize);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to list contacts', 500);
    }
  });
}

export async function POST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = createContactSchema.safeParse(body);

        if (!parsed.success) {
          return error('VALIDATION_ERROR', 'Invalid request body', 400, {
            issues: parsed.error.issues,
          });
        }

        const data = parsed.data;

        // The entity has already been proven to belong to the caller by
        // withEntityScope; the "verify entity exists" lookup that stood here
        // checked existence and nothing else.
        const contact = await prisma.contact.create({
          data: {
            name: data.name,
            email: data.email,
            phone: data.phone,
            channels: data.channels,
            preferences: data.preferences,
            tags: data.tags,
            // Last, deliberately: it overwrites whatever the caller sent.
            entityId,
          },
        });

        return success(contact, 201);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create contact', 500);
      }
    })
  );
}
