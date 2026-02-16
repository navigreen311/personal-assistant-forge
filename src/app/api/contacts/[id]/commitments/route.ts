import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { addCommitment } from '@/modules/communication/services/commitment-tracker';
import type { Commitment } from '@/shared/types';

const addCommitmentSchema = z.object({
  description: z.string().min(1, 'description is required'),
  direction: z.enum(['TO', 'FROM']),
  status: z.enum(['OPEN', 'FULFILLED', 'BROKEN']).default('OPEN'),
  dueDate: z.string().datetime().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      return error('NOT_FOUND', `Contact not found: ${id}`, 404);
    }

    const commitments = (contact.commitments as unknown as Commitment[]) ?? [];
    return success(commitments);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Failed to get commitments', 500);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = addCommitmentSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const data = parsed.data;
    const commitment = await addCommitment(id, {
      description: data.description,
      direction: data.direction,
      status: data.status,
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
    });

    return success(commitment, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add commitment';
    if (message.includes('not found')) {
      return error('NOT_FOUND', message, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
