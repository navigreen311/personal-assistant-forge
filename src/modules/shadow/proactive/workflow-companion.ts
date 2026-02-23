import { prisma } from '@/lib/db';

// ---- Types ----

export interface CompanionState {
  workflowId: string;
  workflowName: string;
  totalSteps: number;
  currentStep: number;
  currentStepName: string;
  currentStepExplanation: string;
  completedSteps: number[];
  skippedSteps: number[];
  isPaused: boolean;
  isComplete: boolean;
  announcement: string;
  options: string[];
}

export interface CompanionStartParams {
  sessionId: string;
  workflowId: string;
  userId: string;
}

export interface StepChoiceParams {
  sessionId: string;
  choice: 'ai_handle' | 'user_handle' | 'delegate';
  delegateTo?: string;
}

export type NavigateAction = 'skip' | 'back' | 'pause' | 'finish_all' | 'status';

interface WorkflowStep {
  id: string;
  order: number;
  action: string;
  params?: Record<string, unknown>;
  onSuccess?: string;
  onFailure?: string;
  timeout?: number;
}

// ---- In-memory session store ----
// In production this would be Redis or DB-backed.
// We use the ShadowVoiceSession model for persistence, and in-memory for fast access.

const companionSessions = new Map<string, CompanionState>();

// ---- Service ----

export class WorkflowCompanionService {
  /**
   * Start a workflow companion session. Loads the workflow, sets up state,
   * and presents the first step.
   */
  async startCompanion(params: CompanionStartParams): Promise<CompanionState> {
    const { sessionId, workflowId, userId } = params;

    // Load the workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Verify entity ownership
    const entity = await prisma.entity.findUnique({
      where: { id: workflow.entityId },
    });
    if (!entity || entity.userId !== userId) {
      throw new Error('Access denied: workflow does not belong to this user');
    }

    const steps = (workflow.steps ?? []) as unknown as WorkflowStep[];

    if (steps.length === 0) {
      throw new Error('Workflow has no steps defined');
    }

    // Sort steps by order
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const firstStep = sortedSteps[0];

    const state: CompanionState = {
      workflowId,
      workflowName: workflow.name,
      totalSteps: sortedSteps.length,
      currentStep: 0,
      currentStepName: firstStep.action,
      currentStepExplanation: this.explainStep(firstStep),
      completedSteps: [],
      skippedSteps: [],
      isPaused: false,
      isComplete: false,
      announcement: `Starting workflow "${workflow.name}". ${sortedSteps.length} steps total. Step 1: ${firstStep.action}.`,
      options: ['ai_handle', 'user_handle', 'delegate', 'skip', 'pause'],
    };

    companionSessions.set(sessionId, state);

    // Update the voice session if it exists
    await this.syncSessionToDb(sessionId, workflowId, 0);

    return state;
  }

