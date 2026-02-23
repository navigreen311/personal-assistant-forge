// ============================================================================
// Shadow Voice Agent — Compliance Module Unit Tests
// Tests: redaction pipeline, DNC enforcement, retention cleanup logic
// ============================================================================

// --- Mock Prisma (must come BEFORE imports) ---

jest.mock('@/lib/db', () => ({
  prisma: {
    shadowDNCEntry: {
      findUnique: jest.fn(),
    },
    shadowCallAttempt: {
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    shadowRetentionConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    shadowMessage: {
      deleteMany: jest.fn(),
    },
    shadowVoiceSession: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    shadowSessionOutcome: {
      deleteMany: jest.fn(),
    },
    shadowConsentReceipt: {
      deleteMany: jest.fn(),
    },
    shadowAuthEvent: {
      deleteMany: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { RedactionPipeline } from '@/modules/shadow/compliance/redaction';
import { DNCChecker } from '@/modules/shadow/compliance/dnc-checker';
import { RetentionService } from '@/modules/shadow/compliance/retention';

// Type-safe mock references
const mockDNCEntry = prisma.shadowDNCEntry as jest.Mocked<typeof prisma.shadowDNCEntry>;
const mockCallAttempt = prisma.shadowCallAttempt as jest.Mocked<typeof prisma.shadowCallAttempt>;
const mockRetentionConfig = prisma.shadowRetentionConfig as jest.Mocked<typeof prisma.shadowRetentionConfig>;
const mockMessage = prisma.shadowMessage as jest.Mocked<typeof prisma.shadowMessage>;
const mockSession = prisma.shadowVoiceSession as jest.Mocked<typeof prisma.shadowVoiceSession>;
const mockOutcome = prisma.shadowSessionOutcome as jest.Mocked<typeof prisma.shadowSessionOutcome>;
const mockConsent = prisma.shadowConsentReceipt as jest.Mocked<typeof prisma.shadowConsentReceipt>;
const mockAuthEvent = prisma.shadowAuthEvent as jest.Mocked<typeof prisma.shadowAuthEvent>;

// ============================================================================
// Redaction Pipeline Tests
// ============================================================================

describe('RedactionPipeline', () => {
  let pipeline: RedactionPipeline;

  beforeEach(() => {
    pipeline = new RedactionPipeline();
  });

  describe('SSN redaction', () => {
    it('should redact a standard SSN', () => {
      const result = pipeline.redact('My SSN is 123-45-6789.');
      expect(result.redactedText).toBe('My SSN is [SSN-REDACTED].');
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe('SSN');
      expect(result.redactions[0].original).toBe('123-45-6789');
      expect(result.redactions[0].replacement).toBe('[SSN-REDACTED]');
    });

    it('should redact multiple SSNs', () => {
      const result = pipeline.redact(
        'SSNs: 111-22-3333 and 444-55-6666',
      );
      expect(result.redactedText).toBe(
        'SSNs: [SSN-REDACTED] and [SSN-REDACTED]',
      );
      expect(result.redactions).toHaveLength(2);
    });

    it('should not redact partial SSN-like patterns', () => {
      const result = pipeline.redact('The code is 12-34-5678.');
      // Pattern requires xxx-xx-xxxx, so 12-34-5678 should NOT match
      expect(result.redactedText).toBe('The code is 12-34-5678.');
      expect(result.redactions).toHaveLength(0);
    });
  });

  describe('Credit card redaction', () => {
    it('should redact a 16-digit credit card number', () => {
      const result = pipeline.redact('Card: 4111 1111 1111 1111');
      expect(result.redactedText).toContain('[CC-REDACTED]');
      const ccRedactions = result.redactions.filter((r) => r.type === 'CREDIT_CARD');
      expect(ccRedactions.length).toBeGreaterThanOrEqual(1);
    });

    it('should redact credit card with dashes', () => {
      const result = pipeline.redact('Card: 4111-1111-1111-1111');
      expect(result.redactedText).toContain('[CC-REDACTED]');
    });

    it('should redact a 13-digit card number', () => {
      const result = pipeline.redact('Card: 4111111111111');
      expect(result.redactedText).toContain('[CC-REDACTED]');
    });
  });

  describe('Credential redaction', () => {
    it('should redact api_key=xxx', () => {
      const result = pipeline.redact('Use api_key=sk-abc123def456');
      expect(result.redactedText).toBe('Use [CREDENTIAL-REDACTED]');
      expect(result.redactions).toHaveLength(1);
      expect(result.redactions[0].type).toBe('CREDENTIAL');
    });

    it('should redact password: xxx', () => {
      const result = pipeline.redact('Login with password: s3cret!');
      expect(result.redactedText).toBe('Login with [CREDENTIAL-REDACTED]');
      expect(result.redactions).toHaveLength(1);
    });

    it('should redact token = xxx', () => {
      const result = pipeline.redact('Set token = ghp_abc123');
      expect(result.redactedText).toBe('Set [CREDENTIAL-REDACTED]');
      expect(result.redactions).toHaveLength(1);
    });

    it('should redact secret:value (case insensitive)', () => {
      const result = pipeline.redact('SECRET:my_secret_value');
      expect(result.redactedText).toBe('[CREDENTIAL-REDACTED]');
      expect(result.redactions).toHaveLength(1);
    });
  });

  describe('HIPAA PHI redaction', () => {
    it('should redact medical terms when HIPAA profile is active', () => {
      const result = pipeline.redact(
        'Patient has a diagnosis of diabetes and takes medication daily.',
        ['HIPAA'],
      );
      expect(result.redactedText).toContain('[PHI-REDACTED]');
      const phiRedactions = result.redactions.filter((r) => r.type === 'MEDICAL');
      expect(phiRedactions.length).toBeGreaterThanOrEqual(1);
    });

    it('should NOT redact medical terms without HIPAA profile', () => {
      const result = pipeline.redact(
        'Patient has a diagnosis of diabetes.',
      );
      // Without HIPAA, medical terms should pass through
      expect(result.redactedText).toBe('Patient has a diagnosis of diabetes.');
      const phiRedactions = result.redactions.filter((r) => r.type === 'MEDICAL');
      expect(phiRedactions).toHaveLength(0);
    });

    it('should redact insurance IDs under HIPAA', () => {
      const result = pipeline.redact(
        'insurance id ABC123',
        ['HIPAA'],
      );
      expect(result.redactedText).toContain('[PHI-REDACTED]');
    });
  });

  describe('GDPR PII redaction', () => {
    it('should redact emails when GDPR profile is active', () => {
      const result = pipeline.redact(
        'Contact me at user@example.com please.',
        ['GDPR'],
      );
      expect(result.redactedText).toBe('Contact me at [PII-REDACTED] please.');
      const piiRedactions = result.redactions.filter((r) => r.type === 'EMAIL');
      expect(piiRedactions).toHaveLength(1);
    });

    it('should NOT redact emails without GDPR profile', () => {
      const result = pipeline.redact('Contact me at user@example.com please.');
      expect(result.redactedText).toBe('Contact me at user@example.com please.');
    });

    it('should redact phone numbers when GDPR profile is active', () => {
      const result = pipeline.redact(
        'Call me at (555) 123-4567.',
        ['GDPR'],
      );
      expect(result.redactedText).toContain('[PII-REDACTED]');
      const phoneRedactions = result.redactions.filter((r) => r.type === 'PHONE');
      expect(phoneRedactions).toHaveLength(1);
    });

    it('should NOT redact phone numbers without GDPR profile', () => {
      const result = pipeline.redact('Call me at (555) 123-4567.');
      const phoneRedactions = result.redactions.filter((r) => r.type === 'PHONE');
      expect(phoneRedactions).toHaveLength(0);
    });
  });

  describe('Combined compliance profiles', () => {
    it('should apply both HIPAA and GDPR redactions when both are active', () => {
      const result = pipeline.redact(
        'Patient diagnosis: diabetes. Email: doc@hospital.com. SSN: 123-45-6789.',
        ['HIPAA', 'GDPR'],
      );
      expect(result.redactedText).toContain('[SSN-REDACTED]');
      expect(result.redactedText).toContain('[PHI-REDACTED]');
      expect(result.redactedText).toContain('[PII-REDACTED]');
    });

    it('should always redact SSN and CC regardless of compliance profile', () => {
      const result = pipeline.redact(
        'SSN: 111-22-3333. Card: 4111 1111 1111 1111.',
      );
      expect(result.redactedText).toContain('[SSN-REDACTED]');
      expect(result.redactedText).toContain('[CC-REDACTED]');
    });
  });

  describe('CVV redaction', () => {
    it('should redact CVV near card context', () => {
      const result = pipeline.redact('cvv: 123');
      expect(result.redactedText).toContain('[PCI-REDACTED]');
    });

    it('should redact security code', () => {
      const result = pipeline.redact('security code 4567');
      expect(result.redactedText).toContain('[PCI-REDACTED]');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = pipeline.redact('');
      expect(result.redactedText).toBe('');
      expect(result.redactions).toHaveLength(0);
    });

    it('should handle text with no sensitive data', () => {
      const result = pipeline.redact('Hello, how are you today?');
      expect(result.redactedText).toBe('Hello, how are you today?');
      expect(result.redactions).toHaveLength(0);
    });
  });
});

// ============================================================================
// DNC Checker Tests
// ============================================================================

describe('DNCChecker', () => {
  let checker: DNCChecker;

  beforeEach(() => {
    checker = new DNCChecker();
    jest.clearAllMocks();
  });

  describe('canCall', () => {
    it('should block calls to contacts on the DNC list', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue({
        contactId: 'contact-1',
        doNotCall: true,
        maxCallsPerWeek: 3,
      });

      const result = await checker.canCall('contact-1');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Do Not Call');
    });

    it('should block calls during quiet hours (after 9 PM)', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue(null);

      // Mock Date.prototype.getHours to return 22 (10 PM)
      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(22);

      const result = await checker.canCall('contact-2');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Quiet hours');

      jest.restoreAllMocks();
    });

    it('should block calls during quiet hours (before 8 AM)', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue(null);

      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(6);

      const result = await checker.canCall('contact-3');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Quiet hours');

      jest.restoreAllMocks();
    });

    it('should block calls when weekly limit is reached', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue({
        contactId: 'contact-4',
        doNotCall: false,
        maxCallsPerWeek: 3,
      });

      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14); // 2 PM
      (mockCallAttempt.count as jest.Mock).mockResolvedValue(3);

      const result = await checker.canCall('contact-4');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly call limit reached');

      jest.restoreAllMocks();
    });

    it('should allow calls when all checks pass', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue({
        contactId: 'contact-5',
        doNotCall: false,
        maxCallsPerWeek: 3,
      });

      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14); // 2 PM
      (mockCallAttempt.count as jest.Mock).mockResolvedValue(1);

      const result = await checker.canCall('contact-5');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();

      jest.restoreAllMocks();
    });

    it('should use default max calls per week when no entry exists', async () => {
      (mockDNCEntry.findUnique as jest.Mock).mockResolvedValue(null);

      jest.spyOn(Date.prototype, 'getHours').mockReturnValue(14);
      (mockCallAttempt.count as jest.Mock).mockResolvedValue(0);

      const result = await checker.canCall('contact-new');
      expect(result.allowed).toBe(true);

      jest.restoreAllMocks();
    });
  });

  describe('recordCallAttempt', () => {
    it('should create a call attempt record', async () => {
      (mockCallAttempt.create as jest.Mock).mockResolvedValue({
        id: 'attempt-1',
        contactId: 'contact-1',
        attemptedAt: new Date(),
      });

      await checker.recordCallAttempt('contact-1');
      expect(mockCallAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contactId: 'contact-1',
        }),
      });
    });
  });

  describe('resetWeeklyCounts', () => {
    it('should delete old call attempt records', async () => {
      (mockCallAttempt.deleteMany as jest.Mock).mockResolvedValue({ count: 15 });

      const count = await checker.resetWeeklyCounts();
      expect(count).toBe(15);
      expect(mockCallAttempt.deleteMany).toHaveBeenCalledWith({
        where: {
          attemptedAt: { lt: expect.any(Date) },
        },
      });
    });
  });
});

