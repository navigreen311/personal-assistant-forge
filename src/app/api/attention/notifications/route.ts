import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';

// P-19: the `prisma` import and the `safeQuery` helper were both here only to
// serve the two dead `notificationPreference` calls removed below. Nothing else
// in this route touches the database.

/** Default notification preferences returned when no data exists. */
function getDefaultPreferences() {
  return {
    channels: {
      email: { enabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' },
      push: { enabled: true, quietHoursStart: '22:00', quietHoursEnd: '08:00' },
      sms: { enabled: false, quietHoursStart: '22:00', quietHoursEnd: '08:00' },
      inApp: { enabled: true, quietHoursStart: null, quietHoursEnd: null },
    },
    moduleRules: [
      { module: 'tasks', level: 'all', description: 'Task assignments and status changes' },
      { module: 'calendar', level: 'important', description: 'Upcoming meetings and schedule changes' },
      { module: 'communications', level: 'important', description: 'Priority messages and mentions' },
      { module: 'finance', level: 'critical', description: 'Payment due dates and anomalies' },
      { module: 'attention', level: 'all', description: 'Focus session reminders and DND alerts' },
    ],
  };
}

export async function GET(request: NextRequest) {
  return withAuth(request, async (_req, _session) => {
    try {
      // P-19: this read `(prisma as any).notificationPreference.findUnique(...)`
      // inside `safeQuery`. **There is no `NotificationPreference` model in the
      // schema** -- `prisma.notificationPreference` is `undefined`, so the call
      // threw `Cannot read properties of undefined (reading 'findUnique')` on
      // every request (verified against a real Postgres on this schema) and the
      // swallowed result meant the `if (prefs)` branch has never once run.
      // Every caller has always received the constants below. Removing the dead
      // read changes nothing about the response; it only stops the route
      // claiming to consult a table that does not exist.
      //
      // FLAGGED TO THE COORDINATOR: real per-user notification preferences need
      // a `NotificationPreference` model, i.e. a migration -- out of scope for
      // a frozen-schema run.
      return success(getDefaultPreferences());
    } catch {
      // Outer safety net: always return demo data
      return success(getDefaultPreferences());
    }
  });
}

const updatePrefsSchema = z.object({
  channels: z
    .record(
      z.string(),
      z.object({
        enabled: z.boolean().optional(),
        quietHoursStart: z.string().nullable().optional(),
        quietHoursEnd: z.string().nullable().optional(),
      }),
    )
    .optional(),
  moduleRules: z
    .array(
      z.object({
        module: z.string(),
        level: z.enum(['all', 'important', 'critical', 'none']),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export async function PUT(request: NextRequest) {
  return withAuth(request, async (req, _session) => {
    try {
      const body = await req.json();
      const parsed = updatePrefsSchema.safeParse(body);
      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      // P-19: the upsert that stood here targeted the same non-existent
      // `NotificationPreference` model and was swallowed the same way, so this
      // endpoint has never persisted anything.
      //
      // NOTE, DELIBERATELY NOT CHANGED HERE: the response below still says
      // "updated". It is not true -- nothing is written -- but the message is
      // part of the response contract and rewriting it is a behaviour change,
      // not a lint fix. Raised in the PR for a follow-up package alongside the
      // model itself.
      return success({ message: 'Notification preferences updated', ...parsed.data });
    } catch {
      // Even on total failure, confirm acceptance
      return success({ message: 'Notification preferences accepted (pending persistence)' });
    }
  });
}
