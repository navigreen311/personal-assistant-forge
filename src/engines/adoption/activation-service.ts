import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import type { ActivationChecklist, ActivationPhase } from './types';
const uuidv4 = () => crypto.randomUUID();

function buildDefaultPhases(): ActivationPhase[] {
  return [
    {
      name: 'Inbox Mastery',
      dayRange: [1, 3],
      status: 'NOT_STARTED',
      tasks: [
        { id: uuidv4(), title: 'Connect email account', description: 'Link your primary email to enable AI triage and auto-drafting.', phase: 'Inbox Mastery', dayTarget: 1, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Configure triage settings', description: 'Set priority rules, VIP contacts, and auto-archive patterns.', phase: 'Inbox Mastery', dayTarget: 2, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Approve first auto-drafted email', description: 'Review and send your first AI-drafted email response.', phase: 'Inbox Mastery', dayTarget: 2, isComplete: false, isAhaMoment: true },
      ],
    },
    {
      name: 'Calendar Command',
      dayRange: [4, 7],
      status: 'NOT_STARTED',
      tasks: [
        { id: uuidv4(), title: 'Connect calendar', description: 'Link your calendar for scheduling intelligence and prep packets.', phase: 'Calendar Command', dayTarget: 4, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Set focus hours', description: 'Define your deep work blocks so AI protects them from interruptions.', phase: 'Calendar Command', dayTarget: 5, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Review first prep packet', description: 'Get AI-generated meeting preparation with attendee context.', phase: 'Calendar Command', dayTarget: 6, isComplete: false, isAhaMoment: false },
      ],
    },
    {
      name: 'Automation Builder',
      dayRange: [8, 14],
      status: 'NOT_STARTED',
      tasks: [
        { id: uuidv4(), title: 'Create first workflow', description: 'Build your first automated workflow with triggers and actions.', phase: 'Automation Builder', dayTarget: 9, isComplete: false, isAhaMoment: true },
        { id: uuidv4(), title: 'Set first rule', description: 'Define a rule for automatic email categorization or task creation.', phase: 'Automation Builder', dayTarget: 11, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Send first broadcast', description: 'Use templates to send a personalized multi-recipient message.', phase: 'Automation Builder', dayTarget: 13, isComplete: false, isAhaMoment: false },
      ],
    },
    {
      name: 'Voice & Communication',
      dayRange: [15, 21],
      status: 'NOT_STARTED',
      tasks: [
        { id: uuidv4(), title: 'Set up voice persona', description: 'Configure your AI voice persona for phone calls.', phase: 'Voice & Communication', dayTarget: 16, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Complete first AI call', description: 'Have AI handle an outbound or inbound call on your behalf.', phase: 'Voice & Communication', dayTarget: 17, isComplete: false, isAhaMoment: true },
        { id: uuidv4(), title: 'Create call script', description: 'Define a reusable call script for common call types.', phase: 'Voice & Communication', dayTarget: 19, isComplete: false, isAhaMoment: false },
      ],
    },
    {
      name: 'Full Delegation',
      dayRange: [22, 30],
      status: 'NOT_STARTED',
      tasks: [
        { id: uuidv4(), title: 'Enable delegation inbox', description: 'Activate AI-managed inbox for autonomous email handling.', phase: 'Full Delegation', dayTarget: 23, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Set attention budget', description: 'Define maximum daily interruptions and notification preferences.', phase: 'Full Delegation', dayTarget: 25, isComplete: false, isAhaMoment: false },
        { id: uuidv4(), title: 'Complete first fully autonomous task', description: 'Let AI execute an end-to-end task without human intervention.', phase: 'Full Delegation', dayTarget: 27, isComplete: false, isAhaMoment: true },
      ],
    },
  ];
}

function calculateProgress(phases: ActivationPhase[]): number {
  const allTasks = phases.flatMap(p => p.tasks);
  if (allTasks.length === 0) return 0;
  const completed = allTasks.filter(t => t.isComplete).length;
  return Math.round((completed / allTasks.length) * 100);
}

function updatePhaseStatuses(phases: ActivationPhase[]): void {
  for (const phase of phases) {
    const allComplete = phase.tasks.every(t => t.isComplete);
    const anyComplete = phase.tasks.some(t => t.isComplete);
    phase.status = allComplete ? 'COMPLETE' : anyComplete ? 'IN_PROGRESS' : 'NOT_STARTED';
  }
}

interface CompletedStep {
  taskId: string;
  completedAt: string;
}

interface StoredAhaMoment {
  taskId: string;
  triggeredAt: string;
}

function applyCompletedSteps(phases: ActivationPhase[], completedSteps: CompletedStep[]): void {
  const completedMap = new Map(completedSteps.map(s => [s.taskId, new Date(s.completedAt)]));
  for (const phase of phases) {
    for (const task of phase.tasks) {
      if (completedMap.has(task.id)) {
        task.isComplete = true;
        task.completedAt = completedMap.get(task.id);
      }
    }
  }
}

function recordToChecklist(
  record: { userId: string; startedAt: Date; completedSteps: unknown; ahaMoments: unknown; phase: string },
  phases: ActivationPhase[]
): ActivationChecklist {
  const completedSteps = (record.completedSteps ?? []) as unknown as CompletedStep[];
  applyCompletedSteps(phases, completedSteps);
  updatePhaseStatuses(phases);

  const daysSinceStart = Math.floor(
    (new Date().getTime() - record.startedAt.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;

  return {
    userId: record.userId,
    startDate: record.startedAt,
    currentDay: Math.min(daysSinceStart, 30),
    phases,
    overallProgress: calculateProgress(phases),
  };
}

export async function initializeChecklist(userId: string): Promise<ActivationChecklist> {
  const phases = buildDefaultPhases();

  // Upsert to avoid failure if already exists
  const record = await prisma.adoptionProgress.upsert({
    where: { userId },
    create: {
      userId,
      phase: 'Inbox Mastery',
      completedSteps: [],
      ahaMoments: [],
      startedAt: new Date(),
    },
    update: {
      phase: 'Inbox Mastery',
      completedSteps: [],
      ahaMoments: [],
      startedAt: new Date(),
      completedAt: null,
    },
  });

  return recordToChecklist(record, phases);
}

export async function getChecklist(userId: string): Promise<ActivationChecklist> {
  const record = await prisma.adoptionProgress.findUnique({
    where: { userId },
  });

  if (!record) {
    return initializeChecklist(userId);
  }

  const phases = buildDefaultPhases();
  return recordToChecklist(record, phases);
}

export async function completeTask(userId: string, taskId: string): Promise<ActivationChecklist> {
  const checklist = await getChecklist(userId);

  // Find the task to verify it exists and check if it is an aha moment
  let isAhaMoment = false;
  let alreadyComplete = false;
  for (const phase of checklist.phases) {
    const task = phase.tasks.find(t => t.id === taskId);
    if (task) {
      if (task.isComplete) {
        alreadyComplete = true;
      }
      isAhaMoment = task.isAhaMoment;
      task.isComplete = true;
      task.completedAt = new Date();
      break;
    }
  }

  if (!alreadyComplete) {
    // Get current record to update its JSON fields
    const record = await prisma.adoptionProgress.findUnique({
      where: { userId },
    });

    if (record) {
      const completedSteps = (record.completedSteps ?? []) as unknown as CompletedStep[];
      completedSteps.push({ taskId, completedAt: new Date().toISOString() });

      const ahaMoments = (record.ahaMoments ?? []) as unknown as StoredAhaMoment[];
      if (isAhaMoment) {
        ahaMoments.push({ taskId, triggeredAt: new Date().toISOString() });
      }

      // Determine current phase name
      updatePhaseStatuses(checklist.phases);
      const activePhase = checklist.phases.find(p => p.status !== 'COMPLETE') ?? checklist.phases[checklist.phases.length - 1];
      const allComplete = checklist.phases.every(p => p.status === 'COMPLETE');

      await prisma.adoptionProgress.update({
        where: { userId },
        data: {
          completedSteps: completedSteps as unknown as Prisma.InputJsonValue,
          ahaMoments: ahaMoments as unknown as Prisma.InputJsonValue,
          phase: activePhase.name,
          completedAt: allComplete ? new Date() : null,
        },
      });
    }
  }

  updatePhaseStatuses(checklist.phases);
  checklist.overallProgress = calculateProgress(checklist.phases);

  return checklist;
}

export async function getCurrentPhase(userId: string): Promise<ActivationPhase> {
  const checklist = await getChecklist(userId);
  const currentDay = checklist.currentDay;

  const phase = checklist.phases.find(
    p => currentDay >= p.dayRange[0] && currentDay <= p.dayRange[1]
  );

  return phase ?? checklist.phases[checklist.phases.length - 1];
}
