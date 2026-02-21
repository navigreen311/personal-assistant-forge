import { NextRequest } from 'next/server';
import { z } from 'zod/v4';
import { prisma } from '@/lib/db';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

export async function GET(req: NextRequest) {
  return withAuth(req, async (_req, session) => {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { entities: true },
    });

    if (!user) {
      return error('NOT_FOUND', 'User not found', 404);
    }

    // Strip hashedPassword from preferences before returning
    const prefs = user.preferences as Record<string, unknown>;
    const { hashedPassword: _hashedPassword, ...safePrefs } = prefs;

    return success({
      id: user.id,
      name: user.name,
      email: user.email,
      preferences: safePrefs,
      timezone: user.timezone,
      chronotype: user.chronotype,
      entityIds: user.entities.map((entity: { id: string }) => entity.id),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  });
}

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  timezone: z.string().optional(),
  chronotype: z.enum(['EARLY_BIRD', 'NIGHT_OWL', 'FLEXIBLE']).optional(),
  preferences: z
    .object({
      defaultTone: z.enum(['FIRM', 'DIPLOMATIC', 'WARM', 'DIRECT', 'CASUAL', 'FORMAL', 'EMPATHETIC', 'AUTHORITATIVE']).optional(),
      attentionBudget: z.number().int().min(1).max(100).optional(),
      focusHours: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
      vipContacts: z.array(z.string()).optional(),
      meetingFreedays: z.array(z.number().int().min(0).max(6)).optional(),
      autonomyLevel: z.enum(['SUGGEST', 'DRAFT', 'EXECUTE_WITH_APPROVAL', 'EXECUTE_AUTONOMOUS']).optional(),
    })
    .optional(),
});

export async function PATCH(req: NextRequest) {
  return withAuth(req, async (_req, session) => {
    try {
      const body = await req.json();
      const parsed = updateProfileSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', 'Invalid input', 400, {
          fields: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        });
      }

      const { name, timezone, chronotype, preferences } = parsed.data;

      // Build update data
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (chronotype !== undefined) updateData.chronotype = chronotype;

      if (preferences) {
        // Merge with existing preferences (preserving hashedPassword)
        const existingUser = await prisma.user.findUnique({ where: { id: session.userId } });
        const existingPrefs = (existingUser?.preferences as Record<string, unknown>) ?? {};
        updateData.preferences = { ...existingPrefs, ...preferences };
      }

      const user = await prisma.user.update({
        where: { id: session.userId },
        data: updateData,
        include: { entities: true },
      });

      const prefs = user.preferences as Record<string, unknown>;
      const { hashedPassword: _hashedPassword, ...safePrefs } = prefs;

      return success({
        id: user.id,
        name: user.name,
        email: user.email,
        preferences: safePrefs,
        timezone: user.timezone,
        chronotype: user.chronotype,
        entityIds: user.entities.map((entity: { id: string }) => entity.id),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (err) {
      console.error('Profile update error:', err);
      return error('INTERNAL_ERROR', 'An unexpected error occurred', 500);
    }
  });
}
