const mockGenerateText = jest.fn();

jest.mock('@/lib/ai', () => ({
  generateText: mockGenerateText,
}));

const mockGetPersona = jest.fn();

jest.mock('@/modules/voiceforge/services/persona-service', () => ({
  getPersona: mockGetPersona,
}));

import {
  checkGuardrails,
  detectVoicemail,
  dropVoicemail,
  initiateOutboundCall,
} from '@/modules/voiceforge/services/outbound-agent';
import type { CallGuardrails } from '@/modules/voiceforge/types';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    call: {
      create: jest.fn().mockResolvedValue({
        id: 'call-test-1',
        entityId: 'entity-1',
        contactId: 'contact-1',
        direction: 'OUTBOUND',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    consentReceipt: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

var mockGetCallStatus: jest.Mock;

// Mock voice provider
jest.mock('@/lib/voice/mock-provider', () => {
  mockGetCallStatus = jest.fn().mockResolvedValue('COMPLETED');
  return {
    MockVoiceProvider: jest.fn().mockImplementation(() => ({
      name: 'mock',
      initiateCall: jest.fn().mockResolvedValue({
        callSid: 'CA-test-123',
        status: 'QUEUED',
        startedAt: new Date(),
      }),
      getCallStatus: mockGetCallStatus,
    })),
  };
});

jest.mock('@/lib/voice/consent-manager', () => ({
  checkConsentRequirements: jest.fn().mockReturnValue({
    allowed: true,
    consentType: 'ONE_PARTY',
    recordingAllowed: true,
  }),
  verifyConsent: jest.fn().mockResolvedValue({ valid: false, receipt: null }),
}));

jest.mock('@/modules/voiceforge/services/campaign-service', () => ({
  updateStats: jest.fn().mockResolvedValue({}),
}));

describe('Outbound Agent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCallStatus.mockResolvedValue('COMPLETED');
  });

  describe('checkGuardrails', () => {
    const baseGuardrails: CallGuardrails = {
      maxCommitments: 3,
      forbiddenTopics: ['lawsuit', 'competitor pricing'],
      escalationTriggers: ['speak to manager', 'lawyer'],
      complianceProfile: ['HIPAA'],
      maxSilenceSeconds: 10,
    };

    it('should pass when no violations are found', () => {
      const result = checkGuardrails('Hello, how are you today?', baseGuardrails);
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.shouldEscalate).toBe(false);
    });

    it('should detect forbidden topics', () => {
      const result = checkGuardrails(
        'We should discuss the lawsuit against the company',
        baseGuardrails
      );
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.rule.includes('lawsuit'))).toBe(true);
      expect(result.violations.find((v) => v.rule.includes('lawsuit'))?.severity).toBe('BLOCK');
    });

    it('should detect multiple forbidden topics', () => {
      const result = checkGuardrails(
        'The lawsuit about competitor pricing is ongoing',
        baseGuardrails
      );
      expect(result.passed).toBe(false);
      expect(result.violations.filter((v) => v.severity === 'BLOCK').length).toBe(2);
    });

    it('should trigger escalation on trigger words', () => {
      const result = checkGuardrails(
        'I want to speak to manager right now',
        baseGuardrails
      );
      expect(result.shouldEscalate).toBe(true);
      expect(result.escalationReason).toContain('speak to manager');
    });

    it('should detect escalation for lawyer mention', () => {
      const result = checkGuardrails(
        'I am going to contact my lawyer about this',
        baseGuardrails
      );
      expect(result.shouldEscalate).toBe(true);
    });

    it('should be case-insensitive', () => {
      const result = checkGuardrails(
        'I want to SPEAK TO MANAGER',
        baseGuardrails
      );
      expect(result.shouldEscalate).toBe(true);
    });

    it('should include excerpt in violations', () => {
      const result = checkGuardrails(
        'Tell me about the lawsuit details',
        baseGuardrails
      );
      expect(result.violations[0].excerpt).toBeTruthy();
      expect(result.violations[0].excerpt.toLowerCase()).toContain('lawsuit');
    });
  });

describe('detectVoicemail', () => {
    it('should return false for COMPLETED status', async () => {
      mockGetCallStatus.mockResolvedValue('COMPLETED');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });

    it('should return true for NO_ANSWER status', async () => {
      mockGetCallStatus.mockResolvedValue('NO_ANSWER');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(true);
    });

    it('should return false for BUSY status', async () => {
      mockGetCallStatus.mockResolvedValue('BUSY');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });

    it('should return false for FAILED status', async () => {
      mockGetCallStatus.mockResolvedValue('FAILED');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });

    it('should return false for CANCELLED status', async () => {
      mockGetCallStatus.mockResolvedValue('CANCELLED');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });

    it('should return false for IN_PROGRESS status', async () => {
      mockGetCallStatus.mockResolvedValue('IN_PROGRESS');
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });

    it('should return false when provider throws an error', async () => {
      mockGetCallStatus.mockRejectedValue(new Error('Provider unavailable'));
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
    });
  });

