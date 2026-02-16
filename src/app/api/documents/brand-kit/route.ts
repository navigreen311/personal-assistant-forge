import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { getBrandKit, updateBrandKit } from '@/modules/documents/services/brand-kit-service';

const updateBrandKitSchema = z.object({
  entityId: z.string().min(1),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  logoUrl: z.string().optional(),
  fontFamily: z.string().optional(),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  watermark: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const entityId = request.nextUrl.searchParams.get('entityId');
    if (!entityId) return error('VALIDATION_ERROR', 'entityId is required', 400);

    const brandKit = await getBrandKit(entityId);
    return success(brandKit);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = updateBrandKitSchema.safeParse(body);
    if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

    const { entityId, ...config } = parsed.data;
    const brandKit = await updateBrandKit(entityId, config);
    return success(brandKit);
  } catch (err) {
    return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
  }
}
