import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error, paginated } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';


const createContactSchema = z.object({
  entityId: z.string().min(1, 'entityId is required'),
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
  return withAuth(request, async (req, _session) => {
    try {
      const { searchParams } = new URL(req.url);
      const entityId = searchParams.get('entityId');
      const tags = searchParams.get('tags');
      const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '20', 10)));

      const where: Record<string, unknown> = {};
      if (entityId) where.entityId = entityId;
      if (tags) {
        where.tags = { hasSome: tags.split(',').map((t) => t.trim()) };
      }

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
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = createContactSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const data = parsed.data;

      // Verify entity exists
      const entity = await prisma.entity.findUnique({ where: { id: data.entityId } });
      if (!entity) {
        return error('NOT_FOUND', `Entity not found: ${data.entityId}`, 404);
      }

      const contact = await prisma.contact.create({
        data: {
          entityId: data.entityId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          channels: data.channels,
          preferences: data.preferences,
          tags: data.tags,
        },
      });

      return success(contact, 201);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to create contact', 500);
    }
  });
}
