// Shadow Voice Agent — Intent Classifier
// Uses a fast Claude call to classify user messages into structured intents.

import { anthropic } from '@/lib/ai';
import type { AgentContext, ClassifiedIntent, IntentCategory } from '../types';

/**
 * Intent-to-metadata mapping. Each intent has a default confirmation level
 * and blast radius that can be overridden by the classifier based on context.
 */
const INTENT_METADATA: Record<
  IntentCategory,
  { confirmationLevel: ClassifiedIntent['confirmationLevel']; blastRadius: ClassifiedIntent['blastRadius'] }
> = {
  navigate:             { confirmationLevel: 'none',           blastRadius: 'self' },
  read_data:            { confirmationLevel: 'none',           blastRadius: 'self' },
  create_task:          { confirmationLevel: 'none',           blastRadius: 'entity' },
  draft_email:          { confirmationLevel: 'none',           blastRadius: 'self' },
  send_email:           { confirmationLevel: 'tap',            blastRadius: 'external' },
  classify_email:       { confirmationLevel: 'none',           blastRadius: 'entity' },
  search_knowledge:     { confirmationLevel: 'none',           blastRadius: 'self' },
  modify_calendar:      { confirmationLevel: 'tap',            blastRadius: 'entity' },
  complete_task:        { confirmationLevel: 'none',           blastRadius: 'entity' },
  create_invoice:       { confirmationLevel: 'tap',            blastRadius: 'entity' },
  send_invoice:         { confirmationLevel: 'confirm_phrase', blastRadius: 'external' },
  trigger_workflow:     { confirmationLevel: 'tap',            blastRadius: 'entity' },
  place_call:           { confirmationLevel: 'confirm_phrase', blastRadius: 'external' },
  bulk_email:           { confirmationLevel: 'confirm_phrase', blastRadius: 'public' },
  declare_crisis:       { confirmationLevel: 'voice_pin',      blastRadius: 'public' },
  make_payment:         { confirmationLevel: 'voice_pin',      blastRadius: 'external' },
  delete_data:          { confirmationLevel: 'confirm_phrase', blastRadius: 'entity' },
  activate_phone_tree:  { confirmationLevel: 'voice_pin',      blastRadius: 'public' },
  switch_entity:        { confirmationLevel: 'none',           blastRadius: 'self' },
  general_question:     { confirmationLevel: 'none',           blastRadius: 'self' },
};

/**
 * Intent-to-required-tools mapping. Lists the default tools each intent may need.
 */
const INTENT_TOOLS: Record<IntentCategory, string[]> = {
  navigate:             ['navigate_to_page'],
  read_data:            ['get_dashboard_stats', 'list_tasks', 'list_inbox', 'list_calendar_events', 'get_finance_summary'],
  create_task:          ['create_task'],
  draft_email:          ['draft_email'],
  send_email:           ['send_email'],
  classify_email:       ['classify_email'],
  search_knowledge:     ['search_knowledge_base'],
  modify_calendar:      ['modify_calendar_event', 'create_calendar_event'],
  complete_task:        ['complete_task'],
  create_invoice:       ['create_invoice'],
  send_invoice:         ['send_invoice_reminder'],
  trigger_workflow:     ['trigger_workflow'],
  place_call:           ['place_call'],
  bulk_email:           ['send_email'],
  declare_crisis:       ['trigger_workflow', 'send_email'],
  make_payment:         ['create_invoice', 'get_finance_summary'],
  delete_data:          ['update_task'],
  activate_phone_tree:  ['trigger_workflow', 'place_call'],
  switch_entity:        ['switch_entity'],
  general_question:     ['search_knowledge_base'],
};