// ============================================================================
// Retention Service Tests
// ============================================================================

describe('RetentionService', () => {
  let service: RetentionService;

  beforeEach(() => {
    service = new RetentionService();
    jest.clearAllMocks();
  });

  describe('runRetentionCleanup', () => {
    it('should delete expired messages', async () => {
      (mockRetentionConfig.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.deleteMany as jest.Mock).mockResolvedValue({ count: 42 });
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.runRetentionCleanup();
      expect(result.messagesDeleted).toBe(42);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle partial failures gracefully', async () => {
      (mockRetentionConfig.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.deleteMany as jest.Mock).mockRejectedValue(
        new Error('Connection timeout'),
      );
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 5 });
      (mockSession.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.runRetentionCleanup();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Messages cleanup failed');
      // Other cleanups should still succeed
      expect(result.transcriptsDeleted).toBe(5);
    });

    it('should delete old ended sessions and their related records', async () => {
      (mockRetentionConfig.findMany as jest.Mock).mockResolvedValue([]);
      (mockMessage.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
      (mockSession.findMany as jest.Mock).mockResolvedValue([
        { id: 'old-session-1' },
        { id: 'old-session-2' },
      ]);
      (mockOutcome.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
      (mockConsent.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (mockAuthEvent.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
      (mockSession.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });

      const result = await service.runRetentionCleanup();
      expect(result.sessionsDeleted).toBe(2);
    });
  });

  describe('getRetentionConfig', () => {
    it('should return stored config when it exists', async () => {
      (mockRetentionConfig.findUnique as jest.Mock).mockResolvedValue({
        entityId: 'entity-1',
        recordingsDays: 30,
        transcriptsDays: 180,
        messagesDays: 180,
        consentReceiptsDays: 2555,
        updatedAt: new Date(),
      });

      const config = await service.getRetentionConfig('entity-1');
      expect(config.recordingsDays).toBe(30);
      expect(config.transcriptsDays).toBe(180);
    });

    it('should return defaults when no config exists', async () => {
      (mockRetentionConfig.findUnique as jest.Mock).mockResolvedValue(null);

      const config = await service.getRetentionConfig('entity-new');
      expect(config.recordingsDays).toBe(90);
      expect(config.transcriptsDays).toBe(365);
      expect(config.messagesDays).toBe(365);
      expect(config.consentReceiptsDays).toBe(2555);
    });
  });

  describe('updateRetentionConfig', () => {
    it('should upsert the retention config', async () => {
      const mockResult = {
        entityId: 'entity-1',
        recordingsDays: 60,
        transcriptsDays: 365,
        messagesDays: 365,
        consentReceiptsDays: 2555,
        updatedAt: new Date(),
      };
      (mockRetentionConfig.upsert as jest.Mock).mockResolvedValue(mockResult);

      const config = await service.updateRetentionConfig('entity-1', {
        recordingsDays: 60,
      });
      expect(config.recordingsDays).toBe(60);
      expect(mockRetentionConfig.upsert).toHaveBeenCalled();
    });
  });
});
