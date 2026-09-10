import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import {
  recallMemory,
  updateMemory,
  deleteMemory,
} from '@/engines/memory/memory-service';
import { withAuth, withRole } from '@/shared/middleware/auth';

// P-13 / tenancy-pattern.md 4 -- SINGLE-RECORD, USER-SCOPED.
//
// `MemoryEntry` has a `userId` and no `entityId` column, so the owning user is
// the scope. All three handlers used to pass the path id straight to a service
// that queried on `{ id }` alone, so any authenticated caller who knew a memory
// id could read it (and reinforce it), rewrite it, or delete it.
//
// The scope now lives in the WHERE clause inside the service, so a foreign row
// is not found rather than checked -- there is no check left to forget.

const UpdateMemorySchema = z.object({
  content: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  type: z.enum(['SHORT_TERM', 'WORKING', 'LONG_TERM', 'EPISODIC']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, session) => {
    try {
      const { id } = await params;
      // recallMemory also reinforces the memory on access
      const entry = await recallMemory(id, session.userId);

      if (!entry) {
        return error('NOT_FOUND', `Memory ${id} not found`, 404);
      }

      return success(entry);
    } catch (err) {
      return error('INTERNAL_ERROR', (err as Error).message, 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, session) => {
    try {
      const { id } = await params;
      const body = await req.json();
      const parsed = UpdateMemorySchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const updated = await updateMemory(id, session.userId, parsed.data);
      return success(updated);
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found') || message.includes('Record to update not found')) {
        return error('NOT_FOUND', `Memory not found`, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withRole(request, ['owner', 'admin'], async (_req, session) => {
    try {
      const { id } = await params;
      await deleteMemory(id, session.userId);
      return success({ deleted: true });
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('not found') || message.includes('Record to delete does not exist')) {
        return error('NOT_FOUND', `Memory not found`, 404);
      }
      return error('INTERNAL_ERROR', message, 500);
    }
  });
}
