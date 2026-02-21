import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { getCrisisById, updateCrisis } from '@/modules/crisis/services/detection-service';

const updateCrisisSchema = z.object({
  status: z.enum(['DETECTED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'MITIGATED', 'RESOLVED', 'POST_MORTEM']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisById(id);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);
      return success(crisis);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisById(id);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);

      const body = await req.json();
      const parsed = updateCrisisSchema.safeParse(body);
      if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

      const updates = parsed.data;
      if (updates.status !== undefined) crisis.status = updates.status;
      if (updates.severity !== undefined) crisis.severity = updates.severity;
      if (updates.title !== undefined) crisis.title = updates.title;
      if (updates.description !== undefined) crisis.description = updates.description;

      if (updates.status === 'ACKNOWLEDGED' && !crisis.acknowledgedAt) {
        crisis.acknowledgedAt = new Date();
      }
      if (updates.status === 'RESOLVED' && !crisis.resolvedAt) {
        crisis.resolvedAt = new Date();
      }

      updateCrisis(crisis);
      return success(crisis);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, session) => {
    try {
      const { id } = await params;
      const crisis = getCrisisById(id);
      if (!crisis) return error('NOT_FOUND', 'Crisis not found', 404);

      crisis.status = 'RESOLVED';
      crisis.resolvedAt = crisis.resolvedAt ?? new Date();
      updateCrisis(crisis);

      return success({ id, archived: true });
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
