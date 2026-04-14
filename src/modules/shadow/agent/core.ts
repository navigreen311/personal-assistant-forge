// Shadow Voice Agent — Core Runtime
// The "brain" of Shadow: processes messages through intent classification,
// context assembly, safety checks, tool-use loop, and response generation.

import { anthropic } from '@/lib/ai';
import { prisma } from '@/lib/db';
import type {
  ShadowResponse,
  AgentContext,
  ClassifiedIntent,
  ToolResult,
  MessageTelemetry,
  ToolDefinition,
} from '../types';
import { ToolRouter } from './tool-router';
import { ShadowMemory } from './memory';
import { classifyIntent } from './intent-classifier';
import { buildContext } from './context-engine';
import { generateResponse } from './response-generator';
import { computeRiskScore, isBusinessHours } from './risk-scorer';

const MAX_TOOL_ITERATIONS = 5;
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export class ShadowAgent {
  private toolRouter: ToolRouter;
  private memory: ShadowMemory;

  constructor() {
    this.toolRouter = new ToolRouter();
    this.memory = new ShadowMemory();
  }

  /**
   * Process a user message through the full agent pipeline.
   *
   * Pipeline:
   * 1. Ensure session exists
   * 2. Build agent context from DB
   * 3. Classify intent
   * 4. Check safety / risk scoring
   * 5. Check if confirmation is needed
   * 6. Run tool-use loop with Claude
   * 7. Generate response with citations and cards
   * 8. Save messages to DB
   * 9. Create consent receipt if actions were taken
   * 10. Return response with telemetry
   */
  async processMessage(params: {
    userId: string;
    sessionId?: string;
    message: string;
    channel: 'web' | 'phone' | 'mobile';
    currentPage?: string;
    activeEntityId?: string;
    deviceFingerprint?: string;
  }): Promise<ShadowResponse> {
    const startTime = Date.now();
    const telemetry: MessageTelemetry = {
      toolCalls: [],
      totalMs: 0,
    };

    // 1. Ensure session
    const sessionId =
      params.sessionId ??
      (await this.memory.getOrCreateSession({
        userId: params.userId,
        channel: params.channel,
        activeEntityId: params.activeEntityId,
        currentPage: params.currentPage,
      }));

    // Save user message
    await this.memory.addMessage(sessionId, {
      role: 'user',
      content: params.message,
      channel: params.channel,
    });

    // 2. Build context
    const contextStart = Date.now();
    const context = await buildContext({
      userId: params.userId,
      sessionId,
      channel: params.channel,
      currentPage: params.currentPage,
      activeEntityId: params.activeEntityId,
    });
    telemetry.contextAssemblyMs = Date.now() - contextStart;

    // 3. Classify intent
    const intentStart = Date.now();
    const intent = await classifyIntent(params.message, context);
    telemetry.intentClassificationMs = Date.now() - intentStart;

    // 4. Check safety / risk scoring
    const riskAssessment = await this.assessRisk(
      intent,
      context,
      params.userId,
      params.channel,
      params.deviceFingerprint,
    );

    // 5. Check if confirmation is needed (upgrade confirmation level based on risk)
    const effectiveConfirmation = this.resolveConfirmationLevel(
      intent.confirmationLevel,
      riskAssessment.requiredConfirmation,
    );

    if (effectiveConfirmation !== 'none' && effectiveConfirmation !== 'tap') {
      // For high-risk actions, return a confirmation card instead of executing
      const confirmResponse = this.buildConfirmationResponse(
        intent,
        effectiveConfirmation,
        riskAssessment.score,
        sessionId,
        telemetry,
        startTime,
      );

      // Save assistant response
      await this.memory.addMessage(sessionId, {
        role: 'assistant',
        content: confirmResponse.text,
        contentType: confirmResponse.contentType,
        intent: intent.primaryIntent,
        channel: params.channel,
      });

      return confirmResponse;
    }

    // 6. Run tool-use loop with Claude
    const responseStart = Date.now();
    const { text, toolResults, tokensIn, tokensOut } = await this.runToolLoop(
      params.message,
      context,
      intent,
      telemetry,
    );
    telemetry.responseGenerationMs = Date.now() - responseStart;
    telemetry.model = DEFAULT_MODEL;
    telemetry.tokensIn = tokensIn;
    telemetry.tokensOut = tokensOut;

    // 7. Generate response with citations and cards
    telemetry.totalMs = Date.now() - startTime;
    const response = generateResponse({
      text,
      intent,
      toolResults,
      context,
      sessionId,
      telemetry,
    });

    // 8. Save assistant message to DB
    const messageId = await this.memory.addMessage(sessionId, {
      role: 'assistant',
      content: response.text,
      contentType: response.contentType,
      intent: intent.primaryIntent,
      toolsUsed: toolResults.map((r) => r.toolName),
      actionsTaken: toolResults
        .filter((r) => r.success)
        .map((r) => r.toolName),
      channel: params.channel,
      confidence: intent.confidence,
      latencyMs: telemetry.totalMs,
      telemetry: telemetry as unknown as Record<string, unknown>,
    });

    response.messageId = messageId;

    // 9. Create consent receipts for actions taken
    await this.createConsentReceipts(
      sessionId,
      messageId,
      intent,
      toolResults,
      context,
    );

    return response;
  }

  // ─── Core Tool-Use Loop ─────────────────────────────────────────────────

  /**
   * The agentic tool-use loop: send to Claude with tools, handle tool_use
   * blocks, execute tools, send results back, and iterate.
   * Max iterations to prevent infinite loops.
   */
  private async runToolLoop(
    userMessage: string,
    context: AgentContext,
    intent: ClassifiedIntent,
    telemetry: MessageTelemetry,
  ): Promise<{
    text: string;
    toolResults: ToolResult[];
    tokensIn: number;
    tokensOut: number;
  }> {
    const tools = this.toolRouter.getToolDefinitions();
    const systemPrompt = this.buildSystemPrompt(context, intent);
    const allToolResults: ToolResult[] = [];
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    // Build the conversation messages starting with session history + new message
    const conversationMessages: Array<{
      role: 'user' | 'assistant';
      content: string | Array<Record<string, unknown>>;
    }> = [];

    // Add recent conversation history for context
    for (const msg of context.recentMessages.slice(-10)) {
      conversationMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // Add current user message
    conversationMessages.push({
      role: 'user',
      content: userMessage,
    });

    let iterations = 0;
    let finalText = '';

    while (iterations < MAX_TOOL_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        temperature: 0.3,
        system: systemPrompt,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })) as unknown as Parameters<
          typeof anthropic.messages.create
        >[0]['tools'],
        messages: conversationMessages as unknown as Parameters<
          typeof anthropic.messages.create
        >[0]['messages'],
      });

      totalTokensIn += response.usage?.input_tokens ?? 0;
      totalTokensOut += response.usage?.output_tokens ?? 0;

      // Check if response contains tool_use blocks
      const hasToolUse = response.content.some((b) => b.type === 'tool_use');

      if (!hasToolUse) {
        // No tool use — extract text and we're done
        for (const block of response.content) {
          if (block.type === 'text') {
            finalText += block.text;
          }
        }
        break;
      }

      // Process tool_use blocks
      const assistantContent: Array<Record<string, unknown>> = [];
      const toolResultBlocks: Array<Record<string, unknown>> = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text });
          finalText += block.text;
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });

          // Execute the tool
          const toolStart = Date.now();
          const result = await this.toolRouter.executeTool(
            block.name,
            block.input as Record<string, unknown>,
            context,
          );
          allToolResults.push(result);

          telemetry.toolCalls.push({
            tool: block.name,
            durationMs: result.durationMs,
            status: result.success ? 'success' : 'error',
          });

          // Build tool result block for Claude
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result.success
              ? JSON.stringify(result.data)
              : JSON.stringify({ error: result.error }),
          });
        }
      }

      // Add assistant response and tool results to conversation
      conversationMessages.push({
        role: 'assistant',
        content: assistantContent,
      });

      conversationMessages.push({
        role: 'user',
        content: toolResultBlocks,
      });
    }

    // If we ran out of iterations without a final text response
    if (!finalText && iterations >= MAX_TOOL_ITERATIONS) {
      finalText = 'I performed the requested actions. Let me know if you need anything else.';
    }

    return {
      text: finalText,
      toolResults: allToolResults,
      tokensIn: totalTokensIn,
      tokensOut: totalTokensOut,
    };
  }

  // ─── System Prompt Builder ──────────────────────────────────────────────

  private buildSystemPrompt(context: AgentContext, intent: ClassifiedIntent): string {
    const channelGuidance = this.getChannelGuidance(context.channel);
    const entityContext = context.activeEntity
      ? `\nActive Entity: ${context.activeEntity.name} (${context.activeEntity.type})
Compliance profiles: ${context.activeEntity.complianceProfile.join(', ') || 'none'}`
      : '\nNo active entity selected. The user may need to switch entity first.';

    const pageContext = context.currentPage
      ? `\nCurrent page: ${context.currentPage.title}`
      : '';

    const recentActionsContext =
      context.recentActions.length > 0
        ? `\nRecent actions:\n${context.recentActions
            .slice(0, 5)
            .map((a) => `- ${a.type}: ${a.description}`)
            .join('\n')}`
        : '';

    return `You are Shadow, a voice-first AI chief of staff for ${context.user.name}. You help manage their business operations, communications, tasks, calendar, finances, and more through natural conversation.

PERSONA:
- Professional yet warm. Concise and action-oriented.
- You anticipate needs and offer proactive suggestions when appropriate.
- You always cite sources when referencing data (use record IDs).
- You confirm before taking high-impact actions.
- You never fabricate data — if you don't have the information, say so.

USER CONTEXT:
Name: ${context.user.name}
Email: ${context.user.email}
Timezone: ${context.user.timezone}
Time: ${context.timeOfDay} (${context.dayOfWeek})
Channel: ${context.channel}${entityContext}${pageContext}${recentActionsContext}

DETECTED INTENT: ${intent.primaryIntent} (confidence: ${intent.confidence.toFixed(2)})

CHANNEL GUIDANCE:
${channelGuidance}

INSTRUCTIONS:
1. Use the available tools to fulfill the user's request. Call tools as needed.
2. When displaying data, be specific and cite record IDs.
3. For destructive or high-impact actions, explain what will happen before proceeding.
4. If the request is ambiguous, ask a clarifying question.
5. Keep responses focused and relevant to the request.
6. When listing items, show the most important/relevant ones first.
7. After completing an action, confirm what was done and offer related follow-ups.`;
  }

  private getChannelGuidance(channel: string): string {
    switch (channel) {
      case 'phone':
        return `Voice channel — keep responses SHORT (2-3 sentences max). No markdown.
Use natural spoken language. Spell out numbers. Avoid lists longer than 3 items.
For longer data, summarize and offer to send details via web/email.`;
      case 'mobile':
        return `Mobile channel — moderate length. Use brief formatting.
Bullet points are okay for up to 5 items. Keep paragraphs short.`;
      case 'web':
      default:
        return `Web channel — full richness allowed. Use markdown formatting.
Lists, tables, and detailed responses are appropriate. Include deep links to records.`;
    }
  }

  // ─── Risk Assessment ──────────────────────────────────────────────────

  private async assessRisk(
    intent: ClassifiedIntent,
    context: AgentContext,
    userId: string,
    channel: 'web' | 'phone' | 'mobile',
    deviceFingerprint?: string,
  ) {
    // Determine if trusted device
    let trusted = true;
    if (deviceFingerprint) {
      const device = await prisma.shadowTrustedDevice.findFirst({
        where: { userId, deviceFingerprint, isActive: true },
      });
      trusted = device !== null;
    } else if (channel === 'phone') {
      // Phone without fingerprint is untrusted
      trusted = false;
    }

    // Count recent actions
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const actionsInLastHour = await prisma.actionLog.count({
      where: { actorId: userId, timestamp: { gte: oneHourAgo } },
    });

    // Check if first-time action
    const priorActions = await prisma.actionLog.count({
      where: { actorId: userId, actionType: intent.primaryIntent },
    });

    // Extract financial amount from entities if present
    const financialAmount = intent.entities.amount
      ? parseFloat(intent.entities.amount)
      : undefined;

    return computeRiskScore({
      financialAmount,
      blastRadius: intent.blastRadius,
      channel,
      isBusinessHours: isBusinessHours(context.user.timezone),
      actionsInLastHour,
      isFirstTimeAction: priorActions === 0,
      isTrustedDevice: trusted,
    });
  }

  // ─── Confirmation Logic ───────────────────────────────────────────────

  /**
   * Resolve the effective confirmation level.
   * Takes the higher of intent-based and risk-based requirements.
   */
  private resolveConfirmationLevel(
    intentLevel: ClassifiedIntent['confirmationLevel'],
    riskLevel: string,
  ): string {
    const levels = ['none', 'tap', 'confirm_phrase', 'voice_pin', 'voice_pin_sms'];
    const intentIdx = levels.indexOf(intentLevel);
    const riskIdx = levels.indexOf(riskLevel);
    return levels[Math.max(intentIdx, riskIdx)] ?? 'none';
  }

  private buildConfirmationResponse(
    intent: ClassifiedIntent,
    confirmationLevel: string,
    riskScore: number,
    sessionId: string,
    telemetry: MessageTelemetry,
    startTime: number,
  ): ShadowResponse {
    const levelDescription = confirmationLevel
      .replace(/_/g, ' ')
      .replace('voice pin sms', 'voice PIN and SMS verification')
      .replace('voice pin', 'voice PIN')
      .replace('confirm phrase', 'confirmation phrase');

    telemetry.totalMs = Date.now() - startTime;

    return {
      text: `This action (${intent.primaryIntent.replace(/_/g, ' ')}) requires ${levelDescription} confirmation due to its impact level (risk score: ${riskScore}). Please confirm to proceed.`,
      contentType: 'CONFIRMATION_CARD',
      actionCards: [
        {
          id: `confirm-${intent.primaryIntent}-${Date.now()}`,
          title: `Confirm: ${intent.primaryIntent.replace(/_/g, ' ')}`,
          description: `Blast radius: ${intent.blastRadius}. Confirmation required: ${levelDescription}.`,
          options: [
            { label: 'Confirm', action: `confirm:${intent.primaryIntent}`, style: 'primary' },
            { label: 'Cancel', action: 'cancel', style: 'danger' },
          ],
        },
      ],
      telemetry,
      sessionId,
    };
  }

  // ─── Consent Receipts ─────────────────────────────────────────────────

  /**
   * Create consent receipts for any actions taken by tools.
   */
  private async createConsentReceipts(
    sessionId: string,
    messageId: string,
    intent: ClassifiedIntent,
    toolResults: ToolResult[],
    context: AgentContext,
  ): Promise<void> {
    const actionResults = toolResults.filter((r) => {
      if (!r.success || !r.data) return false;
      const data = r.data as Record<string, unknown>;
      return (
        data.created || data.updated || data.completed ||
        data.sent || data.triggered || data.classified ||
        data.switched || data.reminderSent
      );
    });

    for (const result of actionResults) {
      const data = result.data as Record<string, unknown>;
      const description = this.describeAction(result.toolName, data);

      await prisma.shadowConsentReceipt.create({
        data: {
          sessionId,
          messageId,
          actionType: result.toolName,
          actionDescription: description,
          triggerSource: 'voice_command',
          reasoning: `User intent: ${intent.primaryIntent}`,
          confirmationLevel: intent.confirmationLevel,
          blastRadius: intent.blastRadius,
          reversible: this.isReversible(result.toolName),
          entityId: context.activeEntity?.id ?? null,
        },
      });
    }
  }

  private describeAction(toolName: string, data: Record<string, unknown>): string {
    switch (toolName) {
      case 'create_task':
        return `Created task: ${data.title ?? 'Unknown'}`;
      case 'update_task':
        return `Updated task ${data.taskId}: ${data.title ?? ''}`;
      case 'complete_task':
        return `Completed task: ${data.title ?? data.taskId}`;
      case 'draft_email':
        return `Drafted email: ${data.subject ?? 'No subject'}`;
      case 'send_email':
        return `Sent email (message: ${data.messageId})`;
      case 'classify_email':
        return `Classified email ${data.messageId} with score ${data.triageScore}`;
      case 'create_calendar_event':
        return `Created calendar event: ${data.title ?? 'Unknown'}`;
      case 'modify_calendar_event':
        return `Modified calendar event: ${data.eventId}`;
      case 'create_contact':
        return `Created contact: ${data.name ?? 'Unknown'}`;
      case 'create_invoice':
        return `Created invoice for $${data.amount ?? '?'}`;
      case 'send_invoice_reminder':
        return `Sent invoice reminder for ${data.invoiceId}`;
      case 'trigger_workflow':
        return `Triggered workflow: ${data.name ?? data.workflowId}`;
      case 'switch_entity':
        return `Switched to entity: ${data.name ?? data.entityId}`;
      case 'add_knowledge_entry':
        return `Added knowledge entry: ${data.entryId}`;
      case 'navigate_to_page':
        return `Navigated to: ${data.deepLink ?? data.page}`;
      default:
        return `Executed ${toolName}`;
    }
  }

  private isReversible(toolName: string): boolean {
    const irreversibleActions = new Set([
      'send_email',
      'trigger_workflow',
      'send_invoice_reminder',
    ]);
    return !irreversibleActions.has(toolName);
  }
}
