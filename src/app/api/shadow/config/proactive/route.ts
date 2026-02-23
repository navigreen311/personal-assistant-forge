import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';

const updateProactiveConfigSchema = z.object({
  briefingEnabled: z.boolean().optional(),
  briefingTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .optional(),
  briefingChannel: z.enum(['in_app', 'push', 'sms', 'phone', 'email']).optional(),
  briefingContent: z.array(z.string()).optional(),
  callTriggers: z.record(z.unknown()).optional(),
  vipBreakoutContacts: z.array(z.string()).optional(),
  callWindowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .optional(),
  callWindowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .optional(),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .optional(),
  cooldownMinutes: z.number().int().min(0).optional(),
  maxCallsPerDay: z.number().int().min(0).optional(),
  maxCallsPerHour: z.number().int().min(0).optional(),
  digestEnabled: z.boolean().optional(),
  digestTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be in HH:MM format')
    .nullable()
    .optional(),
  escalationConfig: z.record(z.unknown()).nullable().optional(),
});

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, session) => {
    try {
      let config = await prisma.shadowProactiveConfig.findUnique({
        where: { userId: session.userId },
      });

      if (!config) {
        // Return default config without persisting
        config = {
          userId: session.userId,
          briefingEnabled: true,
          briefingTime: '08:00',
          briefingChannel: 'in_app',
          briefingContent: [],
          callTriggers: null,
          vipBreakoutContacts: [],
          callWindowStart: '09:00',
          callWindowEnd: '18:00',
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
          cooldownMinutes: 60,
          maxCallsPerDay: 5,
          maxCallsPerHour: 2,
          digestEnabled: false,
          digestTime: null,
          escalationConfig: null,
        };
      }

      return success(config);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to get proactive config',
        500
      );
    }
  });
}

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req, session) => {
    try {
      const body = await req.json();
      const parsed = updateProactiveConfigSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const config = await prisma.shadowProactiveConfig.upsert({
        where: { userId: session.userId },
        create: {
          userId: session.userId,
          ...parsed.data,
          briefingContent: parsed.data.briefingContent ?? [],
          vipBreakoutContacts: parsed.data.vipBreakoutContacts ?? [],
        },
        update: parsed.data,
      });

      return success(config);
    } catch (err) {
      return error(
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Failed to update proactive config',
        500
      );
    }
  });
}
