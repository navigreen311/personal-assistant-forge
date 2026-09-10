import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withEntityScope, withRole } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { getBrandKit, updateBrandKit } from '@/modules/documents/services/brand-kit-service';

const updateBrandKitSchema = z.object({
  // Optional on purpose: a client that omits it gets its session's active
  // entity. A client that sends one still has it verified before use.
  entityId: z.string().min(1).optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  logoUrl: z.string().optional(),
  fontFamily: z.string().optional(),
  headerTemplate: z.string().optional(),
  footerTemplate: z.string().optional(),
  watermark: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, _session, entityId) => {
    try {
      const brandKit = await getBrandKit(entityId);
      return success(brandKit);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}

export async function PUT(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], () =>
    withEntityScope(request, async (req, _session, entityId) => {
      try {
        const body = await req.json();
        const parsed = updateBrandKitSchema.safeParse(body);
        if (!parsed.success) return error('VALIDATION_ERROR', parsed.error.message, 400);

        // The caller's entityId is discarded: `entityId` from the scope wins.
        const { entityId: _requested, ...config } = parsed.data;
        const brandKit = await updateBrandKit(entityId, config);
        return success(brandKit);
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    })
  );
}
