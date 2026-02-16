import {
  checkGuardrails,
  detectVoicemail,
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

// Mock voice provider
jest.mock('@/lib/voice/mock-provider', () => ({
  MockVoiceProvider: jest.fn().mockImplementation(() => ({
    name: 'mock',
    initiateCall: jest.fn().mockResolvedValue({
      callSid: 'CA-test-123',
      status: 'QUEUED',
      startedAt: new Date(),
    }),
    getCallStatus: jest.fn().mockResolvedValue('COMPLETED'),
  })),
}));

jest.mock('@/lib/voice/consent-manager', () => ({
  checkConsentRequirements: jest.fn().mockReturnValue({
    allowed: true,
    consentType: 'ONE_PARTY',
    recordingAllowed: true,
  }),
  verifyConsent: jest.fn().mockResolvedValue({ valid: false, receipt: null }),
}));

describe('Outbound Agent', () => {
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
    it('should return false as placeholder', async () => {
      const result = await detectVoicemail('CA-123');
      expect(result).toBe(false);
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
  });
});
