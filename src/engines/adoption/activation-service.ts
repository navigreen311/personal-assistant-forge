import type { ActivationChecklist, ActivationPhase, ActivationTask } from './types';
const uuidv4 = () => crypto.randomUUID();

// In-memory checklist store
const checklists = new Map<string, ActivationChecklist>();

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

export async function initializeChecklist(userId: string): Promise<ActivationChecklist> {
  const phases = buildDefaultPhases();
  const checklist: ActivationChecklist = {
    userId,
    startDate: new Date(),
    currentDay: 1,
    phases,
    overallProgress: 0,
  };
  checklists.set(userId, checklist);
  return checklist;
}

export async function getChecklist(userId: string): Promise<ActivationChecklist> {
  const checklist = checklists.get(userId);
  if (!checklist) {
    return initializeChecklist(userId);
  }

  // Update current day
  const daysSinceStart = Math.floor(
    (new Date().getTime() - checklist.startDate.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;
  checklist.currentDay = Math.min(daysSinceStart, 30);

  return checklist;
}

export async function completeTask(userId: string, taskId: string): Promise<ActivationChecklist> {
  const checklist = await getChecklist(userId);

  for (const phase of checklist.phases) {
    const task = phase.tasks.find(t => t.id === taskId);
    if (task && !task.isComplete) {
      task.isComplete = true;
      task.completedAt = new Date();
      break;
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
