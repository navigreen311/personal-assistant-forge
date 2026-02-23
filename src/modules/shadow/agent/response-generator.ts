// Shadow Voice Agent — Response Generator
// Generates rich responses with citations and appropriate content types based on channel.

import type {
  ShadowResponse,
  AgentContext,
  Citation,
  ActionCard,
  NavigationCard,
  DecisionCard,
  ToolResult,
  MessageTelemetry,
  ClassifiedIntent,
} from '../types';

/**
 * Build a ShadowResponse from the Claude output, tool results, and context.
 *
 * Determines the content type based on tool results and intent, then
 * assembles citations, action cards, navigation cards, etc.
 */
export function generateResponse(params: {
  text: string;
  intent: ClassifiedIntent;
  toolResults: ToolResult[];
  context: AgentContext;
  sessionId: string;
  messageId?: string;
  telemetry: MessageTelemetry;
}): ShadowResponse {
  const { text, intent, toolResults, context, sessionId, messageId, telemetry } = params;

  // Determine content type from tool results and intent
  const contentType = resolveContentType(intent, toolResults);

  // Extract citations from tool results
  const citations = extractCitations(toolResults);

  // Build cards based on content type and tool data
  const actionCards = buildActionCards(intent, toolResults);
  const navigationCards = buildNavigationCards(toolResults);
  const decisionCards = buildDecisionCards(intent, toolResults);

  // Adapt text for channel (more concise for phone, richer for web)
  const adaptedText = adaptTextForChannel(text, context.channel);

  return {
    text: adaptedText,
    contentType,
    citations: citations.length > 0 ? citations : undefined,
    actionCards: actionCards.length > 0 ? actionCards : undefined,
    navigationCards: navigationCards.length > 0 ? navigationCards : undefined,
    decisionCards: decisionCards.length > 0 ? decisionCards : undefined,
    telemetry,
    sessionId,
    messageId,
  };
}

// ─── Content Type Resolution ────────────────────────────────────────────────

function resolveContentType(
  intent: ClassifiedIntent,
  toolResults: ToolResult[],
): ShadowResponse['contentType'] {
  // Check for navigation results
  const hasNavigation = toolResults.some(
    (r) => r.toolName === 'navigate_to_page' && r.success,
  );
  if (hasNavigation) return 'NAVIGATION_CARD';

  // Check for confirmation-required actions
  if (intent.confirmationLevel === 'confirm_phrase' || intent.confirmationLevel === 'voice_pin') {
    return 'CONFIRMATION_CARD';
  }

  // Check for decision-related intents
  if (intent.primaryIntent === 'general_question' && toolResults.length === 0) {
    return 'TEXT';
  }

  // Check for list results
  const hasListData = toolResults.some((r) => {
    if (!r.success || !r.data) return false;
    const data = r.data as Record<string, unknown>;
    return (
      Array.isArray(data.tasks) ||
      Array.isArray(data.messages) ||
      Array.isArray(data.events) ||
      Array.isArray(data.contacts) ||
      Array.isArray(data.projects) ||
      Array.isArray(data.records) ||
      Array.isArray(data.entries) ||
      Array.isArray(data.expenses) ||
      Array.isArray(data.entities)
    );
  });
  if (hasListData) return 'LIST_CARD';

  // Check for action results (create, update, complete, etc.)
  const hasAction = toolResults.some((r) => {
    if (!r.success || !r.data) return false;
    const data = r.data as Record<string, unknown>;
    return data.created || data.updated || data.completed || data.sent || data.triggered;
  });
  if (hasAction) return 'ACTION_CARD';

  return 'TEXT';
}

// ─── Citation Extraction ────────────────────────────────────────────────────

