import { NextRequest } from 'next/server';
import { z } from 'zod';
import { success, error } from '@/shared/utils/api-response';
import { withAuth } from '@/shared/middleware/auth';
import { prisma } from '@/lib/db';
import { sessionManager } from '@/modules/shadow/interfaces/session-manager';
import type { AgentResponse, SessionChannel } from '@/modules/shadow/interfaces/types';

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
  channel: string;
  entityId?: string;
}): Promise<AgentResponse> {
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
        entityId: params.entityId,
      });
      return result as AgentResponse;
    }
  } catch {
    // Agent module not available — fall through
  }

  return {
    text: `I received your message: "${params.message}". The Shadow Agent core is being set up and will be available shortly.`,
    contentType: 'text',
    confidence: 1.0,
  };
}

export async function POST(request: NextRequest) {
  return withAuth(request, async (req, authSession) => {
    try {
      const body = await req.json();
      const parsed = ChatMessageSchema.safeParse(body);

      if (!parsed.success) {
        return error('VALIDATION_ERROR', parsed.error.message, 400);
      }

      const { message, sessionId, currentPage } = parsed.data;

      // 1. Get or create session
      let voiceSession = sessionId
        ? await sessionManager.getSession(sessionId)
        : await sessionManager.getActiveSession(authSession.userId);

      // Verify ownership if session was found by ID
      if (voiceSession && voiceSession.userId !== authSession.userId) {
        voiceSession = null;
      }

      if (!voiceSession || voiceSession.status === 'ended') {
        voiceSession = await sessionManager.startSession({
          userId: authSession.userId,
          channel: 'web' as SessionChannel,
          entityId: authSession.activeEntityId,
          currentPage,
        });
      }

      // Resume paused sessions
      if (voiceSession.status === 'paused') {
        voiceSession = await sessionManager.resumeSession(voiceSession.id, 'web');
      }

      // Update currentPage if provided
      const touchUpdates: Record<string, unknown> = {};
      if (currentPage) {
        touchUpdates.currentPage = currentPage;
      }

      // 2. Persist the user message
      const userMessage = await prisma.shadowMessage.create({
        data: {
          sessionId: voiceSession.id,
          role: 'user',
          content: message,
          contentType: 'TEXT',
          channel: voiceSession.currentChannel,
        },
      });

      // Touch session: increment messageCount, update lastActivityAt
      await sessionManager.touchSession(voiceSession.id, touchUpdates);

      // 3. Process through agent
      const startTime = Date.now();
      const agentResponse = await processWithAgent({
        sessionId: voiceSession.id,
        userId: authSession.userId,
        message,
        channel: voiceSession.currentChannel,
        entityId: voiceSession.activeEntityId ?? authSession.activeEntityId,
      });
      const latencyMs = Date.now() - startTime;

      // 4. Persist assistant response
      const assistantMessage = await prisma.shadowMessage.create({
        data: {
          sessionId: voiceSession.id,
          role: 'assistant',
          content: agentResponse.text,
          contentType: agentResponse.contentType?.toUpperCase() ?? 'TEXT',
          intent: agentResponse.intent ?? null,
          toolsUsed: (agentResponse.toolsUsed ?? []) as unknown as Parameters<typeof prisma.shadowMessage.create>[0]['data']['toolsUsed'],
          actionsTaken: (agentResponse.actionsTaken ?? []) as unknown as Parameters<typeof prisma.shadowMessage.create>[0]['data']['actionsTaken'],
          channel: voiceSession.currentChannel,
          confidence: agentResponse.confidence ?? null,
          latencyMs,
        },
      });

      // Touch session again for the assistant message
      await sessionManager.touchSession(voiceSession.id);

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
