/**
 * Integration test: outbound-agent emits lifecycle events and surfaces
 * sentiment escalation into the final OutboundCallResult.
 *
 * The sentiment integration (sentiment-integration.ts) auto-registers on
 * import. We import it here so the lifecycle handlers are live, then mock
 * its internals. This confirms the orchestrator and the integration are
 * wired together end-to-end.
 */

const mockMonitorCallSentiment = jest.fn();
jest.mock('@/lib/shadow/voice/call-monitor', () => ({
  monitorCallSentiment: (...args: unknown[]) => mockMonitorCallSentiment(...args),
}));

const mockGetVafConfig = jest.fn();
jest.mock('@/lib/shadow/vaf-config', () => ({
  getVafConfig: (...args: unknown[]) => mockGetVafConfig(...args),
}));

const mockShadowAuthEventCreate = jest.fn().mockResolvedValue({});

jest.mock('@/lib/db', () => ({
  prisma: {
    call: {
      create: jest.fn().mockResolvedValue({
        id: 'call-int-1',
        entityId: 'entity-1',
        contactId: 'contact-1',
        direction: 'OUTBOUND',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    shadowAuthEvent: {
      create: (...args: unknown[]) => mockShadowAuthEventCreate(...args),
    },
  },
}));

let mockGetCallStatus: jest.Mock;
jest.mock('@/lib/voice/mock-provider', () => {
  mockGetCallStatus = jest.fn().mockResolvedValue('COMPLETED');
  return {
    MockVoiceProvider: jest.fn().mockImplementation(() => ({
      name: 'mock',
      initiateCall: jest.fn().mockResolvedValue({
        callSid: 'CA-int-123',
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      }),
      getCallStatus: mockGetCallStatus,
    })),
  };
});

jest.mock('@/modules/voiceforge/services/persona-service', () => ({
  getPersona: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/modules/voiceforge/services/campaign-service', () => ({
  updateStats: jest.fn().mockResolvedValue({}),
}));

jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('voicemail body'),
}));

import type { CallMonitorHandle, EscalationReason } from '@/lib/shadow/voice/call-monitor';
import type { SentimentResult } from '@/lib/vaf/sentiment-client';
import { initiateOutboundCall } from '@/modules/voiceforge/services/outbound-agent';
import {
  __resetSentimentIntegrationForTesting,
  registerSentimentIntegration,
} from '@/modules/voiceforge/services/sentiment-integration';
import { __resetCallLifecycleHandlersForTesting } from '@/modules/voiceforge/services/call-lifecycle';
import type { CallGuardrails } from '@/modules/voiceforge/types';

const STANDARD_CONFIG = {
  userId: 'user-1',
  sttProvider: 'vaf',
  ttsProvider: 'vaf',
  audioEnhancement: true,
  noiseCancellation: true,
  echoSuppression: true,
  voiceprintEnrolled: false,
  voiceprintEnrolledAt: null,
  voiceprintUseForAuth: false,
  sentimentOnVoiceforgeCalls: true,
  sentimentAlertThreshold: 0.8,
  autoProcessMeetings: false,
  autoExtractActionItems: true,
  autoCreateTasks: true,
  documentAnalysisEnabled: true,
  screenVisionFallback: false,
  primaryLanguage: 'en-US',
  secondaryLanguage: null,
  autoDetectLanguage: false,
};

const NEUTRAL_SENTIMENT: SentimentResult = {
  overall: 'neutral',
  confidence: 0.9,
  emotions: { anger: 0, frustration: 0, anxiety: 0, satisfaction: 0, confusion: 0, urgency: 0 },
  riskFlags: [],
  suggestedAction: 'continue',
};

const baseGuardrails: CallGuardrails = {
  maxCommitments: 3,
  forbiddenTopics: [],
  escalationTriggers: [],
  complianceProfile: [],
  maxSilenceSeconds: 10,
};

beforeEach(() => {
  mockMonitorCallSentiment.mockReset();
  mockGetVafConfig.mockReset();
  mockShadowAuthEventCreate.mockClear();
  __resetSentimentIntegrationForTesting();
  __resetCallLifecycleHandlersForTesting();
  registerSentimentIntegration();
});