function extractCitations(toolResults: ToolResult[]): Citation[] {
  const citations: Citation[] = [];

  for (const result of toolResults) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;

    // Extract IDs from list results to create citations
    const listKeys = ['tasks', 'messages', 'events', 'contacts', 'projects', 'records', 'entries', 'expenses'];
    for (const key of listKeys) {
      const items = data[key] as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(items)) continue;

      for (const item of items.slice(0, 5)) {
        if (item.id && (item.title || item.name || item.subject)) {
          citations.push({
            type: key.replace(/s$/, ''),
            id: item.id as string,
            label: (item.title ?? item.name ?? item.subject) as string,
            deepLink: `/${key}/${item.id}`,
          });
        }
      }
    }

    // Extract from single record results
    if (data.taskId) {
      citations.push({
        type: 'task',
        id: data.taskId as string,
        label: (data.title as string) ?? 'Task',
        deepLink: `/tasks/${data.taskId}`,
      });
    }
    if (data.eventId) {
      citations.push({
        type: 'event',
        id: data.eventId as string,
        label: (data.title as string) ?? 'Event',
        deepLink: `/calendar/${data.eventId}`,
      });
    }
    if (data.messageId) {
      citations.push({
        type: 'message',
        id: data.messageId as string,
        label: (data.subject as string) ?? 'Message',
        deepLink: `/inbox/${data.messageId}`,
      });
    }
    if (data.contactId) {
      citations.push({
        type: 'contact',
        id: data.contactId as string,
        label: (data.name as string) ?? 'Contact',
        deepLink: `/contacts/${data.contactId}`,
      });
    }
    if (data.recordId) {
      citations.push({
        type: 'financial_record',
        id: data.recordId as string,
        label: `$${data.amount ?? '?'}`,
        deepLink: `/finance/${data.recordId}`,
      });
    }
    if (data.workflowId) {
      citations.push({
        type: 'workflow',
        id: data.workflowId as string,
        label: (data.name as string) ?? 'Workflow',
        deepLink: `/workflows/${data.workflowId}`,
      });
    }
    if (data.entryId) {
      citations.push({
        type: 'knowledge',
        id: data.entryId as string,
        label: 'Knowledge Entry',
        deepLink: `/knowledge/${data.entryId}`,
      });
    }
  }

  return citations;
}

// ─── Card Builders ──────────────────────────────────────────────────────────

function buildActionCards(
  intent: ClassifiedIntent,
  toolResults: ToolResult[],
): ActionCard[] {
  const cards: ActionCard[] = [];

  for (const result of toolResults) {
    if (!result.success || !result.data) continue;
    const data = result.data as Record<string, unknown>;

    // Task creation card
    if (data.created && data.taskId) {
      cards.push({
        id: data.taskId as string,
        title: `Task Created: ${data.title ?? 'New Task'}`,
        description: `Task has been created and assigned.`,
        options: [
          { label: 'View Task', action: `navigate:/tasks/${data.taskId}`, style: 'primary' },
          { label: 'Set Due Date', action: `update_task:${data.taskId}:dueDate`, style: 'secondary' },
        ],
      });
    }

    // Email sent card
    if (data.sent && data.messageId) {
      cards.push({
        id: data.messageId as string,
        title: 'Email Sent',
        description: `Email has been sent successfully.`,
        options: [
          { label: 'View in Inbox', action: `navigate:/inbox/${data.messageId}`, style: 'primary' },
        ],
      });
    }

    // Invoice created card
    if (data.created && data.recordId) {
      cards.push({
        id: data.recordId as string,
        title: `Invoice Created: $${data.amount ?? '?'}`,
        description: `Financial record has been created.`,
        options: [
          { label: 'View Invoice', action: `navigate:/finance/${data.recordId}`, style: 'primary' },
          { label: 'Send Reminder', action: `send_invoice_reminder:${data.recordId}`, style: 'secondary' },
        ],
      });
    }

    // Workflow triggered card
    if (data.triggered && data.workflowId) {
      cards.push({
        id: data.workflowId as string,
        title: `Workflow Triggered: ${data.name ?? 'Workflow'}`,
        description: `The workflow has been started.`,
        options: [
          { label: 'View Status', action: `navigate:/workflows/${data.workflowId}`, style: 'primary' },
        ],
      });
    }

    // Task completed card
    if (data.completed && data.taskId) {
      cards.push({
        id: data.taskId as string,
        title: `Task Completed: ${data.title ?? 'Task'}`,
        description: `Task has been marked as done.`,
        options: [
          { label: 'Undo', action: `update_task:${data.taskId}:status:TODO`, style: 'danger' },
          { label: 'View Task', action: `navigate:/tasks/${data.taskId}`, style: 'secondary' },
        ],
      });
    }
  }

  // Add confirmation card for high-blast-radius actions
  if (
    intent.confirmationLevel !== 'none' &&
    toolResults.length === 0
  ) {
    cards.push({
      id: `confirm-${intent.primaryIntent}`,
      title: 'Confirmation Required',
      description: `This action requires ${intent.confirmationLevel.replace('_', ' ')} confirmation.`,
      options: [
        { label: 'Confirm', action: `confirm:${intent.primaryIntent}`, style: 'primary' },
        { label: 'Cancel', action: 'cancel', style: 'danger' },
      ],
    });
  }

  return cards;
}

