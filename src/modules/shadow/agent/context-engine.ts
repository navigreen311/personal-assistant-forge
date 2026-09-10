// Shadow Voice Agent — Context Engine
// Assembles rich context for the agent from DB state, session history, and environment.

import { prisma } from '@/lib/db';
import { verifyEntityForUser } from '@/shared/middleware/auth';
import type { AgentContext } from '../types';
import { getShadowConfig } from '@/lib/shadow/config';

/**
 * Build a complete agent context from the database and environment.
 *
 * Queries: user record, active entity, recent messages (last 20),
 * recent actions (last 10). Returns a rich context object for
 * system prompt construction and tool routing.
 */
export async function buildContext(params: {
  userId: string;
  sessionId: string;
  channel: 'web' | 'phone' | 'mobile';
  currentPage?: string;
  activeEntityId?: string;
}): Promise<AgentContext> {
  // Run all queries in parallel for speed
  const [user, entity, recentMessages, recentActions, shadowConfig] = await Promise.all([
    fetchUser(params.userId),
    fetchOwnedEntity(params.activeEntityId, params.userId),
    fetchRecentMessages(params.sessionId),
    fetchRecentActions(params.userId),
    getShadowConfig(params.userId).catch(() => undefined),
  ]);

  if (!user) {
    throw new Error(`User not found: ${params.userId}`);
  }

  // Determine time-of-day and day-of-week in user's timezone
  const { timeOfDay, dayOfWeek } = getTemporalContext(user.timezone);

  // Build page context if provided
  const currentPage = params.currentPage
    ? { pageId: params.currentPage, title: mapPageIdToTitle(params.currentPage) }
    : undefined;

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      preferences: (user.preferences as Record<string, unknown>) ?? {},
      timezone: user.timezone,
    },
    activeEntity: entity
      ? {
          id: entity.id,
          name: entity.name,
          type: entity.type,
          complianceProfile: entity.complianceProfile,
        }
      : undefined,
    currentPage,
    recentMessages,
    recentActions,
    timeOfDay,
    dayOfWeek,
    channel: params.channel,
    shadowConfig,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

async function fetchUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      preferences: true,
      timezone: true,
    },
  });
}

/**
 * The active entity, if the user actually owns it.
 *
 * P-34. This was `findUnique({ where: { id: entityId } })` with no ownership
 * check of any kind, and `activeEntityId` reaches it from
 * `ShadowVoiceSession.activeEntityId` -- a column `POST /api/shadow/session/start`
 * filled from the request body without checking it either. So naming another
 * tenant's entity when starting a session put that entity's NAME, TYPE and
 * COMPLIANCE PROFILE into the Shadow system prompt
 * (`core.ts` -> `buildSystemPrompt`, "Active Entity: ... Compliance profiles:
 * ..."), and every entity-scoped tool then read and wrote that tenant's rows.
 *
 * `verifyEntityForUser` is the P-00b amendment for exactly this case -- trusted
 * server-side code that already knows whose work it is doing -- and it is the
 * same ownership check `withEntityScope` performs for routes. An entity that
 * does not verify yields `undefined` here, which is the same state as "the user
 * has not chosen an entity": the prompt says nothing about it and every scoped
 * tool refuses with `NO_ACTIVE_ENTITY`.
 *
 * The tool layer verifies AGAIN per call (`resolveToolScope`), because this
 * function is not the only way an `AgentContext` can be built. See the header
 * of `./entity-scope.ts`.
 */
async function fetchOwnedEntity(entityId: string | undefined, userId: string) {
  if (!entityId) return null;

  const verified = await verifyEntityForUser(entityId, userId);
  if (!verified) return null;

  return prisma.entity.findUnique({
    where: { id: verified },
    select: {
      id: true,
      name: true,
      type: true,
      complianceProfile: true,
    },
  });
}

async function fetchRecentMessages(
  sessionId: string,
): Promise<Array<{ role: string; content: string }>> {
  const messages = await prisma.shadowMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      role: true,
      content: true,
    },
  });

  // Return in chronological order (oldest first)
  return messages.reverse();
}

async function fetchRecentActions(
  userId: string,
): Promise<Array<{ type: string; description: string; timestamp: Date }>> {
  const actions = await prisma.actionLog.findMany({
    where: { actorId: userId },
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: {
      actionType: true,
      reason: true,
      timestamp: true,
    },
  });

  return actions.map((a) => ({
    type: a.actionType,
    description: a.reason,
    timestamp: a.timestamp,
  }));
}

/**
 * Compute time-of-day label and day-of-week for the user's timezone.
 */
function getTemporalContext(timezone: string): {
  timeOfDay: string;
  dayOfWeek: string;
} {
  try {
    const now = new Date();

    const hourFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    const hour = parseInt(hourFormatter.format(now), 10);

    const dayFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
    });
    const dayOfWeek = dayFormatter.format(now);

    let timeOfDay: string;
    if (hour < 6) {
      timeOfDay = 'early_morning';
    } else if (hour < 12) {
      timeOfDay = 'morning';
    } else if (hour < 14) {
      timeOfDay = 'midday';
    } else if (hour < 17) {
      timeOfDay = 'afternoon';
    } else if (hour < 21) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    return { timeOfDay, dayOfWeek };
  } catch {
    return { timeOfDay: 'unknown', dayOfWeek: 'unknown' };
  }
}

/**
 * Map a page ID to a human-readable title.
 * This handles common PAF page routes.
 */
function mapPageIdToTitle(pageId: string): string {
  const PAGE_TITLES: Record<string, string> = {
    dashboard: 'Dashboard',
    inbox: 'Inbox',
    tasks: 'Tasks',
    calendar: 'Calendar',
    contacts: 'Contacts',
    projects: 'Projects',
    finance: 'Finance',
    invoices: 'Invoices',
    knowledge: 'Knowledge Base',
    workflows: 'Workflows',
    settings: 'Settings',
    voiceforge: 'VoiceForge',
    analytics: 'Analytics',
    documents: 'Documents',
    decisions: 'Decisions',
    health: 'Health & Wellness',
  };

  return PAGE_TITLES[pageId] ?? pageId;
}
