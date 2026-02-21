import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { getDecisionBrief } from '@/modules/decisions/services/decision-framework';

const UpdateDecisionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).optional(),
  context: z.string().min(1).optional(),
  deadline: z.string().datetime().optional(),
  stakeholders: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  blastRadius: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const brief = await getDecisionBrief(id);

      if (!brief) {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      return success(brief);
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to get decision brief', 500);
    }
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (req, _session) => {
    try {
      const { id } = await params;
      const doc = await prisma.document.findUnique({ where: { id } });

      if (!doc || doc.type !== 'BRIEF') {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      const body = await req.json();
      const parsed = UpdateDecisionSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid request body', 400, {
          issues: parsed.error.issues,
        });
      }

      const updates = parsed.data;
      const existingContent = doc.content ? JSON.parse(doc.content) : {};

      const updatedContent = {
        ...existingContent,
        request: {
          ...existingContent.request,
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.context !== undefined && { context: updates.context }),
          ...(updates.deadline !== undefined && { deadline: updates.deadline }),
          ...(updates.stakeholders !== undefined && { stakeholders: updates.stakeholders }),
          ...(updates.constraints !== undefined && { constraints: updates.constraints }),
          ...(updates.blastRadius !== undefined && { blastRadius: updates.blastRadius }),
        },
      };

      const updated = await prisma.document.update({
        where: { id },
        data: {
          ...(updates.title !== undefined && { title: updates.title }),
          ...(updates.status !== undefined && { status: updates.status }),
          content: JSON.stringify(updatedContent),
        },
      });

      return success({
        id: updated.id,
        title: updated.title,
        status: updated.status,
        updatedAt: updated.updatedAt,
      });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to update decision brief', 500);
    }
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withAuth(request, async (_req, _session) => {
    try {
      const { id } = await params;
      const doc = await prisma.document.findUnique({ where: { id } });

      if (!doc || doc.type !== 'BRIEF') {
        return error('NOT_FOUND', 'Decision brief not found', 404);
      }

      await prisma.document.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });

      return success({ id, archived: true });
    } catch (_err) {
      return error('INTERNAL_ERROR', 'Failed to archive decision brief', 500);
    }
  });
}
