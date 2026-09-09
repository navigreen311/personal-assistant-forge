// ============================================================================
// Shadow Voice Agent — Call Playbook Service
// CRUD operations for call playbooks: the per-scenario guardrails Shadow uses
// on a call — opening script, what data it may disclose, what it must never
// disclose, when to escalate, and what outcome it must record.
//
// Backed by the `VoiceforgeCallPlaybook` table. This service previously
// addressed a `shadowCallPlaybook` model that has never existed, and described
// a different entity (a step-by-step flow with `steps`/`isActive`/`tags`);
// every call therefore threw at runtime. The DTO below is the real table.
// ============================================================================

import { prisma } from '@/lib/db';

// --- Types ---

export interface Playbook {
  id: string;
  entityId: string;
  name: string;
  /** What this playbook is for, e.g. "Confirm upcoming appointments". */
  scenario: string;
  openingScript: string | null;
  /** Field names the agent is permitted to disclose on this call. */
  dataAllowed: string[];
  /** Field names the agent must never disclose on this call. */
  neverDisclose: string[];
  /** Conditions that hand the call to a human. */
  escalationTriggers: string[];
  escalationAction: string | null;
  /** Hard cap on call length, in seconds. */
  maxDuration: number;
  /** Outcomes the agent must record when the call ends. */
  outcomeFields: string[];
}

/** The subset of `VoiceforgeCallPlaybook` columns this service reads. */
type PlaybookRow = {
  id: string;
  entityId: string;
  name: string;
  scenario: string;
  openingScript: string | null;
  dataAllowed: unknown;
  neverDisclose: unknown;
  escalationTriggers: unknown;
  escalationAction: string | null;
  maxDuration: number;
  outcomeFields: unknown;
};

// --- Helpers ---

/** Coerce a Prisma `Json` column that is documented as a string array. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? toStringArray(value) : undefined;
}

// --- Call Playbook Service ---

export class CallPlaybookService {
  /**
   * List all playbooks for an entity.
   */
  async listPlaybooks(entityId: string): Promise<Playbook[]> {
    const playbooks = await prisma.voiceforgeCallPlaybook.findMany({
      where: { entityId },
      orderBy: { name: 'asc' },
    });

    return playbooks.map((p) => this.mapPlaybook(p));
  }

  /**
   * Get a single playbook by ID.
   */
  async getPlaybook(id: string): Promise<Playbook> {
    const playbook = await prisma.voiceforgeCallPlaybook.findUnique({
      where: { id },
    });

    if (!playbook) {
      throw new Error(`Playbook ${id} not found`);
    }

    return this.mapPlaybook(playbook);
  }

  /**
   * Create a new playbook. `entityId`, `name` and `scenario` are required;
   * everything else falls back to the column default.
   */
  async createPlaybook(data: Record<string, unknown>): Promise<Playbook> {
    const entityId = optionalString(data.entityId);
    const name = optionalString(data.name);
    // `description` is the legacy request field for what is now `scenario`.
    const scenario = optionalString(data.scenario) ?? optionalString(data.description);

    if (!entityId) throw new Error('entityId is required');
    if (!name) throw new Error('name is required');
    if (!scenario) throw new Error('scenario is required');

    const playbook = await prisma.voiceforgeCallPlaybook.create({
      data: {
        entityId,
        name,
        scenario,
        openingScript: optionalString(data.openingScript) ?? null,
        dataAllowed: optionalStringArray(data.dataAllowed) ?? [],
        neverDisclose: optionalStringArray(data.neverDisclose) ?? [],
        escalationTriggers: optionalStringArray(data.escalationTriggers) ?? [],
        escalationAction: optionalString(data.escalationAction) ?? null,
        ...(typeof data.maxDuration === 'number' ? { maxDuration: data.maxDuration } : {}),
        outcomeFields: optionalStringArray(data.outcomeFields) ?? [],
      },
    });

    return this.mapPlaybook(playbook);
  }

  /**
   * Update an existing playbook. Only the fields present in `data` are written.
   */
  async updatePlaybook(id: string, data: Record<string, unknown>): Promise<Playbook> {
    const existing = await prisma.voiceforgeCallPlaybook.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Playbook ${id} not found`);
    }

    const name = optionalString(data.name);
    const scenario = optionalString(data.scenario) ?? optionalString(data.description);
    const openingScript = optionalString(data.openingScript);
    const escalationAction = optionalString(data.escalationAction);
    const dataAllowed = optionalStringArray(data.dataAllowed);
    const neverDisclose = optionalStringArray(data.neverDisclose);
    const escalationTriggers = optionalStringArray(data.escalationTriggers);
    const outcomeFields = optionalStringArray(data.outcomeFields);

    const playbook = await prisma.voiceforgeCallPlaybook.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(scenario !== undefined ? { scenario } : {}),
        ...(openingScript !== undefined ? { openingScript } : {}),
        ...(escalationAction !== undefined ? { escalationAction } : {}),
        ...(dataAllowed !== undefined ? { dataAllowed } : {}),
        ...(neverDisclose !== undefined ? { neverDisclose } : {}),
        ...(escalationTriggers !== undefined ? { escalationTriggers } : {}),
        ...(outcomeFields !== undefined ? { outcomeFields } : {}),
        ...(typeof data.maxDuration === 'number' ? { maxDuration: data.maxDuration } : {}),
      },
    });

    return this.mapPlaybook(playbook);
  }

  /**
   * Delete a playbook.
   */
  async deletePlaybook(id: string): Promise<void> {
    const existing = await prisma.voiceforgeCallPlaybook.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error(`Playbook ${id} not found`);
    }

    await prisma.voiceforgeCallPlaybook.delete({
      where: { id },
    });
  }

  // --- Private helpers ---

  private mapPlaybook(row: PlaybookRow): Playbook {
    return {
      id: row.id,
      entityId: row.entityId,
      name: row.name,
      scenario: row.scenario,
      openingScript: row.openingScript,
      dataAllowed: toStringArray(row.dataAllowed),
      neverDisclose: toStringArray(row.neverDisclose),
      escalationTriggers: toStringArray(row.escalationTriggers),
      escalationAction: row.escalationAction,
      maxDuration: row.maxDuration,
      outcomeFields: toStringArray(row.outcomeFields),
    };
  }
}

// Singleton export
export const callPlaybookService = new CallPlaybookService();
