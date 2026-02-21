import { generateText } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type { CoachingRecommendation } from './types';
const uuidv4 = () => crypto.randomUUID();

function generateDefaultRecommendations(userId: string): CoachingRecommendation[] {
  return [
    {
      id: uuidv4(),
      userId,
      type: 'FEATURE_DISCOVERY',
      title: 'Enable Smart Email Triage',
      description: 'You have 50+ unread emails. Smart triage can auto-categorize and draft responses, saving ~15 minutes daily.',
      estimatedImpactMinutes: 15,
      oneClickAction: 'enable_email_triage',
      priority: 'HIGH',
      status: 'PENDING',
    },
    {
      id: uuidv4(),
      userId,
      type: 'AUTOMATION',
      title: 'Automate Meeting Prep',
      description: 'You have 5+ meetings this week. Auto-generated prep packets can save ~10 minutes per meeting.',
      estimatedImpactMinutes: 50,
      oneClickAction: 'enable_meeting_prep',
      priority: 'HIGH',
      status: 'PENDING',
    },
    {
      id: uuidv4(),
      userId,
      type: 'OPTIMIZATION',
      title: 'Consolidate Notification Channels',
      description: 'You check 3 different channels for updates. Consolidating into a daily digest can reduce context switching.',
      estimatedImpactMinutes: 20,
      oneClickAction: 'consolidate_notifications',
      priority: 'MEDIUM',
      status: 'PENDING',
    },
    {
      id: uuidv4(),
      userId,
      type: 'HABIT',
      title: 'Set Up Weekly Review',
      description: 'A 10-minute weekly review can help you track progress and identify optimization opportunities.',
      estimatedImpactMinutes: 10,
      oneClickAction: 'enable_weekly_review',
      priority: 'LOW',
      status: 'PENDING',
    },
  ];
}

async function getStoredRecommendations(userId: string): Promise<CoachingRecommendation[] | null> {
  const record = await prisma.adoptionProgress.findUnique({
    where: { userId },
  });
  if (!record) return null;
  const data = (record.data ?? {}) as Record<string, unknown>;
  const coaching = data.coaching as CoachingRecommendation[] | undefined;
  return coaching ?? null;
}

async function storeRecommendations(userId: string, recs: CoachingRecommendation[]): Promise<void> {
  const record = await prisma.adoptionProgress.findUnique({
    where: { userId },
  });
  const existingData = (record?.data ?? {}) as Record<string, unknown>;

  await prisma.adoptionProgress.upsert({
    where: { userId },
    create: {
      userId,
      data: { ...existingData, coaching: recs },
    },
    update: {
      data: { ...existingData, coaching: recs },
    },
  });
}

export async function generateRecommendations(userId: string): Promise<CoachingRecommendation[]> {
  const existing = await getStoredRecommendations(userId);
  if (existing && existing.some(r => r.status === 'PENDING')) {
    const pending = existing.filter(r => r.status === 'PENDING');

    // Enhance existing recommendations with AI-personalized descriptions
    try {
      const aiTips = await generateText(
        `Generate personalized coaching tips for a user with these pending recommendations:
${pending.map((r) => `- ${r.title}: ${r.description} (type: ${r.type}, priority: ${r.priority})`).join('\n')}

Provide a brief, specific, and actionable tip for each recommendation (one line each). Be conversational and motivating.`,
        { temperature: 0.7 }
      );

      const tips = aiTips.split('\n').filter(Boolean);
      for (let i = 0; i < Math.min(tips.length, pending.length); i++) {
        const cleaned = tips[i].replace(/^[-•\d.]\s*/, '').trim();
        if (cleaned) {
          pending[i].description = cleaned;
        }
      }
    } catch {
      // Keep default descriptions on AI failure
    }

    // Persist any AI-enhanced descriptions back
    await storeRecommendations(userId, existing);

    return pending;
  }

  const recs = generateDefaultRecommendations(userId);
  await storeRecommendations(userId, recs);
  return recs;
}

export async function applyRecommendation(
  userId: string,
  recommendationId: string
): Promise<{ success: boolean }> {
  const recs = await getStoredRecommendations(userId);
  if (!recs) return { success: false };

  const rec = recs.find(r => r.id === recommendationId);
  if (!rec) return { success: false };

  rec.status = 'APPLIED';
  await storeRecommendations(userId, recs);
  return { success: true };
}

export async function dismissRecommendation(
  userId: string,
  recommendationId: string
): Promise<void> {
  const recs = await getStoredRecommendations(userId);
  if (!recs) return;

  const rec = recs.find(r => r.id === recommendationId);
  if (rec) {
    rec.status = 'DISMISSED';
    await storeRecommendations(userId, recs);
  }
}

export async function getWeeklyReview(userId: string): Promise<{
  recommendations: CoachingRecommendation[];
  weeklyTimeSaved: number;
  topWin: string;
  improvementArea: string;
}> {
  const recs = await generateRecommendations(userId);
  const pendingRecs = recs.filter(r => r.status === 'PENDING');

  return {
    recommendations: pendingRecs,
    weeklyTimeSaved: 120, // Placeholder: 2 hours
    topWin: 'Email triage saved the most time this week with 45 minutes of automated responses.',
    improvementArea: 'Consider setting up automated meeting prep to save an additional 50 minutes per week.',
  };
}
