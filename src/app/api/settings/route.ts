import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/shared/middleware/auth';
import { success, error } from '@/shared/utils/api-response';
import { prisma } from '@/lib/db';
import type { AuthSession } from '@/lib/auth/types';

// --- Types ---

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  timezone: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  notifications: {
    email: boolean;
    push: boolean;
    sms: boolean;
    digest: 'daily' | 'weekly' | 'none';
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
  accessibility: {
    reduceMotion: boolean;
    highContrast: boolean;
    fontSize: 'small' | 'medium' | 'large';
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  timezone: 'America/New_York',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  notifications: {
    email: true,
    push: true,
    sms: false,
    digest: 'daily',
  },
  accessibility: {
    reduceMotion: false,
    highContrast: false,
    fontSize: 'medium',
  },
};

// --- Validation ---

const notificationsSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
  digest: z.enum(['daily', 'weekly', 'none']).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm format').optional(),
}).optional();

const accessibilitySchema = z.object({
  reduceMotion: z.boolean().optional(),
  highContrast: z.boolean().optional(),
  fontSize: z.enum(['small', 'medium', 'large']).optional(),
}).optional();

const settingsUpdateSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().min(2).max(10).optional(),
  timezone: z.string().min(1).optional(),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
  timeFormat: z.enum(['12h', '24h']).optional(),
  notifications: notificationsSchema,
  accessibility: accessibilitySchema,
});

// --- Helpers ---

function parseStoredSettings(preferences: unknown): UserSettings {
  if (!preferences || typeof preferences !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }

  const prefs = preferences as Record<string, unknown>;
  const settings = prefs.settings as Partial<UserSettings> | undefined;

  if (!settings || typeof settings !== 'object') {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    theme: (['light', 'dark', 'system'].includes(settings.theme as string)
      ? settings.theme
      : DEFAULT_SETTINGS.theme) as UserSettings['theme'],
    language: (typeof settings.language === 'string' ? settings.language : DEFAULT_SETTINGS.language),
    timezone: (typeof settings.timezone === 'string' ? settings.timezone : DEFAULT_SETTINGS.timezone),
    dateFormat: (['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'].includes(settings.dateFormat as string)
      ? settings.dateFormat
      : DEFAULT_SETTINGS.dateFormat) as UserSettings['dateFormat'],
    timeFormat: (['12h', '24h'].includes(settings.timeFormat as string)
      ? settings.timeFormat
      : DEFAULT_SETTINGS.timeFormat) as UserSettings['timeFormat'],
    notifications: {
      ...DEFAULT_SETTINGS.notifications,
      ...(typeof settings.notifications === 'object' && settings.notifications
        ? settings.notifications
        : {}),
    },
    accessibility: {
      ...DEFAULT_SETTINGS.accessibility,
      ...(typeof settings.accessibility === 'object' && settings.accessibility
        ? settings.accessibility
        : {}),
    },
  };
}

function mergeSettings(current: UserSettings, updates: Partial<UserSettings>): UserSettings {
  return {
    ...current,
    ...updates,
    notifications: {
      ...current.notifications,
      ...(updates.notifications ?? {}),
    },
    accessibility: {
      ...current.accessibility,
      ...(updates.accessibility ?? {}),
    },
  };
}

// --- Handlers ---

async function handleGet(_req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { preferences: true },
    });

    const settings = parseStoredSettings(user?.preferences);
    return success(settings);
  } catch (err) {
    console.error('[settings] GET error:', err);
    return error('INTERNAL_ERROR', 'Failed to load settings', 500);
  }
}

async function handlePatch(req: NextRequest, session: AuthSession): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = settingsUpdateSchema.safeParse(body);

    if (!parsed.success) {
      return error('VALIDATION_ERROR', 'Invalid settings data', 400, {
        issues: parsed.error.issues,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { preferences: true },
    });

    const currentSettings = parseStoredSettings(user?.preferences);
    const updatedSettings = mergeSettings(currentSettings, parsed.data as Partial<UserSettings>);

    const existingPrefs = (user?.preferences && typeof user.preferences === 'object'
      ? user.preferences
      : {}) as Record<string, unknown>;

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        preferences: { ...existingPrefs, settings: updatedSettings } as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    return success(updatedSettings);
  } catch (err) {
    console.error('[settings] PATCH error:', err);
    return error('INTERNAL_ERROR', 'Failed to update settings', 500);
  }
}

// --- Route Exports ---

export async function GET(req: NextRequest): Promise<Response> {
  return withAuth(req, handleGet);
}

export async function PATCH(req: NextRequest): Promise<Response> {
  return withAuth(req, handlePatch);
}
