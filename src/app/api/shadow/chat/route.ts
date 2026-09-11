import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withRole } from '@/shared/middleware/auth';

import { sessionManager } from '@/modules/shadow/interfaces/session-manager';
import { storeShadowMessage } from '@/modules/shadow/compliance/message-store';
import { detectFraud } from '@/modules/shadow/safety/fraud-detector';
import { recordAuthEvent } from '@/modules/shadow/safety/auth-events';
import type { AgentResponse, SessionChannel } from '@/modules/shadow/interfaces/types';
import { withRateLimit } from '@/shared/middleware/rate-limit';

const ChatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  sessionId: z.string().optional(),
  currentPage: z.string().optional(),
});

/**
 * Process a message through the ShadowAgent.
 * Falls back to a basic response if the agent module is not available.
 */
async function processWithAgent(params: {
  sessionId: string;
  userId: string;
  message: string;
  channel: SessionChannel;
  entityId?: string;
  currentPage?: string;
}): Promise<AgentResponse> {
  // Check if Anthropic API key is configured
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE' || apiKey.length < 10) {
    return {
      text: `Hey! Shadow here. I received your message: "${params.message}". I'm currently running in offline mode because the AI backend hasn't been configured yet. To enable full AI responses, add a valid ANTHROPIC_API_KEY to your .env.local file.`,
      contentType: 'text',
      confidence: 1.0,
    };
  }

  try {
    const agentModule = await import('@/modules/shadow/agent/core').catch(
      () => null,
    );

    if (agentModule?.ShadowAgent) {
      const agent = new agentModule.ShadowAgent();
      const result = await agent.processMessage({
        sessionId: params.sessionId,
        userId: params.userId,
        message: params.message,
        channel: params.channel,
        activeEntityId: params.entityId,
        currentPage: params.currentPage,
      });
      return {
        ...result,
        contentType: result.contentType
          ? (result.contentType.toLowerCase() as AgentResponse['contentType'])
          : 'text',
      } as AgentResponse;
    }
  } catch (err) {
    // Agent module failed — return a helpful message instead of crashing
    const detail = err instanceof Error ? err.message : 'Unknown error';
    return {
      text: `I received your message but encountered an issue processing it: ${detail}. I'll try again next time.`,
      contentType: 'text',
      confidence: 0.5,
    };
  }

  return {
    text: `I received your message: "${params.message}". The Shadow Agent core is being set up and will be available shortly.`,
    contentType: 'text',
    confidence: 1.0,
  };
}

