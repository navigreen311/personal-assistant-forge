// ============================================================================
// Shadow Voice Agent — Web Chat Handler
// Handles WebSocket-style messaging over HTTP (fetch/streaming).
// Routes incoming messages to the appropriate session and agent logic.
// ============================================================================

import { prisma } from '@/lib/db';
import { storeShadowMessage } from '../compliance/message-store';
import { sessionManager } from './session-manager';
import type {
  WebChatIncoming,
  WebChatResponse,
  WebChatResponsePayload,
  AgentResponse,
  SessionChannel,
} from './types';
import type { ShadowResponse } from '../types';

// --- Helpers ---

/**
 * `ShadowResponse.contentType` is the agent core's card vocabulary; the web
 * chat payload speaks the narrower client vocabulary. Card kinds the client
 * has no dedicated renderer for arrive as `mixed` (text plus attachments).
 */
const AGENT_CONTENT_TYPE: Record<
  ShadowResponse['contentType'],
  AgentResponse['contentType']
> = {
  TEXT: 'text',
  ACTION_CARD: 'action_card',
  CONFIRMATION_CARD: 'action_card',
  NAVIGATION_CARD: 'mixed',
  LIST_CARD: 'mixed',
  DECISION_CARD: 'mixed',
  VOICE_CARD: 'mixed',
};

/**
 * Translate the agent core's `ShadowResponse` into the web chat `AgentResponse`.
 * The two types genuinely differ (cased content types, structured vs. string
 * citations, different `ActionCard` shapes), so this converts rather than casts.
 */
function toAgentResponse(result: ShadowResponse): AgentResponse {
  return {
    text: result.text,
    contentType: AGENT_CONTENT_TYPE[result.contentType] ?? 'text',
    citations: result.citations?.map((citation) => citation.label),
    actionCards: result.actionCards?.map((card) => ({
      id: card.id,
      type: 'action',
      title: card.title,
      description: card.description,
      requiresConfirmation: card.options.length > 0,
      metadata: { options: card.options },
    })),
  };
}

function buildResponse(
  sessionId: string,
  messageId: string | undefined,
  payload: WebChatResponsePayload,
): WebChatResponse {
  return {
    sessionId,
    messageId,
    response: payload,
    timestamp: new Date().toISOString(),
  };
}

async function persistMessage(params: {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType?: string;
  intent?: string;
  toolsUsed?: string[];
  actionsTaken?: unknown[];
  channel: string;
  confidence?: number;
  latencyMs?: number;
}): Promise<string> {
  // P-17 (v3 Addition 9.2): redaction before storage, through the one writer.
  const message = await storeShadowMessage({
    sessionId: params.sessionId,
    role: params.role,
    content: params.content,
    contentType: params.contentType,
    intent: params.intent,
    toolsUsed: params.toolsUsed,
    actionsTaken: params.actionsTaken,
    channel: params.channel,
    confidence: params.confidence,
    latencyMs: params.latencyMs,
  });
  return message.id;
}

// --- Web Chat Handler ---

export class WebChatHandler {
  /**
   * Handle an incoming chat message from the web interface.
   * Supports message types: text, action_response, ping, end_session.
   */
  async handleMessage(
    data: WebChatIncoming,
    userId: string,
  ): Promise<WebChatResponse> {
    const { type, content, sessionId, actionId, actionResponse } = data;

    switch (type) {
      case 'ping':
        return this.handlePing(userId, sessionId);

      case 'end_session':
        return this.handleEndSession(userId, sessionId);

      case 'action_response':
        return this.handleActionResponse(userId, sessionId, actionId, actionResponse);

      case 'text':
      default:
        return this.handleTextMessage(userId, sessionId, content);
    }
  }

  // --- Message Type Handlers ---

  private async handlePing(
    userId: string,
    sessionId?: string,
  ): Promise<WebChatResponse> {
    // P-41. `touchSession` was called on a caller-supplied `sessionId` with no
    // ownership check of any kind, so a ping naming a stranger's session moved
    // that session's `lastActivityAt` -- a cross-tenant WRITE. It is now
    // reached through `forUser`, which refuses a session that is not this
    // user's exactly as it refuses one that does not exist, which is why the
    // pre-existing `.catch()` still reads correctly.
    const sessions = sessionManager.forUser(userId);

    let resolvedSessionId = sessionId;

    if (!resolvedSessionId) {
      const active = await sessions.getActiveSession();
      resolvedSessionId = active?.id ?? 'none';
    }

    if (resolvedSessionId && resolvedSessionId !== 'none') {
      await sessions.touchSession(resolvedSessionId).catch(() => {
        // Ignore touch errors on ping — session may not exist
      });
    }

    return buildResponse(resolvedSessionId ?? 'none', undefined, {
      text: 'pong',
      contentType: 'text',
    });
  }

  private async handleEndSession(
    userId: string,
    sessionId?: string,
  ): Promise<WebChatResponse> {
    // P-41. `endSession` was called on a caller-supplied `sessionId` with no
    // ownership check, so `{ type: 'end_session', sessionId: <someone
    // else's> }` ended a stranger's session. `forUser` makes that id read as
    // missing, and `endSession` then throws `Session <id> not found` rather
    // than ending it.
    const sessions = sessionManager.forUser(userId);

    let resolvedSessionId = sessionId;

    if (!resolvedSessionId) {
      const active = await sessions.getActiveSession();
      if (!active) {
        return buildResponse('none', undefined, {
          text: 'No active session to end.',
          contentType: 'text',
        });
      }
      resolvedSessionId = active.id;
    }

    const session = await sessions.endSession(resolvedSessionId);

    // Persist the end-session system message
    const messageId = await persistMessage({
      sessionId: session.id,
      role: 'system',
      content: 'Session ended by user.',
      channel: session.currentChannel,
    });

    return buildResponse(session.id, messageId, {
      text: 'Session ended. Thanks for chatting with Shadow!',
      contentType: 'text',
    });
  }

