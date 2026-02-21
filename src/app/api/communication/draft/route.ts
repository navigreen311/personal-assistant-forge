import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';

const draftSchema = z.object({
  entityId: z.string().min(1),
  recipientId: z.string().min(1),
  channel: z.string().min(1),
  intent: z.string().min(1),
  powerDynamic: z.string().optional(),
  tone: z.string().optional(),
  context: z.string().optional(),
  complianceScan: z.boolean().optional().default(false),
  followUpReminder: z.boolean().optional().default(false),
});

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = draftSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const {
        entityId,
        recipientId,
        channel,
        intent,
        powerDynamic,
        tone,
        context,
        complianceScan,
      } = parsed.data;

      // Verify entity ownership
      const entity = await prisma.entity.findUnique({
        where: { id: entityId },
      });

      if (!entity) {
        return error('NOT_FOUND', 'Entity not found', 404);
      }

      if (entity.userId !== session.userId) {
        return error('FORBIDDEN', 'You do not have access to this entity', 403);
      }

      // Look up recipient name for context
      let recipientName = 'Recipient';
      try {
        const contact = await (prisma as any).contact.findUnique({
          where: { id: recipientId },
          select: { name: true },
        });
        if (contact) {
          recipientName = contact.name;
        }
      } catch {
        // Contact lookup failed; use default name
      }

      const resolvedTone = tone ?? 'professional';
      const resolvedPowerDynamic = powerDynamic ?? 'peer';
      const resolvedContext = context ?? '';

      // Generate 3 mock variants with distinct strategies
      const variants = [
        {
          id: `draft-${Date.now()}-1`,
          strategy: 'Push Back Gently',
          subject: `Re: ${intent}`,
          body: `Hi ${recipientName},\n\nThank you for reaching out regarding ${intent}. ${resolvedContext ? `Given the context of ${resolvedContext}, ` : ''}I appreciate your perspective on this matter. While I understand your position, I'd like to suggest we consider an alternative approach that might better serve both our interests.\n\nI'm happy to discuss this further at your convenience.\n\nBest regards`,
          tone: resolvedTone,
          powerDynamic: resolvedPowerDynamic,
          risk: 'low',
          complianceResult: complianceScan
            ? { passed: true, flags: [], scannedAt: new Date().toISOString() }
            : null,
        },
        {
          id: `draft-${Date.now()}-2`,
          strategy: 'Hold Firm',
          subject: `Re: ${intent}`,
          body: `Hi ${recipientName},\n\nThank you for your message about ${intent}. ${resolvedContext ? `Considering ${resolvedContext}, ` : ''}I've carefully reviewed the situation and believe our current direction is the right one. The rationale behind this decision is based on [key factors], and I'm confident this approach will yield the best outcomes.\n\nI'm open to addressing any specific concerns you may have.\n\nBest regards`,
          tone: resolvedTone,
          powerDynamic: resolvedPowerDynamic,
          risk: 'medium',
          complianceResult: complianceScan
            ? { passed: true, flags: [], scannedAt: new Date().toISOString() }
            : null,
        },
        {
          id: `draft-${Date.now()}-3`,
          strategy: 'Suggest Alternative',
          subject: `Re: ${intent} - Alternative Proposal`,
          body: `Hi ${recipientName},\n\nI appreciate you bringing up ${intent}. ${resolvedContext ? `With ${resolvedContext} in mind, ` : ''}I've been thinking about a different approach that could work well for everyone involved. What if we [alternative suggestion]? This would allow us to address the core concern while maintaining flexibility.\n\nWould you be open to exploring this direction? I'd love to set up a quick call to discuss.\n\nBest regards`,
          tone: resolvedTone,
          powerDynamic: resolvedPowerDynamic,
          risk: 'low',
          complianceResult: complianceScan
            ? { passed: true, flags: [], scannedAt: new Date().toISOString() }
            : null,
        },
      ];

      return success({ variants, channel, recipientId, recipientName });
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to generate draft variants',
        500
      );
    }
  });
}