  /**
   * Process the user's choice for the current step.
   */
  async processStepChoice(params: StepChoiceParams): Promise<CompanionState> {
    const { sessionId, choice, delegateTo } = params;

    const state = companionSessions.get(sessionId);
    if (!state) {
      throw new Error(`Companion session not found: ${sessionId}`);
    }

    if (state.isComplete) {
      throw new Error('Workflow is already complete');
    }

    if (state.isPaused) {
      throw new Error('Workflow is paused. Use navigate("pause") to resume.');
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: state.workflowId },
    });

    if (!workflow) {
      throw new Error('Workflow no longer exists');
    }

    const steps = (workflow.steps ?? []) as unknown as WorkflowStep[];
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
    const currentStepIndex = state.currentStep;

    // Mark current step as completed
    state.completedSteps.push(currentStepIndex);

    // Build announcement based on choice
    let announcement: string;
    switch (choice) {
      case 'ai_handle':
        announcement = `Step ${currentStepIndex + 1} "${state.currentStepName}" will be handled by AI.`;
        break;
      case 'user_handle':
        announcement = `Step ${currentStepIndex + 1} "${state.currentStepName}" is marked for you to handle.`;
        break;
      case 'delegate':
        announcement = `Step ${currentStepIndex + 1} "${state.currentStepName}" delegated to ${delegateTo ?? 'team member'}.`;
        break;
      default:
        announcement = `Step ${currentStepIndex + 1} processed.`;
    }

    // Advance to next step
    const nextStepIndex = currentStepIndex + 1;
    if (nextStepIndex >= sortedSteps.length) {
      // Workflow complete
      state.isComplete = true;
      state.currentStep = currentStepIndex;
      state.announcement = `${announcement} All steps complete! Workflow "${state.workflowName}" finished.`;
      state.options = [];

      companionSessions.set(sessionId, state);
      await this.syncSessionToDb(sessionId, state.workflowId, currentStepIndex);

      return state;
    }

    const nextStep = sortedSteps[nextStepIndex];
    state.currentStep = nextStepIndex;
    state.currentStepName = nextStep.action;
    state.currentStepExplanation = this.explainStep(nextStep);
    state.announcement = `${announcement} Next: Step ${nextStepIndex + 1} of ${state.totalSteps} - ${nextStep.action}.`;
    state.options = ['ai_handle', 'user_handle', 'delegate', 'skip', 'back', 'pause', 'finish_all'];

    companionSessions.set(sessionId, state);
    await this.syncSessionToDb(sessionId, state.workflowId, nextStepIndex);

    return state;
  }

  /**
   * Navigate the workflow companion: skip, back, pause/resume, finish_all, or status.
   */
  async navigate(
    sessionId: string,
    action: NavigateAction
  ): Promise<CompanionState> {
    const state = companionSessions.get(sessionId);
    if (!state) {
      throw new Error(`Companion session not found: ${sessionId}`);
    }

    const workflow = await prisma.workflow.findUnique({
      where: { id: state.workflowId },
    });
    if (!workflow) {
      throw new Error('Workflow no longer exists');
    }

    const steps = (workflow.steps ?? []) as unknown as WorkflowStep[];
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    switch (action) {
      case 'skip': {
        if (state.isComplete) {
          state.announcement = 'Workflow is already complete. Nothing to skip.';
          break;
        }
        if (state.isPaused) {
          state.announcement = 'Workflow is paused. Resume first before skipping.';
          break;
        }

        state.skippedSteps.push(state.currentStep);
        const nextIndex = state.currentStep + 1;

        if (nextIndex >= sortedSteps.length) {
          state.isComplete = true;
          state.announcement = `Skipped step ${state.currentStep + 1}. All steps addressed. Workflow complete.`;
          state.options = [];
        } else {
          const nextStep = sortedSteps[nextIndex];
          state.currentStep = nextIndex;
          state.currentStepName = nextStep.action;
          state.currentStepExplanation = this.explainStep(nextStep);
          state.announcement = `Skipped step ${state.currentStep}. Now on step ${nextIndex + 1}: ${nextStep.action}.`;
          state.options = ['ai_handle', 'user_handle', 'delegate', 'skip', 'back', 'pause', 'finish_all'];
        }
        break;
      }

      case 'back': {
        if (state.isComplete) {
          state.announcement = 'Workflow is complete. Cannot go back.';
          break;
        }
        if (state.currentStep <= 0) {
          state.announcement = 'Already at the first step. Cannot go back.';
          break;
        }

        const prevIndex = state.currentStep - 1;
        const prevStep = sortedSteps[prevIndex];

        // Remove from completed/skipped if present
        state.completedSteps = state.completedSteps.filter((s) => s !== prevIndex);
        state.skippedSteps = state.skippedSteps.filter((s) => s !== prevIndex);

        state.currentStep = prevIndex;
        state.currentStepName = prevStep.action;
        state.currentStepExplanation = this.explainStep(prevStep);
        state.isPaused = false;
        state.announcement = `Went back to step ${prevIndex + 1}: ${prevStep.action}.`;
        state.options = ['ai_handle', 'user_handle', 'delegate', 'skip', 'back', 'pause', 'finish_all'];
        break;
      }

      case 'pause': {
        if (state.isComplete) {
          state.announcement = 'Workflow is already complete.';
          break;
        }

        // Toggle pause
        state.isPaused = !state.isPaused;
        if (state.isPaused) {
          state.announcement = `Workflow "${state.workflowName}" paused at step ${state.currentStep + 1}.`;
          state.options = ['pause']; // only resume is available
        } else {
          state.announcement = `Workflow "${state.workflowName}" resumed at step ${state.currentStep + 1}: ${state.currentStepName}.`;
          state.options = ['ai_handle', 'user_handle', 'delegate', 'skip', 'back', 'pause', 'finish_all'];
        }
        break;
      }

      case 'finish_all': {
        if (state.isComplete) {
          state.announcement = 'Workflow is already complete.';
          break;
        }

        // Mark all remaining steps as AI-handled
        for (let i = state.currentStep; i < sortedSteps.length; i++) {
          if (!state.completedSteps.includes(i) && !state.skippedSteps.includes(i)) {
            state.completedSteps.push(i);
          }
        }

        state.isComplete = true;
        state.isPaused = false;
        const remaining = sortedSteps.length - state.currentStep;
        state.announcement = `All ${remaining} remaining step${remaining !== 1 ? 's' : ''} assigned to AI. Workflow "${state.workflowName}" complete.`;
        state.options = [];
        break;
      }

      case 'status': {
        const completed = state.completedSteps.length;
        const skipped = state.skippedSteps.length;
        const remaining = state.totalSteps - completed - skipped;
        const pauseStatus = state.isPaused ? ' (PAUSED)' : '';

        state.announcement = `Workflow "${state.workflowName}"${pauseStatus}: ${completed} completed, ${skipped} skipped, ${remaining} remaining. Currently on step ${state.currentStep + 1} of ${state.totalSteps}: ${state.currentStepName}.`;
        break;
      }
    }

    companionSessions.set(sessionId, state);
    await this.syncSessionToDb(sessionId, state.workflowId, state.currentStep);

    return state;
  }

  /**
   * Get the current companion state for a session (if one exists).
   */
  getState(sessionId: string): CompanionState | null {
    return companionSessions.get(sessionId) ?? null;
  }

  /**
   * Generate a human-readable explanation of a workflow step.
   */
  private explainStep(step: WorkflowStep): string {
    const parts: string[] = [];
    parts.push(`Action: ${step.action}`);

    if (step.params && Object.keys(step.params).length > 0) {
      const paramDesc = Object.entries(step.params)
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(', ');
      parts.push(`Parameters: ${paramDesc}`);
    }

    if (step.timeout) {
      parts.push(`Timeout: ${step.timeout}s`);
    }

    if (step.onSuccess) {
      parts.push(`On success: ${step.onSuccess}`);
    }

    if (step.onFailure) {
      parts.push(`On failure: ${step.onFailure}`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * Sync companion state to the ShadowVoiceSession model.
   */
  private async syncSessionToDb(
    sessionId: string,
    workflowId: string,
    currentStep: number
  ): Promise<void> {
    try {
      await prisma.shadowVoiceSession.update({
        where: { id: sessionId },
        data: {
          currentWorkflowId: workflowId,
          currentWorkflowStep: currentStep,
        },
      });
    } catch {
      // Session may not exist in DB yet (e.g., during tests)
    }
  }
}

export const workflowCompanionService = new WorkflowCompanionService();
