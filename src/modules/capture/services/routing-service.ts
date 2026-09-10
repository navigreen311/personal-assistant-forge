// ============================================================================
// Auto-Routing Engine
// Evaluates capture items against routing rules in priority order.
// First matching rule determines the routing target.
// Includes routeAndStore for persisting captures to the correct Prisma model.
// ============================================================================

import { v4 as uuidv4 } from 'uuid';
import type {
  CaptureItem,
  RoutingResult,
  RoutingRule,
  RoutingCondition,
} from '@/modules/capture/types';
import { generateJSON } from '@/lib/ai';
import { prisma } from '@/lib/db';

/**
 * ============================================================================
 * P-13 -- TWO TENANCY HOLES CLOSED HERE
 * ============================================================================
 *
 * 1. RULES HAD NO OWNER. `this.rules` was one process-global array and
 *    `/api/capture/rules` let any authenticated caller add, edit or delete any
 *    entry in it. So a rule written by one tenant was evaluated against every
 *    other tenant's captures. Rules now carry a `userId`; built-in defaults
 *    carry `undefined` and are visible to everyone; every rule entry point
 *    takes the owner and matches on it.
 *
 * 2. THE WRITE TARGET WAS CALLER-CHOSEN. `routeAndStore` wrote the resulting
 *    Task / KnowledgeEntry / Document to `result.entityId || capture.entityId
 *    || ''` -- an entity id that reached it from a routing rule's
 *    `actions.entityId`, or from the capture's own unverified field. With (1),
 *    that meant `POST /api/capture/rules` with `actions.entityId = <tenant B>`
 *    caused every matching capture, from any tenant, to file a row into
 *    tenant B. The destination is now the capture's OWN entity, proven to
 *    belong to the capturing user, and a capture with no proven entity is not
 *    stored at all.
 */
class RoutingService {
  private rules: RoutingRule[] = [];

  constructor() {
    this.registerDefaultRules();
  }

  /** The rules that apply to `userId`: the built-in defaults plus their own. */
  private rulesFor(userId: string): RoutingRule[] {
    return this.rules.filter((r) => r.userId === undefined || r.userId === userId);
  }

  private registerDefaultRules(): void {
    const defaults: Array<Omit<RoutingRule, 'id'>> = [
      {
        name: 'Email forwards with invoice/receipt keywords -> EXPENSE',
        conditions: [
          { field: 'source', operator: 'equals', value: 'EMAIL_FORWARD' },
          { field: 'keyword', operator: 'contains', value: 'invoice|receipt|payment|billing|statement' },
        ],
        actions: { targetType: 'EXPENSE' },
        priority: 100,
        isActive: true,
      },
      {
        name: 'Camera scans of business cards -> CONTACT',
        conditions: [
          { field: 'source', operator: 'equals', value: 'CAMERA_SCAN' },
          { field: 'contentType', operator: 'equals', value: 'BUSINESS_CARD' },
        ],
        actions: { targetType: 'CONTACT' },
        priority: 90,
        isActive: true,
      },
      {
        name: 'Content with action verbs -> TASK',
        conditions: [
          { field: 'keyword', operator: 'contains', value: 'need to|must|should|deadline|follow up|action required|todo|to-do' },
        ],
        actions: { targetType: 'TASK' },
        priority: 50,
        isActive: true,
      },
      {
        name: 'Voice captures -> delegate to voice command handler',
        conditions: [
          { field: 'source', operator: 'equals', value: 'VOICE' },
        ],
        actions: { targetType: 'NOTE' },
        priority: 40,
        isActive: true,
      },
    ];

    for (const rule of defaults) {
      this.addRoutingRule(rule);
    }
  }

  async routeCapture(capture: CaptureItem): Promise<RoutingResult> {
    // Sort rules by priority descending (higher = evaluated first).
    // Only this capture's owner's rules (plus the built-in defaults) apply.
    const sortedRules = this.rulesFor(capture.userId)
      .filter((r) => r.isActive)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (this.evaluateConditions(capture, rule.conditions)) {
        return {
          targetType: rule.actions.targetType,
          // The capture's own entity wins. A rule may not redirect a row into an
          // entity the capturing user has not been proven to own.
          entityId: capture.entityId ?? '',
          projectId: rule.actions.projectId,
          priority: rule.actions.priority,
          confidence: 0.8,
          appliedRules: [rule.id],
        };
      }
    }

    // No rule matched — try AI-based routing
    try {
      const aiResult = await generateJSON<{
        targetType: string;
        confidence: number;
        reasoning: string;
      }>(`Determine where to route this captured content.

Content type: ${capture.contentType}
Source: ${capture.source}
Content: "${(capture.processedContent ?? capture.rawContent).substring(0, 1000)}"

Route to one of: TASK, CONTACT, NOTE, EVENT, MESSAGE, EXPENSE

Return JSON with: targetType, confidence (0-1), reasoning`, {
        maxTokens: 256,
        temperature: 0.3,
        system: 'You are a content routing specialist. Determine the best destination for captured content based on its nature and context.',
      });

      if (aiResult.confidence > 0.5) {
        return {
          targetType: aiResult.targetType as RoutingResult['targetType'],
          entityId: capture.entityId ?? '',
          confidence: aiResult.confidence,
          appliedRules: [],
        };
      }
    } catch {
      // AI routing failed — fall through to default
    }