describe('initiateOutboundCall + sentiment integration', () => {
  it('subscribes when sentimentOnVoiceforgeCalls=true and userId is supplied, then closes on call end', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const closeMock = jest.fn();
    const handle: CallMonitorHandle = { sessionId: 'sess-int', close: closeMock };
    mockMonitorCallSentiment.mockResolvedValue(handle);

    await initiateOutboundCall({
      userId: 'user-1',
      entityId: 'entity-1',
      contactId: 'contact-1',
      personaId: 'persona-1',
      purpose: 'follow up',
      guardrails: baseGuardrails,
    });

    expect(mockMonitorCallSentiment).toHaveBeenCalledTimes(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT subscribe when sentimentOnVoiceforgeCalls=false', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG, sentimentOnVoiceforgeCalls: false });

    await initiateOutboundCall({
      userId: 'user-1',
      entityId: 'entity-1',
      contactId: 'contact-1',
      personaId: 'persona-1',
      purpose: 'follow up',
      guardrails: baseGuardrails,
    });

    expect(mockMonitorCallSentiment).not.toHaveBeenCalled();
  });

  it('does NOT subscribe when userId is not supplied (legacy callers)', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });

    await initiateOutboundCall({
      entityId: 'entity-1',
      contactId: 'contact-1',
      personaId: 'persona-1',
      purpose: 'follow up',
      guardrails: baseGuardrails,
    });

    expect(mockGetVafConfig).not.toHaveBeenCalled();
    expect(mockMonitorCallSentiment).not.toHaveBeenCalled();
  });

  it('threatening escalation flips outcome to NOT_INTERESTED + escalated=true + logs shadowAuthEvent', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const closeMock = jest.fn();
    const handle: CallMonitorHandle = { sessionId: 'sess-th', close: closeMock };

    // When monitorCallSentiment is invoked, immediately fire a threatening
    // escalation BEFORE returning the handle so the flag is set before the
    // orchestrator inspects it post-call.
    mockMonitorCallSentiment.mockImplementation(
      async (
        _callId: string,
        _playbook: unknown,
        onEscalation: (r: EscalationReason, s: SentimentResult) => void,
      ) => {
        onEscalation('caller_threatening', NEUTRAL_SENTIMENT);
        return handle;
      },
    );

    const result = await initiateOutboundCall({
      userId: 'user-1',
      entityId: 'entity-1',
      contactId: 'contact-1',
      personaId: 'persona-1',
      purpose: 'follow up',
      guardrails: baseGuardrails,
    });

    expect(result.outcome).toBe('NOT_INTERESTED');
    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toBe('caller_threatening');

    // shadowAuthEvent.create is fire-and-forget; let pending microtasks settle.
    await new Promise((r) => setImmediate(r));
    expect(mockShadowAuthEventCreate).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        method: 'voiceforge_call',
        result: 'fail',
        riskLevel: 'high',
        actionAttempted: 'caller_threatening',
      },
    });

    // Subscription is still closed at the end.
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('transfer escalation surfaces escalationReason without changing outcome', async () => {
    mockGetVafConfig.mockResolvedValue({ ...STANDARD_CONFIG });
    const closeMock = jest.fn();
    mockMonitorCallSentiment.mockImplementation(
      async (
        _callId: string,
        _playbook: unknown,
        onEscalation: (r: EscalationReason, s: SentimentResult) => void,
      ) => {
        onEscalation('ai_recommends_human_transfer', NEUTRAL_SENTIMENT);
        return { sessionId: 'sess-x', close: closeMock };
      },
    );

    const result = await initiateOutboundCall({
      userId: 'user-1',
      entityId: 'entity-1',
      contactId: 'contact-1',
      personaId: 'persona-1',
      purpose: 'follow up',
      guardrails: baseGuardrails,
    });

    expect(result.escalated).toBe(true);
    expect(result.escalationReason).toBe('ai_recommends_human_transfer');
  });
});