async function handlePOST(request: NextRequest) {
  return withRole(request, ['owner', 'admin', 'member'], async (req, authSession) => {
    try {
      const body = await req.json();
      const parsed = ChatMessageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { message, sessionId, currentPage } = parsed.data;

      // 1. Get or create session
      //
      // P-41: `forUser` is the ownership check. The hand-written
      // `voiceSession.userId !== authSession.userId` that used to stand here
      // was the compensating check in the CALLER that this package moved into
      // the accessor -- `getSession` now returns null for another tenant's id,
      // which is the same answer it gives for an id that does not exist, so the
      // "start a fresh session instead" branch below is reached identically.
      const sessions = sessionManager.forUser(authSession.userId);

      let voiceSession = sessionId
        ? await sessions.getSession(sessionId)
        : await sessions.getActiveSession();

      if (!voiceSession || voiceSession.status === 'ended') {
        voiceSession = await sessions.startSession({
          channel: 'web' as SessionChannel,
          entityId: authSession.activeEntityId,
          currentPage,
        });
      }

      // Resume paused sessions
      if (voiceSession.status === 'paused') {
        voiceSession = await sessions.resumeSession(voiceSession.id, 'web');
      }

      // Update currentPage if provided
      const touchUpdates: Record<string, unknown> = {};
      if (currentPage) {
        touchUpdates.currentPage = currentPage;
      }

      // 2. Persist the user message.
      // P-17 (v3 Addition 9.2): through `storeShadowMessage`, which redacts
      // before it writes. A spoken or typed card number arrives HERE.
      await storeShadowMessage({
        sessionId: voiceSession.id,
        role: 'user',
        content: message,
        channel: voiceSession.currentChannel,
      });

      // Touch session: increment messageCount, update lastActivityAt
      await sessions.touchSession(voiceSession.id, touchUpdates);

      // -----------------------------------------------------------------
      // 2b. ANTI-SOCIAL-ENGINEERING GATE (P-17, v3 Addition 1.3)
      // -----------------------------------------------------------------
      //
      // `safety/fraud-detector.ts` declares at the top of the file that it
      // "CANNOT be overridden even with a valid PIN" and that "all patterns are
      // evaluated before any action proceeds". It had ZERO external importers.
      // Every pattern in it -- the wire-transfer-to-a-new-account BEC pattern,
      // the vendor bank change, the credential request, the urgency bypass, the
      // "don't log this", the prompt injection -- was evaluated nowhere, so
      // every one of those messages went straight to the model.
      //
      // The gate is HERE, before `processWithAgent`, and not inside the agent,
      // for two reasons. It has to refuse whether or not an ANTHROPIC_API_KEY
      // is configured (the offline branch below is still a reachable code path
      // that would otherwise answer a wire-transfer request). And a refusal
      // must happen before the message reaches the model at all -- a prompt
      // injection that the model has already read has already had its chance.
      //
      // The user's message is stored FIRST, above, and deliberately: "don't log
      // this action" is one of the patterns, and a gate that discarded the
      // message it refused would be granting exactly that request.
      const fraud = detectFraud({
        input: message,
        context: { channel: voiceSession.currentChannel },
      });

      if (fraud.isFraudulent) {
        await recordAuthEvent({
          userId: authSession.userId,
          sessionId: voiceSession.id,
          method: 'fraud_screen',
          result: 'refused',
          riskLevel: fraud.severity.toLowerCase(),
          actionAttempted: fraud.pattern,
        });

        const refusal = await storeShadowMessage({
          sessionId: voiceSession.id,
          role: 'assistant',
          content: fraud.message,
          contentType: 'TEXT',
          intent: 'refused',
          channel: voiceSession.currentChannel,
        });
        await sessions.touchSession(voiceSession.id);

        // 200, not 4xx. This is a conversational refusal with an explanation
        // and an offered alternative, which is what Addition 1.3 specifies; a
        // client that renders errors differently from messages would otherwise
        // show the user a failure instead of the reason.
        return success({
          sessionId: voiceSession.id,
          messageId: refusal.id,
          refused: true,
          fraudPattern: fraud.pattern,
          severity: fraud.severity,
          response: {
            text: fraud.message,
            contentType: 'text',
          },
        });
      }

      // 3. Process through agent
      const startTime = Date.now();
      const agentResponse = await processWithAgent({
        sessionId: voiceSession.id,
        userId: authSession.userId,
        message,
        channel: voiceSession.currentChannel,
        entityId: voiceSession.activeEntityId ?? authSession.activeEntityId,
        currentPage,
      });
      const latencyMs = Date.now() - startTime;

      // 4. Persist assistant response
      const assistantMessage = await storeShadowMessage({
        sessionId: voiceSession.id,
        role: 'assistant',
        content: agentResponse.text,
        contentType: agentResponse.contentType?.toUpperCase() ?? 'TEXT',
        intent: agentResponse.intent ?? null,
        toolsUsed: agentResponse.toolsUsed ?? [],
        actionsTaken: agentResponse.actionsTaken ?? [],
        channel: voiceSession.currentChannel,
        confidence: agentResponse.confidence ?? null,
        latencyMs,
      });

      // Touch session again for the assistant message
      await sessions.touchSession(voiceSession.id);

      // 5. Return the response
      return success({
        sessionId: voiceSession.id,
        messageId: assistantMessage.id,
        response: {
          text: agentResponse.text,
          contentType: agentResponse.contentType ?? 'text',
          citations: agentResponse.citations,
          actionCards: agentResponse.actionCards,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process chat message';
      return error('CHAT_FAILED', message, 500);
    }
  });
}

// ---------------------------------------------------------------------------
// P-18 / T-012 — rate limit: tier "ai".
//
// The limiter sits OUTSIDE the auth wrappers, so a refused request never reaches
// the handler, the entity-ownership query, or the work itself. (On a user-keyed
// tier the limiter does decrypt the session token -- that is what makes the
// bucket unspoofable -- but nothing beyond that runs.) The tier, its budget and
// the reason for that budget live in RATE_LIMIT_POLICY in
// src/shared/middleware/rate-limit.ts; nothing about the limit is decided here,
// so no route can quietly hold a different number from the published table.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<Response> {
  return withRateLimit(request, 'ai', handlePOST);
}