    // Default to NOTE
    return {
      targetType: 'NOTE',
      entityId: capture.entityId ?? '',
      confidence: 0.3,
      appliedRules: [],
    };
  }

  async routeAndStore(
    capture: CaptureItem,
    userId: string
  ): Promise<RoutingResult & { storedId?: string }> {
    if (capture.userId !== userId) {
      throw new Error(`Capture "${capture.id}" not found`);
    }

    const result = await this.routeCapture(capture);

    // `capture.entityId` is only ever set from a VerifiedEntityId (see
    // CaptureService.createCapture). With no entity there is nothing to file
    // the row against, and guessing one is exactly the bug: return the routing
    // decision without storing.
    const entityId = capture.entityId;
    if (!entityId) {
      return result;
    }

    try {
      let storedId: string | undefined;

      switch (result.targetType) {
        case 'TASK': {
          const task = await prisma.task.create({
            data: {
              title: (capture.processedContent ?? capture.rawContent).substring(0, 100),
              description: capture.processedContent ?? capture.rawContent,
              status: 'TODO',
              priority: result.priority ?? 'P1',
              entityId,
              tags: ['from_capture'],
              createdFrom: { captureId: capture.id, source: capture.source },
            },
          });
          storedId = task.id;
          break;
        }
        case 'NOTE': {
          const entry = await prisma.knowledgeEntry.create({
            data: {
              content: capture.processedContent ?? capture.rawContent,
              source: capture.source,
              entityId,
              tags: ['from_capture'],
              linkedEntities: [],
            },
          });
          storedId = entry.id;
          break;
        }
        case 'CONTACT': {
          const doc = await prisma.document.create({
            data: {
              title: 'Captured Contact Info',
              entityId,
              type: 'CONTACT_CAPTURE',
              content: capture.processedContent ?? capture.rawContent,
              status: 'DRAFT',
            },
          });
          storedId = doc.id;
          break;
        }
        case 'EVENT': {
          const doc = await prisma.document.create({
            data: {
              title: 'Captured Event Info',
              entityId,
              type: 'EVENT_CAPTURE',
              content: capture.processedContent ?? capture.rawContent,
              status: 'DRAFT',
            },
          });
          storedId = doc.id;
          break;
        }
        case 'EXPENSE': {
          const doc = await prisma.document.create({
            data: {
              title: 'Captured Expense',
              entityId,
              type: 'EXPENSE_CAPTURE',
              content: capture.processedContent ?? capture.rawContent,
              status: 'DRAFT',
            },
          });
          storedId = doc.id;
          break;
        }
        default: {
          // Default: store as KnowledgeEntry
          const entry = await prisma.knowledgeEntry.create({
            data: {
              content: capture.processedContent ?? capture.rawContent,
              source: capture.source,
              entityId,
              tags: ['from_capture'],
              linkedEntities: [],
            },
          });
          storedId = entry.id;
        }
      }

      return { ...result, storedId };
    } catch {
      // Storage failed but routing succeeded
      return result;
    }
  }

  evaluateConditions(capture: CaptureItem, conditions: RoutingCondition[]): boolean {
    return conditions.every((condition) => this.evaluateCondition(capture, condition));
  }

  private evaluateCondition(capture: CaptureItem, condition: RoutingCondition): boolean {
    const fieldValue = this.getFieldValue(capture, condition.field);

    switch (condition.operator) {
      case 'equals':
        return fieldValue.toLowerCase() === condition.value.toLowerCase();
      case 'contains': {
        const keywords = condition.value.split('|');
        const lower = fieldValue.toLowerCase();
        return keywords.some((kw) => lower.includes(kw.toLowerCase()));
      }
      case 'matches': {
        try {
          const regex = new RegExp(condition.value, 'i');
          return regex.test(fieldValue);
        } catch {
          return false;
        }
      }
      case 'startsWith':
        return fieldValue.toLowerCase().startsWith(condition.value.toLowerCase());
      default:
        return false;
    }
  }

  private getFieldValue(capture: CaptureItem, field: RoutingCondition['field']): string {
    switch (field) {
      case 'source':
        return capture.source;
      case 'contentType':
        return capture.contentType;
      case 'content':
        return capture.processedContent ?? capture.rawContent;
      case 'keyword':
        return (capture.processedContent ?? capture.rawContent).toLowerCase();
      case 'sender':
        return capture.metadata.sourceApp ?? '';
      default:
        return '';
    }
  }

  /**
   * `userId` is required and is applied LAST, so a caller cannot supply their
   * own owner in the rule body. `undefined` is reserved for the built-in
   * defaults registered by the constructor.
   */
  addRoutingRule(rule: Omit<RoutingRule, 'id'>, userId?: string): RoutingRule {
    const newRule: RoutingRule = {
      ...rule,
      id: uuidv4(),
      userId,
    };
    this.rules.push(newRule);
    // Re-sort after adding
    this.rules.sort((a, b) => b.priority - a.priority);
    return newRule;
  }

  getRoutingRules(userId: string): RoutingRule[] {
    return this.rulesFor(userId).sort((a, b) => b.priority - a.priority);
  }

  updateRoutingRule(id: string, userId: string, updates: Partial<RoutingRule>): RoutingRule {
    // The owner is part of the match, so another tenant's rule -- and a built-in
    // default, which belongs to nobody -- is simply not found.
    const index = this.rules.findIndex((r) => r.id === id && r.userId === userId);
    if (index === -1) {
      throw new Error(`Routing rule "${id}" not found`);
    }

    const updated = { ...this.rules[index], ...updates, id, userId };
    this.rules[index] = updated;
    this.rules.sort((a, b) => b.priority - a.priority);
    return updated;
  }

  deleteRoutingRule(id: string, userId: string): void {
    const index = this.rules.findIndex((r) => r.id === id && r.userId === userId);
    if (index === -1) {
      throw new Error(`Routing rule "${id}" not found`);
    }
    this.rules.splice(index, 1);
  }

  // For testing
  clearRules(): void {
    this.rules = [];
  }

  resetToDefaults(): void {
    this.rules = [];
    this.registerDefaultRules();
  }
}

export const routingService = new RoutingService();
export { RoutingService };
