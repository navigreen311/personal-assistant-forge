import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import { getDecisionBrief } from '@/modules/decisions/services/decision-framework';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const brief = await getDecisionBrief(id);

    if (!brief) {
      return error('NOT_FOUND', 'Decision brief not found', 404);
    }

    return success(brief);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get decision brief', 500);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to archive decision brief', 500);
  }
}
