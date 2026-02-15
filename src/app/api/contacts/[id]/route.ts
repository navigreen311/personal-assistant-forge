import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';

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

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const contact = await prisma.contact.findUnique({
      where: { id },
      include: { messages: { take: 10, orderBy: { createdAt: 'desc' } }, calls: { take: 10, orderBy: { createdAt: 'desc' } } },
    });

    if (!contact) {
      return error('NOT_FOUND', `Contact not found: ${id}`, 404);
    }

    return success(contact);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get contact', 500);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateContactSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const existing = await prisma.contact.findUnique({ where: { id } });
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

    const updated = await prisma.contact.update({
      where: { id },
      data: updateData,
    });

    return success(updated);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to update contact', 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = await prisma.contact.findUnique({ where: { id } });
    if (!existing) {
      return error('NOT_FOUND', `Contact not found: ${id}`, 404);
    }

    // Soft-delete: mark doNotContact and add a deleted tag
    const existingPrefs = (existing.preferences as Record<string, unknown>) ?? {};
    await prisma.contact.update({
      where: { id },
      data: {
        preferences: { ...existingPrefs, doNotContact: true },
        tags: [...(existing.tags ?? []), '_deleted'],
      },
    });

    return success({ deleted: true });
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to delete contact', 500);
  }
}
