import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth, verifyEntityForUser } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const querySchema = z.object({
  entityId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  // DELIBERATELY withAuth, not withEntityScope (tenancy pattern, section 5b).
  //
  // This is a genuine cross-entity rollup: with no ?entityId it means "the
  // whole of my VoiceForge", across every entity the caller owns.
  // withEntityScope resolves to exactly ONE entity, so adopting it here would
  // silently narrow the dashboard from "all my entities" to "my active entity"
  // -- a behaviour change no cross-tenant assertion would catch. Instead the
  // scope is the SET of entities proven to belong to session.userId, and a
  // named entity is proven with verifyEntityForUser before it is used.
  return withAuth(request, async (req, session) => {
    try {
      const params = Object.fromEntries(req.nextUrl.searchParams);
      const parsed = querySchema.safeParse(params);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { entityId } = parsed.data;

      let entityIds: string[];

      if (entityId) {
        const verified = await verifyEntityForUser(entityId, session.userId);
        if (!verified) {
          return error('NOT_FOUND', 'Entity not found or access denied', 404);
        }
        entityIds = [verified];
      } else {
        const entities = await prisma.entity.findMany({
          where: { userId: session.userId },
          select: { id: true },
        });

        entityIds = entities.map((e) => e.id);
      }

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const scope = { entityId: { in: entityIds } };

      // These were `(prisma as any).voiceCall`, `.voiceCampaign`,
      // `.phoneNumber`, `.voiceScript` -- delegates that are not in the
      // schema. Each threw, each was swallowed by a `safeCount` helper, and the
      // dashboard reported a confident 0 for every figure. The `as any` was
      // what let it compile. The real rows are `Call` and `Document` rows of
      // the DOC_TYPEs the VoiceForge services write.
      const [
        totalCalls,
        todayCalls,
        connectedCalls,
        campaignDocs,
        phoneNumbers,
        totalPersonas,
        totalScripts,
      ] = await Promise.all([
        prisma.call.count({ where: scope }),
        prisma.call.count({ where: { ...scope, createdAt: { gte: startOfToday } } }),
        prisma.call.count({
          where: { ...scope, outcome: { in: ['CONNECTED', 'INTERESTED'] } },
        }),
        // A campaign's live status lives in the serialised document body, not
        // in Document.status (campaign-service only rewrites `content`), so
        // this has to read rather than count.
        prisma.document.findMany({
          where: { ...scope, type: 'VOICE_CAMPAIGN' },
          select: { content: true },
        }),
        prisma.document.count({ where: { ...scope, type: 'MANAGED_NUMBER' } }),
        prisma.document.count({ where: { ...scope, type: 'VOICE_PERSONA' } }),
        prisma.document.count({ where: { ...scope, type: 'CALL_SCRIPT' } }),
      ]);

      const activeCampaigns = campaignDocs.filter((doc) => {
        try {
          return (JSON.parse(doc.content ?? '{}') as { status?: string }).status === 'ACTIVE';
        } catch {
          return false;
        }
      }).length;

      const connectRate = totalCalls > 0
        ? Math.round((connectedCalls / totalCalls) * 100 * 100) / 100
        : 0;

      const stats = {
        totalCalls,
        todayCalls,
        connectRate,
        activeCampaigns,
        phoneNumbers,
        totalPersonas,
        totalScripts,
      };

      return success(stats);
    } catch (err) {
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