function buildNavigationCards(toolResults: ToolResult[]): NavigationCard[] {
  const cards: NavigationCard[] = [];

  for (const result of toolResults) {
    if (result.toolName !== 'navigate_to_page' || !result.success) continue;
    const data = result.data as Record<string, unknown>;

    cards.push({
      title: `Navigate to ${data.page ?? 'page'}`,
      description: `Opening ${data.page}${data.recordId ? ` for record ${data.recordId}` : ''}`,
      deepLink: data.deepLink as string,
      recordType: data.page as string,
      recordId: (data.recordId as string) ?? '',
    });
  }

  // Also build navigation cards from entity switch
  for (const result of toolResults) {
    if (result.toolName !== 'switch_entity' || !result.success) continue;
    const data = result.data as Record<string, unknown>;
    if (data.switched) {
      cards.push({
        title: `Switched to ${data.name}`,
        description: `Now working with entity: ${data.name} (${data.type})`,
        deepLink: '/dashboard',
        recordType: 'entity',
        recordId: data.entityId as string,
      });
    }
  }

  return cards;
}

function buildDecisionCards(
  _intent: ClassifiedIntent,
  toolResults: ToolResult[],
): DecisionCard[] {
  const cards: DecisionCard[] = [];

  // Build decision cards from entity list (when user needs to choose)
  for (const result of toolResults) {
    if (result.toolName !== 'get_entity_list' || !result.success) continue;
    const data = result.data as Record<string, unknown>;
    const entities = data.entities as Array<Record<string, unknown>> | undefined;
    if (entities && entities.length > 1) {
      cards.push({
        question: 'Which entity would you like to work with?',
        options: entities.map((e) => ({
          id: e.id as string,
          label: e.name as string,
          description: e.type as string,
        })),
      });
    }
  }

  return cards;
}

// ─── Channel Adaptation ─────────────────────────────────────────────────────

/**
 * Adapt response text for the channel.
 * - Phone: strip markdown, shorter sentences
 * - Mobile: moderate length
 * - Web: full richness
 */
function adaptTextForChannel(text: string, channel: string): string {
  if (channel === 'phone') {
    // Strip markdown formatting
    let cleaned = text
      .replace(/#{1,6}\s/g, '')     // Headers
      .replace(/\*\*(.*?)\*\*/g, '$1')  // Bold
      .replace(/\*(.*?)\*/g, '$1')      // Italic
      .replace(/`(.*?)`/g, '$1')        // Inline code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links
      .replace(/^\s*[-*]\s/gm, '');    // List bullets

    // Truncate if too long for voice
    if (cleaned.length > 500) {
      cleaned = cleaned.slice(0, 497) + '...';
    }

    return cleaned;
  }

  if (channel === 'mobile') {
    // Moderate truncation
    if (text.length > 1000) {
      return text.slice(0, 997) + '...';
    }
    return text;
  }

  // Web: full response
  return text;
}
