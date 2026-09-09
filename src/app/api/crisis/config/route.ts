import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuditedAuth } from '@/modules/security/audit-wiring';
import { configure, getStatus } from '@/modules/crisis/services/dead-man-switch-service';

/** Demo dead-man-switch protocols. */
function getDefaultProtocols() {
  return [
    { step: 1, contact: 'Primary Emergency Contact', delayHours: 0 },
    { step: 2, contact: 'Secondary Emergency Contact', delayHours: 6 },
    { step: 3, contact: 'Legal Representative', delayHours: 12 },
  ];
}

/** Demo phone tree contacts. */
function getDefaultPhoneTree() {
  return [
    { id: 'pt-1', name: 'Sarah Chen', role: 'Chief of Staff', phone: '+1-555-0101', email: 'sarah@example.com', order: 1 },
    { id: 'pt-2', name: 'Marcus Rivera', role: 'Legal Counsel', phone: '+1-555-0102', email: 'marcus@example.com', order: 2 },
    { id: 'pt-3', name: 'Aisha Patel', role: 'Operations Lead', phone: '+1-555-0103', email: 'aisha@example.com', order: 3 },
  ];
}

/** Demo escalation rules. */
function getDefaultEscalationRules() {
  return [
    { id: 'esc-1', condition: 'Severity >= CRITICAL', enabled: true },
    { id: 'esc-2', condition: 'No response within 30 minutes', enabled: true },
    { id: 'esc-3', condition: 'Multiple crises within 24 hours', enabled: true },
    { id: 'esc-4', condition: 'Financial impact > $10,000', enabled: true },
  ];
}

/** Demo war room defaults. */
function getDefaultWarRoomDefaults() {
  return {
    clearCalendar: true,
    surfaceDocs: true,
    draftComms: true,
    setDND: true,
    logActions: true,
    notifyPhoneTree: true,
  };
}

/** Full default crisis configuration. */
function getDefaultConfig() {
  return {
    deadManSwitch: {
      enabled: true,
      intervalHours: 24,
      triggerAfterMisses: 3,
      lastCheckIn: null as string | null,
      protocols: getDefaultProtocols(),
    },
    phoneTree: getDefaultPhoneTree(),
    escalationRules: getDefaultEscalationRules(),
    warRoomDefaults: getDefaultWarRoomDefaults(),
  };
}

/**
 * P-10/T-026. This read `(prisma as any).crisisConfig.findUnique(...)` inside a
 * `safeQuery` that swallowed every error. **There is no `CrisisConfig` model in
 * the schema**, so that call threw on every single request and the route
 * returned the demo constants above, every time, silently -- the same failure
 * shape as the `shadow/compliance` delegates the audit found, and invisible for
 * exactly the same reason. Removing it changes no behaviour whatsoever; it just
 * stops the code claiming to consult a store that does not exist, and removes
 * an `as any` from `src/`.
 *
 * The dead-man-switch half is now real (see /api/crisis/dead-man-switch), so it
 * is read from `DeadManSwitch` rather than invented. Phone tree, escalation
 * rules and war-room defaults have no table in the frozen schema and are still
 * defaults -- now labelled as such in the response instead of presented as
 * saved configuration. Flagged to the coordinator; they need models.
 */
export async function GET(request: NextRequest) {
  return withAuditedAuth(
    request,
    { resource: 'crisis.config' },
    async (req, session) => {
      const defaults = getDefaultConfig();

      let deadManSwitch = defaults.deadManSwitch;
      let deadManSwitchIsReal = false;
      try {
        const stored = await getStatus(session.userId);
        deadManSwitch = {
          enabled: stored.isEnabled,
          intervalHours: stored.checkInIntervalHours,
          triggerAfterMisses: stored.triggerAfterMisses,
          lastCheckIn: stored.lastCheckIn.toISOString(),
          protocols: stored.protocols.map((p) => ({
            step: p.order,
            contact: p.contactName,
            delayHours: p.delayHoursAfterTrigger,
          })),
        };
        deadManSwitchIsReal = true;
      } catch {
        // Not configured for this user. The defaults stand, and `placeholder`
        // below says so rather than letting them read as saved settings.
      }

      return success({
        deadManSwitch,
        phoneTree: defaults.phoneTree,
        escalationRules: defaults.escalationRules,
        warRoomDefaults: defaults.warRoomDefaults,
        placeholder: {
          deadManSwitch: !deadManSwitchIsReal,
          phoneTree: true,
          escalationRules: true,
          warRoomDefaults: true,
        },
      });
    },
  );
}

