import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { AhaMoment } from './types';

const AHA_MOMENTS: AhaMoment[] = [
  {
    action: 'first_auto_draft_approved',
    description: 'First auto-drafted email approved',
    retentionCorrelation: 0.85,
    targetDay: 2,
  },
  {
    action: 'first_workflow_triggered',
    description: 'First workflow triggered automatically',
    retentionCorrelation: 0.90,
    targetDay: 10,
  },
  {
    action: 'voice_call_handled',
    description: 'Voice call handled by AI',
    retentionCorrelation: 0.75,
    targetDay: 17,
  },
  {
    action: 'time_saved_one_hour',
    description: 'Time saved counter reaches 1 hour',
    retentionCorrelation: 0.88,
    targetDay: 5,
  },
  {
    action: 'first_autonomous_task',
    description: 'First fully autonomous task completed',
    retentionCorrelation: 0.92,
    targetDay: 25,
  },
];

export function getAhaMoments(): AhaMoment[] {
  return [...AHA_MOMENTS];
}

async function getCompletedMoments(userId: string): Promise<string[]> {
  const record = await prisma.adoptionProgress.findUnique({
    where: { userId },
  });
  if (!record) return [];
  const data = (record.data ?? {}) as Record<string, unknown>;
  return (data.ahaMomentActions as string[]) ?? [];
}

export async function checkAhaMomentProgress(userId: string): Promise<{
  completed: AhaMoment[];
  next: AhaMoment | null;
  guidanceMessage: string;
}> {
  const completedActions = await getCompletedMoments(userId);
  const userCompleted = new Set(completedActions);

  const completed = AHA_MOMENTS.filter(m => userCompleted.has(m.action));
  const remaining = AHA_MOMENTS
    .filter(m => !userCompleted.has(m.action))
    .sort((a, b) => a.targetDay - b.targetDay);

  const next = remaining.length > 0 ? remaining[0] : null;

  let guidanceMessage: string;
  if (!next) {
    guidanceMessage = 'Congratulations! You have completed all key milestones. You are now a power user!';
  } else if (completed.length === 0) {
    guidanceMessage = `Welcome! Your first milestone is: "${next.description}". This typically happens around day ${next.targetDay}.`;
  } else {
    guidanceMessage = `Great progress! ${completed.length}/${AHA_MOMENTS.length} milestones completed. Next up: "${next.description}" (target: day ${next.targetDay}).`;
  }

  // Use AI to generate celebratory and engaging messages
  try {
    const aiResult = await generateJSON<{
      guidanceMessage: string;
      celebration?: string;
    }>(
      `Generate an engaging aha-moment progress message for a user.

Completed milestones (${completed.length}/${AHA_MOMENTS.length}):
${completed.map((m) => `- ${m.description} (retention correlation: ${m.retentionCorrelation})`).join('\n') || 'None yet'}

Next milestone: ${next ? `"${next.description}" (target day: ${next.targetDay})` : 'All completed!'}

Return JSON with:
- guidanceMessage: a personalized, motivating guidance message (1-2 sentences)
- celebration: if milestones were completed, a brief celebratory note`,
      { temperature: 0.6 }
    );

    if (aiResult.guidanceMessage) {
      guidanceMessage = aiResult.celebration
        ? `${aiResult.celebration} ${aiResult.guidanceMessage}`
        : aiResult.guidanceMessage;
    }
  } catch {
    // Keep fallback guidance message
  }

  return { completed, next, guidanceMessage };
}

// Helper to mark an aha moment as completed (used by other services)
export async function markAhaMomentCompleted(userId: string, action: string): Promise<void> {
  const record = await prisma.adoptionProgress.findUnique({
    where: { userId },
  });

  const existingData = (record?.data ?? {}) as Record<string, unknown>;
  const existingActions = (existingData.ahaMomentActions as string[]) ?? [];

  if (existingActions.includes(action)) return;

  const updatedActions = [...existingActions, action];

  await prisma.adoptionProgress.upsert({
    where: { userId },
    create: {
      userId,
      data: { ...existingData, ahaMomentActions: updatedActions },
    },
    update: {
      data: { ...existingData, ahaMomentActions: updatedActions },
    },
  });
}
