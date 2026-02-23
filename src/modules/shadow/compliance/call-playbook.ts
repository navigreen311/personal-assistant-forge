// ============================================================================
// Shadow Voice Agent — Call Playbook Service
// CRUD operations for call playbooks (structured scripts for outbound/inbound
// call handling). Playbooks define step-by-step conversation flows,
// objection handling, escalation rules, and compliance checkpoints.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface PlaybookStep {
  order: number;
  type: 'greeting' | 'question' | 'script' | 'objection_handler' | 'escalation' | 'closing';
  content: string;
  expectedResponses?: string[];
  nextStepOnSuccess?: number;
  nextStepOnFailure?: number;
  requiredCompliance?: string[];
}

export interface Playbook {
  id: string;
  entityId: string;
  name: string;
  description: string;
  type: string;
  steps: PlaybookStep[];
  isActive: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// --- Call Playbook Service ---

export class CallPlaybookService {
  /**
   * List all playbooks for an entity.
   * Returns active playbooks by default.
   */
  async listPlaybooks(entityId: string): Promise<Playbook[]> {
    const playbooks = await prisma.shadowCallPlaybook.findMany({
      where: { entityId },
      orderBy: { updatedAt: 'desc' },
    });

    return playbooks.map((p) => this.mapPlaybook(p));
  }

  /**
   * Get a single playbook by ID.
   */
  async getPlaybook(id: string): Promise<Playbook> {
    const playbook = await prisma.shadowCallPlaybook.findUnique({
      where: { id },
    });

    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }

    return this.mapPlaybook(playbook);
  }

  /**
   * Create a new playbook.
   */
  async createPlaybook(data: Record<string, unknown>): Promise<Playbook> {
    const playbook = await prisma.shadowCallPlaybook.create({
      data: {
        entityId: data.entityId as string,
        name: data.name as string,
        description: (data.description as string) ?? '',
        type: (data.type as string) ?? 'general',
        steps: (data.steps ?? []) as Parameters<typeof prisma.shadowCallPlaybook.create>[0]['data']['steps'],
        isActive: (data.isActive as boolean) ?? true,
        tags: (data.tags ?? []) as string[],
      },
    });

    return this.mapPlaybook(playbook);
  }

  /**
   * Update an existing playbook.
   */
  async updatePlaybook(
    id: string,
    data: Record<string, unknown>,
  ): Promise<Playbook> {
    const existing = await prisma.shadowCallPlaybook.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Playbook ${id} not found`);
    }

    const updateData: Record<string, unknown> = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.steps !== undefined) updateData.steps = data.steps;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const playbook = await prisma.shadowCallPlaybook.update({
      where: { id },
      data: updateData,
    });

    return this.mapPlaybook(playbook);
  }

  /**
   * Delete a playbook.
   */
  async deletePlaybook(id: string): Promise<void> {
    const existing = await prisma.shadowCallPlaybook.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Playbook ${id} not found`);
    }

    await prisma.shadowCallPlaybook.delete({
      where: { id },
    });
  }

  // --- Private helpers ---

  private mapPlaybook(dbPlaybook: Record<string, unknown>): Playbook {
    return {
      id: dbPlaybook.id as string,
      entityId: dbPlaybook.entityId as string,
      name: dbPlaybook.name as string,
      description: (dbPlaybook.description as string) ?? '',
      type: (dbPlaybook.type as string) ?? 'general',
      steps: (dbPlaybook.steps ?? []) as PlaybookStep[],
      isActive: (dbPlaybook.isActive as boolean) ?? true,
      tags: (dbPlaybook.tags ?? []) as string[],
      createdAt: dbPlaybook.createdAt as Date,
      updatedAt: dbPlaybook.updatedAt as Date,
    };
  }
}

// Singleton export
export const callPlaybookService = new CallPlaybookService();