const updateConfigSchema = z.object({
  deadManSwitch: z
    .object({
      enabled: z.boolean().optional(),
      intervalHours: z.number().min(1).optional(),
      triggerAfterMisses: z.number().min(1).optional(),
      lastCheckIn: z.string().nullable().optional(),
      protocols: z
        .array(
          z.object({
            step: z.number(),
            contact: z.string(),
            delayHours: z.number(),
          }),
        )
        .optional(),
    })
    .optional(),
  phoneTree: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        role: z.string(),
        phone: z.string(),
        email: z.string(),
        order: z.number(),
      }),
    )
    .optional(),
  escalationRules: z
    .array(
      z.object({
        id: z.string(),
        condition: z.string(),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  warRoomDefaults: z
    .object({
      clearCalendar: z.boolean().optional(),
      surfaceDocs: z.boolean().optional(),
      draftComms: z.boolean().optional(),
      setDND: z.boolean().optional(),
      logActions: z.boolean().optional(),
      notifyPhoneTree: z.boolean().optional(),
    })
    .optional(),
});

/**
 * P-10/T-026. This validated the body, called
 * `(prisma as any).crisisConfig.upsert(...)` inside a `safeQuery` that swallowed
 * the error -- against a model that DOES NOT EXIST -- and then returned
 * `{ message: 'Crisis configuration updated' }`. Every save silently discarded
 * everything and reported success. A user who set their emergency phone tree
 * was told it was saved and it never was; they would find out during a crisis.
 *
 * Now: the dead-man-switch half is persisted for real, through the same
 * `DeadManSwitch` model the rest of T-015 uses. The other three sections have no
 * table in the frozen schema, so they are reported as NOT persisted rather than
 * confirmed. A refusal a user can see beats a success they cannot verify.
 */
export async function PUT(request: NextRequest) {
  return withAuditedAuth(
    request,
    { resource: 'crisis.config', sensitivityLevel: 'CONFIDENTIAL' },
    async (req, session) => {
      try {
        const body = await req.json();
        const parsed = updateConfigSchema.safeParse(body);
        if (!parsed.success) {
          return error('VALIDATION_ERROR', parsed.error.message, 400);
        }

        const persisted: string[] = [];
        const notPersisted: string[] = [];

        const dms = parsed.data.deadManSwitch;
        if (dms) {
          // Merge onto what is already stored so a partial update does not
          // silently reset the fields it did not mention.
          let current: Awaited<ReturnType<typeof getStatus>> | null = null;
          try {
            current = await getStatus(session.userId);
          } catch {
            current = null;
          }

          const defaults = getDefaultConfig().deadManSwitch;
          await configure(session.userId, {
            userId: session.userId,
            isEnabled: dms.enabled ?? current?.isEnabled ?? defaults.enabled,
            checkInIntervalHours:
              dms.intervalHours ?? current?.checkInIntervalHours ?? defaults.intervalHours,
            triggerAfterMisses:
              dms.triggerAfterMisses ?? current?.triggerAfterMisses ?? defaults.triggerAfterMisses,
            protocols: dms.protocols
              ? dms.protocols.map((p) => ({
                  order: p.step,
                  action: 'NOTIFY',
                  contactName: p.contact,
                  message: 'Dead man switch triggered: no check-in received.',
                  delayHoursAfterTrigger: p.delayHours,
                }))
              : current?.protocols ?? [],
          });
          persisted.push('deadManSwitch');
        }

        // No CrisisConfig / PhoneTree / EscalationRule models exist. Say so.
        for (const section of ['phoneTree', 'escalationRules', 'warRoomDefaults'] as const) {
          if (parsed.data[section]) notPersisted.push(section);
        }

        return success({
          persisted,
          notPersisted,
          message:
            notPersisted.length === 0
              ? 'Crisis configuration updated'
              : `Saved: ${persisted.join(', ') || 'nothing'}. NOT saved (no store exists yet): ${notPersisted.join(', ')}.`,
        });
      } catch (err) {
        return error('INTERNAL_ERROR', err instanceof Error ? err.message : 'Unknown error', 500);
      }
    },
  );
}
