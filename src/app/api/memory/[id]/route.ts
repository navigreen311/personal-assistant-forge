import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  recallMemory,
  updateMemory,
  deleteMemory,
} from '@/engines/memory/memory-service';

const UpdateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  type: z.enum(['SHORT_TERM', 'WORKING', 'LONG_TERM', 'EPISODIC']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // recallMemory also reinforces the memory on access
    const entry = await recallMemory(id);

    if (!entry) {
      return error('NOT_FOUND', `Memory ${id} not found`, 404);
    }

    return success(entry);
  } catch (err) {
    return error('INTERNAL_ERROR', (err as Error).message, 500);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = UpdateMemorySchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid request body', 400, {
        issues: parsed.error.issues,
      });
    }

    const updated = await updateMemory(id, parsed.data);
    return success(updated);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('Record to update not found')) {
      return error('NOT_FOUND', `Memory not found`, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteMemory(id);
    return success({ deleted: true });
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('not found') || message.includes('Record to delete does not exist')) {
      return error('NOT_FOUND', `Memory not found`, 404);
    }
    return error('INTERNAL_ERROR', message, 500);
  }
}