describe('dropVoicemail', () => {
    const mockPersona = {
      id: 'persona-1',
      entityId: 'entity-1',
      name: 'Sales Agent',
      description: 'Friendly sales persona',
      voiceConfig: {
        provider: 'elevenlabs',
        voiceId: 'voice-123',
        speed: 1.0,
        pitch: 1.0,
        language: 'en-US',
      },
      personality: {
        defaultTone: 'WARM',
        formality: 0.5,
        empathy: 0.8,
        assertiveness: 0.4,
        humor: 0.3,
        vocabulary: 'MODERATE',
      },
      status: 'ACTIVE',
      consentChain: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should generate personalized voicemail when AI and persona are available', async () => {
      mockGetPersona.mockResolvedValue(mockPersona);
      mockGenerateText.mockResolvedValue('Hi, this is Sales Agent. We wanted to follow up.');

      await dropVoicemail('CA-123', 'persona-1', 'Follow-up call');

      expect(mockGetPersona).toHaveBeenCalledWith('persona-1');
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
      const prompt = mockGenerateText.mock.calls[0][0];
      expect(prompt).toContain('Sales Agent');
      expect(prompt).toContain('WARM');
      expect(prompt).toContain('Follow-up call');
    });

    it('should use template fallback when AI is unavailable but persona exists', async () => {
      mockGetPersona.mockResolvedValue(mockPersona);
      mockGenerateText.mockRejectedValue(new Error('AI unavailable'));

      await dropVoicemail('CA-123', 'persona-1', 'Follow-up call');

      expect(mockGetPersona).toHaveBeenCalledWith('persona-1');
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it('should use generic message when persona is not found', async () => {
      mockGetPersona.mockResolvedValue(null);

      await dropVoicemail('CA-123', 'persona-unknown', 'Follow-up call');

      expect(mockGetPersona).toHaveBeenCalledWith('persona-unknown');
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it('should not throw when getPersona fails', async () => {
      mockGetPersona.mockRejectedValue(new Error('DB error'));

      await expect(dropVoicemail('CA-123', 'persona-1', 'test')).resolves.toBeUndefined();
    });
  });

describe('initiateOutboundCall', () => {
    it('should create a call record and return result', async () => {
      const result = await initiateOutboundCall({
        entityId: 'entity-1',
        contactId: 'contact-1',
        personaId: 'persona-1',
        purpose: 'Follow-up',
        guardrails: {
          maxCommitments: 3,
          forbiddenTopics: [],
          escalationTriggers: [],
          complianceProfile: [],
          maxSilenceSeconds: 10,
        },
      });

      expect(result.callId).toBe('call-test-1');
      expect(result.voicemailDropped).toBe(false);
      expect(typeof result.duration).toBe('number');
      expect(typeof result.sentiment).toBe('number');
      expect(result.sentiment).toBeGreaterThanOrEqual(-1);
      expect(result.sentiment).toBeLessThanOrEqual(1);
    });

    it('should return valid outcome values', async () => {
      const result = await initiateOutboundCall({
        entityId: 'entity-1',
        contactId: 'contact-1',
        personaId: 'persona-1',
        purpose: 'Test call',
        guardrails: {
          maxCommitments: 3,
          forbiddenTopics: [],
          escalationTriggers: [],
          complianceProfile: [],
          maxSilenceSeconds: 10,
        },
      });

      const validOutcomes = [
        'CONNECTED', 'VOICEMAIL', 'NO_ANSWER', 'BUSY',
        'CALLBACK_REQUESTED', 'INTERESTED', 'NOT_INTERESTED',
      ];
      expect(validOutcomes).toContain(result.outcome);
    });

    it('should handle voicemail detection and drop', async () => {
      mockGetCallStatus.mockResolvedValue('NO_ANSWER');
      mockGetPersona.mockResolvedValue(null);

      const result = await initiateOutboundCall({
        entityId: 'entity-1',
        contactId: 'contact-1',
        personaId: 'persona-1',
        purpose: 'Voicemail test',
        guardrails: {
          maxCommitments: 3,
          forbiddenTopics: [],
          escalationTriggers: [],
          complianceProfile: [],
          maxSilenceSeconds: 10,
        },
      });

      expect(result.outcome).toBe('VOICEMAIL');
      expect(result.voicemailDropped).toBe(true);
      expect(result.duration).toBe(0);
      expect(result.sentiment).toBe(0);
    });

    it('should return duration greater than zero for completed calls', async () => {
      mockGetCallStatus.mockResolvedValue('COMPLETED');

      const result = await initiateOutboundCall({
        entityId: 'entity-1',
        contactId: 'contact-1',
        personaId: 'persona-1',
        purpose: 'Duration test',
        guardrails: {
          maxCommitments: 3,
          forbiddenTopics: [],
          escalationTriggers: [],
          complianceProfile: [],
          maxSilenceSeconds: 10,
        },
      });

      expect(result.duration).toBeGreaterThan(0);
    });

    it('should not be escalated by default', async () => {
      const result = await initiateOutboundCall({
        entityId: 'entity-1',
        contactId: 'contact-1',
        personaId: 'persona-1',
        purpose: 'Escalation test',
        guardrails: {
          maxCommitments: 3,
          forbiddenTopics: [],
          escalationTriggers: [],
          complianceProfile: [],
          maxSilenceSeconds: 10,
        },
      });

      expect(result.escalated).toBe(false);
    });
  });
});
