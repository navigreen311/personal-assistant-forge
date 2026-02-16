import { generateJSON } from '@/lib/ai';
import type { Playbook, PlaybookStep } from './types';
const uuidv4 = () => crypto.randomUUID();

// In-memory store for user activations
const userActivations = new Map<string, Set<string>>();

export function getDefaultPlaybooks(): Playbook[] {
  return [
    {
      id: 'pb-morning-briefing',
      name: 'Morning Briefing Setup',
      description: 'Get a daily morning briefing with your schedule, priority emails, and key metrics delivered automatically.',
      category: 'productivity',
      estimatedTimeSavedMinutes: 5,
      activationCount: 0,
      rating: 4.5,
      steps: [
        { order: 1, title: 'Set briefing time', description: 'Choose when you want your morning briefing delivered.', actionType: 'CONFIGURE', isOptional: false },
        { order: 2, title: 'Select data sources', description: 'Choose which calendars, inboxes, and dashboards to include.', actionType: 'CONNECT', isOptional: false },
        { order: 3, title: 'Customize format', description: 'Pick the briefing template and level of detail.', actionType: 'CONFIGURE', isOptional: true },
        { order: 4, title: 'Test delivery', description: 'Send a test briefing to verify everything works.', actionType: 'REVIEW', isOptional: false },
      ],
    },
    {
      id: 'pb-email-triage',
      name: 'Email Auto-Triage',
      description: 'Automatically categorize, prioritize, and draft responses to incoming emails.',
      category: 'email',
      estimatedTimeSavedMinutes: 15,
      activationCount: 0,
      rating: 4.7,
      steps: [
        { order: 1, title: 'Connect email account', description: 'Link your email account for AI processing.', actionType: 'CONNECT', isOptional: false },
        { order: 2, title: 'Set priority rules', description: 'Define VIP senders and urgent keywords.', actionType: 'CONFIGURE', isOptional: false },
        { order: 3, title: 'Configure auto-draft', description: 'Set which email types get automatic draft responses.', actionType: 'AUTOMATE', isOptional: false },
        { order: 4, title: 'Review sample triage', description: 'Check AI categorization on recent emails.', actionType: 'REVIEW', isOptional: false },
      ],
    },
    {
      id: 'pb-meeting-prep',
      name: 'Meeting Prep Automation',
      description: 'Automatically generate prep packets with attendee context, talking points, and open items before every meeting.',
      category: 'calendar',
      estimatedTimeSavedMinutes: 10,
      activationCount: 0,
      rating: 4.3,
      steps: [
        { order: 1, title: 'Connect calendar', description: 'Link your calendar for meeting detection.', actionType: 'CONNECT', isOptional: false },
        { order: 2, title: 'Set prep timing', description: 'Choose how far in advance prep packets are generated.', actionType: 'CONFIGURE', isOptional: false },
        { order: 3, title: 'Link CRM/contacts', description: 'Connect your contact database for attendee context.', actionType: 'CONNECT', isOptional: true },
        { order: 4, title: 'Review first packet', description: 'Check a sample prep packet for quality.', actionType: 'REVIEW', isOptional: false },
      ],
    },
    {
      id: 'pb-invoice-processing',
      name: 'Invoice Processing Pipeline',
      description: 'Automate invoice extraction, validation, approval routing, and payment tracking.',
      category: 'finance',
      estimatedTimeSavedMinutes: 20,
      activationCount: 0,
      rating: 4.1,
      steps: [
        { order: 1, title: 'Connect accounting system', description: 'Link your accounting software for invoice sync.', actionType: 'CONNECT', isOptional: false },
        { order: 2, title: 'Set approval thresholds', description: 'Define amounts requiring manual approval vs auto-processing.', actionType: 'CONFIGURE', isOptional: false },
        { order: 3, title: 'Configure extraction rules', description: 'Set up AI extraction for invoice fields and line items.', actionType: 'AUTOMATE', isOptional: false },
        { order: 4, title: 'Test with sample invoice', description: 'Process a test invoice through the pipeline.', actionType: 'REVIEW', isOptional: false },
      ],
    },
    {
      id: 'pb-client-followup',
      name: 'Client Follow-Up Cadence',
      description: 'Automatically schedule and send personalized follow-up messages to clients on a configurable cadence.',
      category: 'communication',
      estimatedTimeSavedMinutes: 30,
      activationCount: 0,
      rating: 4.6,
      steps: [
        { order: 1, title: 'Import client list', description: 'Add clients to track with follow-up reminders.', actionType: 'CONNECT', isOptional: false },
        { order: 2, title: 'Set cadence rules', description: 'Define follow-up frequency per client tier.', actionType: 'CONFIGURE', isOptional: false },
        { order: 3, title: 'Create message templates', description: 'Draft personalized follow-up templates with merge fields.', actionType: 'AUTOMATE', isOptional: false },
        { order: 4, title: 'Review scheduled messages', description: 'Approve the first batch of scheduled follow-ups.', actionType: 'REVIEW', isOptional: false },
      ],
    },
    {
      id: 'pb-weekly-report',
      name: 'Weekly Report Generator',
      description: 'Automatically compile weekly reports from activity data, metrics, and accomplishments.',
      category: 'reporting',
      estimatedTimeSavedMinutes: 45,
      activationCount: 0,
      rating: 4.4,
      steps: [
        { order: 1, title: 'Select data sources', description: 'Choose which systems to pull report data from.', actionType: 'CONNECT', isOptional: false },
        { order: 2, title: 'Choose report template', description: 'Select or customize the report format.', actionType: 'CONFIGURE', isOptional: false },
        { order: 3, title: 'Set delivery schedule', description: 'Configure when and to whom reports are delivered.', actionType: 'AUTOMATE', isOptional: false },
        { order: 4, title: 'Review sample report', description: 'Check a generated sample report for accuracy.', actionType: 'REVIEW', isOptional: false },
      ],
    },
  ];
}