const CLASSIFICATION_SYSTEM_PROMPT = `You are an intent classifier for a voice-first AI assistant called Shadow.
Classify the user message into exactly one intent category.

Available intent categories:
- navigate: User wants to go to a specific page or view
- read_data: User wants to see/read data (stats, lists, summaries)
- create_task: User wants to create a new task or todo
- draft_email: User wants to compose/draft an email
- send_email: User wants to send an email (already drafted or new)
- classify_email: User wants to triage/sort/categorize inbox messages
- search_knowledge: User wants to find information in the knowledge base
- modify_calendar: User wants to change or create calendar events
- complete_task: User wants to mark a task as done
- create_invoice: User wants to create a new invoice
- send_invoice: User wants to send an invoice reminder
- trigger_workflow: User wants to run an automation workflow
- place_call: User wants to initiate a phone call
- bulk_email: User wants to send emails to multiple recipients
- declare_crisis: User wants to trigger crisis/emergency protocols
- make_payment: User wants to process a financial payment
- delete_data: User wants to delete or archive records
- activate_phone_tree: User wants to start mass phone outreach
- switch_entity: User wants to change active business/entity context
- general_question: General question or conversation

Respond with valid JSON only. No markdown, no code fences.

JSON schema:
{
  "primaryIntent": "<intent_category>",
  "confidence": <0.0-1.0>,
  "entities": { "<entity_type>": "<entity_value>", ... },
  "reasoning": "<brief explanation>"
}

Entity types to extract: task_title, contact_name, email_subject, date, time, amount, entity_name, project_name, page_name, workflow_name, search_query.`;

/**
 * Classify a user message into a structured intent using Claude.
 *
 * Uses a fast, low-token call to determine user intent with extracted entities.
 * Falls back to 'general_question' if classification fails.
 */
export async function classifyIntent(
  message: string,
  context: AgentContext,
): Promise<ClassifiedIntent> {
  const contextHints = buildContextHints(context);

  const userPrompt = `Context:
${contextHints}

User message: "${message}"

Classify this message.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      temperature: 0,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = response.content[0];
    const text = block.type === 'text' ? block.text : '';
    const parsed = JSON.parse(text) as {
      primaryIntent: string;
      confidence: number;
      entities: Record<string, string>;
      reasoning: string;
    };

    const intent = parsed.primaryIntent as IntentCategory;
    const metadata = INTENT_METADATA[intent] ?? INTENT_METADATA.general_question;
    const tools = INTENT_TOOLS[intent] ?? INTENT_TOOLS.general_question;

    return {
      primaryIntent: intent,
      confidence: Math.min(1, Math.max(0, parsed.confidence)),
      entities: parsed.entities ?? {},
      requiredTools: tools,
      confirmationLevel: metadata.confirmationLevel,
      blastRadius: metadata.blastRadius,
    };
  } catch (error) {
    // Fallback to general_question on any parsing or API error
    console.error('[ShadowIntent] Classification failed, falling back:', error);
    return {
      primaryIntent: 'general_question',
      confidence: 0.1,
      entities: {},
      requiredTools: ['search_knowledge_base'],
      confirmationLevel: 'none',
      blastRadius: 'self',
    };
  }
}

/**
 * Build context hints string for the classifier.
 * Keeps it short to minimize tokens.
 */
function buildContextHints(context: AgentContext): string {
  const parts: string[] = [];

  parts.push(`User: ${context.user.name}`);
  parts.push(`Channel: ${context.channel}`);
  parts.push(`Time: ${context.timeOfDay}, ${context.dayOfWeek}`);

  if (context.activeEntity) {
    parts.push(`Active entity: ${context.activeEntity.name} (${context.activeEntity.type})`);
  }

  if (context.currentPage) {
    parts.push(`Current page: ${context.currentPage.title}`);
  }

  // Include the last 3 messages for conversational context
  if (context.recentMessages.length > 0) {
    const recent = context.recentMessages.slice(-3);
    parts.push('Recent conversation:');
    for (const msg of recent) {
      parts.push(`  ${msg.role}: ${msg.content.slice(0, 100)}`);
    }
  }

  return parts.join('\n');
}

/**
 * Get the default metadata for a known intent category.
 * Useful for testing and fallback logic.
 */
export function getIntentMetadata(intent: IntentCategory) {
  return INTENT_METADATA[intent] ?? INTENT_METADATA.general_question;
}

/**
 * Get the default tools for a known intent category.
 */
export function getIntentTools(intent: IntentCategory) {
  return INTENT_TOOLS[intent] ?? INTENT_TOOLS.general_question;
}
