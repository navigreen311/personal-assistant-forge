import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { suggestLinks, applyLink } from '@/modules/knowledge/services/auto-linker';

const applyLinkSchema = z.object({
  targetId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const suggestions = await suggestLinks(id);
    return success(suggestions);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to get link suggestions', 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = applyLinkSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', parsed.error.message, 400);
    }

    await applyLink(id, parsed.data.targetId);
    return success({ linked: true }, 201);
  } catch (err) {
    return error('INTERNAL_ERROR', 'Failed to apply link', 500);
  }
}