const playbookCache = new Map<string, Playbook>();

function ensureCache(): void {
  if (playbookCache.size === 0) {
    for (const pb of getDefaultPlaybooks()) {
      playbookCache.set(pb.id, pb);
    }
  }
}

export async function getPlaybooks(category?: string): Promise<Playbook[]> {
  ensureCache();
  const all = Array.from(playbookCache.values());
  if (!category) return all;
  return all.filter(pb => pb.category === category);
}

export async function getPlaybook(playbookId: string): Promise<Playbook | null> {
  ensureCache();
  return playbookCache.get(playbookId) ?? null;
}

export async function generatePersonalizedPlaybook(
  userId: string,
  role: string,
  industry: string,
  goals: string[]
): Promise<Playbook> {
  try {
    const aiPlaybook = await generateJSON<{
      name: string;
      description: string;
      category: string;
      steps: { title: string; description: string; actionType: string; isOptional: boolean }[];
      estimatedTimeSavedMinutes: number;
    }>(
      `Generate a personalized adoption playbook for this user profile.

Role: ${role}
Industry: ${industry}
Goals: ${goals.join(', ')}

Create a structured playbook with 3-5 actionable steps. Return JSON with:
- name: playbook name
- description: brief description
- category: one of "productivity", "email", "calendar", "finance", "communication", "reporting"
- steps: array of { title, description, actionType ("CONFIGURE"|"CONNECT"|"AUTOMATE"|"REVIEW"), isOptional: boolean }
- estimatedTimeSavedMinutes: estimated time savings per use`,
      { temperature: 0.6 }
    );

    const playbook: Playbook = {
      id: `pb-${uuidv4()}`,
      name: aiPlaybook.name,
      description: aiPlaybook.description,
      category: aiPlaybook.category,
      steps: aiPlaybook.steps.map((s, i) => ({
        order: i + 1,
        title: s.title,
        description: s.description,
        actionType: s.actionType as PlaybookStep['actionType'],
        isOptional: s.isOptional,
      })),
      estimatedTimeSavedMinutes: aiPlaybook.estimatedTimeSavedMinutes,
      activationCount: 0,
      rating: 0,
    };

    playbookCache.set(playbook.id, playbook);
    return playbook;
  } catch {
    // Fall back to the most relevant default playbook
    ensureCache();
    const defaults = Array.from(playbookCache.values());
    return defaults[0];
  }
}

export async function activatePlaybook(
  userId: string,
  playbookId: string
): Promise<{ success: boolean; message: string }> {
  ensureCache();
  const playbook = playbookCache.get(playbookId);
  if (!playbook) {
    return { success: false, message: `Playbook ${playbookId} not found.` };
  }

  const activations = userActivations.get(userId) ?? new Set();
  if (activations.has(playbookId)) {
    return { success: false, message: `Playbook "${playbook.name}" is already activated.` };
  }

  activations.add(playbookId);
  userActivations.set(userId, activations);
  playbook.activationCount += 1;

  return { success: true, message: `Playbook "${playbook.name}" activated. Follow the ${playbook.steps.length} steps to complete setup.` };
}
