import { NextRequest } from 'next/server';
import { success, error } from '@/shared/utils/api-response';
import { withEntityScope } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import * as medicalService from '@/modules/health/services/medical-service';
import * as wearableService from '@/modules/health/services/wearable-service';

/**
 * WHAT CHANGED HERE, AND WHY IT MATTERS MORE THAN THE TENANCY FIX
 *
 * This handler used to read seven Prisma delegates that are not in the schema --
 * `energyLog`, `sleepLog`, `activityLog`, `stressLog`, `appointment`,
 * `medicationReminder`, `wearableConnection` -- through `(prisma as any)`, each
 * wrapped in a `safeQuery` that swallowed the "delegate is undefined" TypeError
 * and returned a hardcoded default. Every call threw, every default was
 * returned, and the page rendered `energyLevel: 7`, `sleepHours: 7.2`,
 * `stepsToday: 4320`, `stressLevel: 'low'` for every user on every request.
 *
 * That is invented medical data presented as measurement. The tenancy audit
 * called fabricated data the most operationally dangerous finding in this repo,
 * and a fabricated PHI dashboard is the sharpest version of it: a reading of
 * "4320 steps, stress low" is something a person could act on.
 *
 * It now reads the models that actually exist -- `HealthMetric` and `Document`,
 * both entity-scoped -- and reports `null` where there is no measurement.
 * Absent data reads as absent.
 */

/** The most recent reading of a metric type, or null when there is none. */
async function latestValue(entityId: string, type: string): Promise<number | null> {
  const row = await prisma.healthMetric.findFirst({
    where: { entityId, type },
    orderBy: { recordedAt: 'desc' },
    select: { value: true },
  });
  return row?.value ?? null;
}

function describeStress(level: number | null): string | null {
  if (level === null) return null;
  if (level >= 80) return 'high';
  if (level >= 50) return 'moderate';
  return 'low';
}

export async function GET(request: NextRequest) {
  return withEntityScope(request, async (_req, session, entityId) => {
    try {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const [energyLevel, sleepHours, stressScore] = await Promise.all([
        latestValue(entityId, 'energy'),
        latestValue(entityId, 'sleep'),
        latestValue(entityId, 'stress'),
      ]);

      // Steps are cumulative for the day rather than a latest reading.
      const stepsAggregate = await prisma.healthMetric.aggregate({
        where: { entityId, type: 'steps', recordedAt: { gte: startOfToday } },
        _sum: { value: true },
      });
      const stepsToday = stepsAggregate._sum.value ?? null;

      const [upcomingAppointments, medicationReminders, connections] = await Promise.all([
        medicalService.getUpcomingAppointments(entityId, session.userId, 30),
        medicalService.getMedicationReminders(entityId, session.userId),
        wearableService.getConnections(entityId, session.userId),
      ]);

      const connected = connections.filter((c) => c.isConnected);
      const wearableLastSync = connected.reduce<Date | null>(
        (latest, c) =>
          c.lastSyncAt && (!latest || c.lastSyncAt > latest) ? c.lastSyncAt : latest,
        null
      );

      return success({
        energyLevel,
        sleepHours,
        stepsToday,
        stressLevel: describeStress(stressScore),
        upcomingAppointments: upcomingAppointments.slice(0, 5),
        medicationReminders,
        wearableConnected: connected.length > 0,
        wearableLastSync: wearableLastSync?.toISOString() ?? null,
      });
    } catch (err) {
      // A real failure is reported as a failure. It is not dressed up as data.
      return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
    }
  });
}
