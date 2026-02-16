import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { setCadence } from '@/modules/communication/services/cadence-engine';

const setCadenceSchema = z.object({
  frequency: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY']),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const contact = await prisma.contact.findUnique({ where: { id } });
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
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = setCadenceSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const cadence = await setCadence(id, parsed.data.frequency);
    return success(cadence);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to set cadence';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