  private async handleActionResponse(
    userId: string,
    sessionId?: string,
    actionId?: string,
    actionResponseContent?: string,
  ): Promise<WebChatResponse> {
    if (!sessionId) {
      return buildResponse('none', undefined, {
        text: 'No session specified for action response.',
        contentType: 'text',
      });
    }

    // P-41: `forUser` is the ownership check the hand-written
    // `session.userId !== userId` used to be. The refusal text already said
    // "not found or access denied", which is now literally one condition.
    const sessions = sessionManager.forUser(userId);

    const session = await sessions.getSession(sessionId);
    if (!session) {
      return buildResponse(sessionId, undefined, {
        text: 'Session not found or access denied.',
        contentType: 'text',
      });
    }

    if (session.status !== 'active') {
      return buildResponse(sessionId, undefined, {
        text: 'Session is not active. Please resume or start a new session.',
        contentType: 'text',
      });
    }

    // Persist the user's action response
    const userMessageId = await persistMessage({
      sessionId: session.id,
      role: 'user',
      content: `[Action Response: ${actionId}] ${actionResponseContent ?? 'confirmed'}`,
      contentType: 'TEXT',
      channel: session.currentChannel,
    });

    // Touch session to track activity
    await sessions.touchSession(session.id);

    // Process through the agent
    const startTime = Date.now();
    const agentResponse = await this.processWithAgent(
      session.id,
      userId,
      `User responded to action ${actionId}: ${actionResponseContent ?? 'confirmed'}`,
      session.currentChannel,
      session.activeEntityId ?? undefined,
    );
    const latencyMs = Date.now() - startTime;

    // Persist assistant response
    const assistantMessageId = await persistMessage({
      sessionId: session.id,
      role: 'assistant',
      content: agentResponse.text,
      contentType: agentResponse.contentType?.toUpperCase() ?? 'TEXT',
      intent: agentResponse.intent,
      toolsUsed: agentResponse.toolsUsed,
      actionsTaken: agentResponse.actionsTaken,
      channel: session.currentChannel,
      confidence: agentResponse.confidence,
      latencyMs,
    });

    return buildResponse(session.id, assistantMessageId, {
      text: agentResponse.text,
      contentType: agentResponse.contentType ?? 'text',
      citations: agentResponse.citations,
      actionCards: agentResponse.actionCards,
    });
  }

  private async handleTextMessage(
    userId: string,
    sessionId?: string,
    content?: string,
  ): Promise<WebChatResponse> {
    if (!content || content.trim().length === 0) {
      return buildResponse(sessionId ?? 'none', undefined, {
        text: 'Please provide a message.',
        contentType: 'text',
      });
    }

    // Resolve or create session. P-41: `forUser` replaces the hand-written
    // `session.userId !== userId` reset below it.
    const sessions = sessionManager.forUser(userId);

    let session = sessionId
      ? await sessions.getSession(sessionId)
      : await sessions.getActiveSession();

    if (!session || session.status === 'ended') {
      session = await sessions.startSession({
        channel: 'web' as SessionChannel,
      });
    }

    if (session.status === 'paused') {
      session = await sessions.resumeSession(session.id, 'web');
    }

    // Persist the user message
    const userMessageId = await persistMessage({
      sessionId: session.id,
      role: 'user',
      content,
      contentType: 'TEXT',
      channel: session.currentChannel,
    });

    // Touch session to track activity
    await sessions.touchSession(session.id);

    // Process through the agent
    const startTime = Date.now();
    const agentResponse = await this.processWithAgent(
      session.id,
      userId,
      content,
      session.currentChannel,
      session.activeEntityId ?? undefined,
    );
    const latencyMs = Date.now() - startTime;

    // Persist assistant response
    const assistantMessageId = await persistMessage({
      sessionId: session.id,
      role: 'assistant',
      content: agentResponse.text,
      contentType: agentResponse.contentType?.toUpperCase() ?? 'TEXT',
      intent: agentResponse.intent,
      toolsUsed: agentResponse.toolsUsed,
      actionsTaken: agentResponse.actionsTaken,
      channel: session.currentChannel,
      confidence: agentResponse.confidence,
      latencyMs,
    });

    return buildResponse(session.id, assistantMessageId, {
      text: agentResponse.text,
      contentType: agentResponse.contentType ?? 'text',
      citations: agentResponse.citations,
      actionCards: agentResponse.actionCards,
    });
  }

  // --- Agent Integration ---

  /**
   * Process a message through the ShadowAgent.
   * Falls back to a basic response if the agent module is not available yet.
   */
  private async processWithAgent(
    sessionId: string,
    userId: string,
    message: string,
    channel: SessionChannel,
    entityId?: string,
  ): Promise<AgentResponse> {
    try {
      // Dynamic import to handle the case where Agent 2's code may not exist yet
      const agentModule = await import('@/modules/shadow/agent/core').catch(
        () => null,
      );

      if (agentModule?.ShadowAgent) {
        const agent = new agentModule.ShadowAgent();
        const result = await agent.processMessage({
          sessionId,
          userId,
          message,
          channel,
          // The agent core names this `activeEntityId`; passing `entityId`
          // silently dropped the entity context.
          activeEntityId: entityId,
        });
        return toAgentResponse(result);
      }
    } catch {
      // Agent module not available yet — fall through to default
    }

    // Default response when agent is not available
    return {
      text: `I received your message: "${message}". The Shadow Agent core is being set up and will be available shortly.`,
      contentType: 'text',
      confidence: 1.0,
    };
  }
}

// Singleton export
export const webChatHandler = new WebChatHandler();
