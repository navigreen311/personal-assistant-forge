import {
  verifyVoiceCloneConsent,
  applyWatermark,
  generateDisclosure,
  detectImpersonation,
  recordConsent,
  revokeConsent,
  checkNameSimilarity,
  detectHomoglyphs,
  checkDomainSpoofing,
} from '@/engines/trust-safety/impersonation-guard';

// Mock AI client
jest.mock('@/lib/ai', () => ({
  generateText: jest.fn().mockResolvedValue('AI-generated explanation'),
  generateJSON: jest.fn().mockResolvedValue({
    isLikelyImpersonation: false,
    confidence: 0.2,
    reasoning: 'Styles are consistent',
    styleDeviations: [],
  }),
  chat: jest.fn().mockResolvedValue('AI conversational response'),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    voiceConsent: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { generateJSON } from '@/lib/ai';

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGenerateJSON = generateJSON as jest.MockedFunction<typeof generateJSON>;

describe('verifyVoiceCloneConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return consentVerified true when consent record exists', async () => {
    (mockPrisma.voiceConsent.findFirst as jest.Mock).mockResolvedValue({
      userId: 'user1',
      voiceCloneId: 'voice1',
      consentGiven: true,
      revokedAt: null,
      consentTimestamp: new Date('2025-01-01'),
    });

    const result = await verifyVoiceCloneConsent('user1', 'voice1');

    expect(result.consentVerified).toBe(true);
    expect(result.voiceCloneId).toBe('voice1');
    expect(result.consentTimestamp).toEqual(new Date('2025-01-01'));
  });

  it('should return consentVerified false when no consent record exists', async () => {
    (mockPrisma.voiceConsent.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await verifyVoiceCloneConsent('user1', 'voice1');

    expect(result.consentVerified).toBe(false);
    expect(result.consentTimestamp).toBeUndefined();
  });

  it('should query prisma with correct filters', async () => {
    (mockPrisma.voiceConsent.findFirst as jest.Mock).mockResolvedValue(null);

    await verifyVoiceCloneConsent('user42', 'clone99');

    expect(mockPrisma.voiceConsent.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user42',
        voiceCloneId: 'clone99',
        consentGiven: true,
        revokedAt: null,
      },
    });
  });
});

describe('applyWatermark', () => {
  it('should return safeguard with watermarkApplied true', async () => {
    const result = await applyWatermark('audio-123');

    expect(result.watermarkApplied).toBe(true);
    expect(result.consentVerified).toBe(true);
    expect(result.disclosureIncluded).toBe(true);
    expect(result.voiceCloneId).toBe('audio-123');
  });
});

describe('generateDisclosure', () => {
  it('should return voice_call disclosure for voice_call context', () => {
    const result = generateDisclosure('voice_call');
    expect(result).toContain('AI assistant');
    expect(result).toContain('AI-generated');
  });

  it('should return email disclosure for email context', () => {
    const result = generateDisclosure('email');
    expect(result).toContain('AI assistant');
    expect(result).toContain('drafted');
  });

  it('should return chat disclosure for chat context', () => {
    const result = generateDisclosure('chat');
    expect(result).toContain('AI assistant');
  });

  it('should return voicemail disclosure for voicemail context', () => {
    const result = generateDisclosure('voicemail');
    expect(result).toContain('AI assistant');
  });

  it('should return a default disclosure for unknown context', () => {
    const result = generateDisclosure('unknown_context');
    expect(result).toContain('AI assistant');
    expect(result).toContain('AI-generated');
  });
});

describe('detectImpersonation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call generateJSON and return AI analysis result', async () => {
    mockGenerateJSON.mockResolvedValue({
      isLikelyImpersonation: true,
      confidence: 0.85,
      reasoning: 'Style differs significantly',
      styleDeviations: ['vocabulary shift', 'tone change'],
    });

    const result = await detectImpersonation(
      ['Hello there!', 'How are you doing?'],
      'Greetings, I require immediate access.'
    );

    expect(result.isLikelyImpersonation).toBe(true);
    expect(result.confidence).toBe(0.85);
    expect(result.styleDeviations).toHaveLength(2);
    expect(mockGenerateJSON).toHaveBeenCalled();
  });

  it('should return safe fallback when AI fails', async () => {
    mockGenerateJSON.mockRejectedValue(new Error('AI unavailable'));

    const result = await detectImpersonation(
      ['Hello there!'],
      'Some suspect message'
    );

    expect(result.isLikelyImpersonation).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain('unavailable');
    expect(result.styleDeviations).toEqual([]);
  });
});

describe('recordConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should upsert consent record with correct parameters', async () => {
    (mockPrisma.voiceConsent.upsert as jest.Mock).mockResolvedValue({});

    await recordConsent('user1', 'voice1');

    expect(mockPrisma.voiceConsent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_voiceCloneId: { userId: 'user1', voiceCloneId: 'voice1' } },
        create: expect.objectContaining({
          userId: 'user1',
          voiceCloneId: 'voice1',
          consentGiven: true,
        }),
        update: expect.objectContaining({
          consentGiven: true,
          revokedAt: null,
        }),
      })
    );
  });
});

describe('revokeConsent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should update consent record setting consentGiven to false', async () => {
    (mockPrisma.voiceConsent.update as jest.Mock).mockResolvedValue({});

    await revokeConsent('user1', 'voice1');

    expect(mockPrisma.voiceConsent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_voiceCloneId: { userId: 'user1', voiceCloneId: 'voice1' } },
        data: expect.objectContaining({
          consentGiven: false,
        }),
      })
    );
  });
});

describe('checkNameSimilarity', () => {
  it('should return exact match for identical normalized names', () => {
    const result = checkNameSimilarity('John Doe', 'john doe');
    expect(result.isSimilar).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.method).toBe('normalized_exact');
  });

  it('should return similar for names within levenshtein distance 2', () => {
    const result = checkNameSimilarity('John Doe', 'Jon Doe');
    expect(result.isSimilar).toBe(true);
    expect(result.method).toBe('levenshtein');
    expect(result.distance).toBeLessThanOrEqual(2);
  });

  it('should return not similar for very different names', () => {
    const result = checkNameSimilarity('John Doe', 'Alice Smith');
    expect(result.isSimilar).toBe(false);
    expect(result.distance).toBeGreaterThan(2);
  });

  it('should normalize away middle initials', () => {
    const result = checkNameSimilarity('John A. Doe', 'John Doe');
    expect(result.isSimilar).toBe(true);
    expect(result.distance).toBe(0);
    expect(result.method).toBe('normalized_exact');
  });

  it('should handle extra whitespace correctly', () => {
    const result = checkNameSimilarity('  John   Doe  ', 'John Doe');
    expect(result.isSimilar).toBe(true);
    expect(result.distance).toBe(0);
  });
});

describe('detectHomoglyphs', () => {
  it('should detect Cyrillic homoglyphs in text', () => {
    // \u0430 is Cyrillic 'a' which looks like Latin 'a'
    const result = detectHomoglyphs('p\u0430ypal');
    expect(result.hasHomoglyphs).toBe(true);
    expect(result.suspiciousChars.length).toBeGreaterThan(0);
    expect(result.suspiciousChars[0].lookalike).toBe('a');
  });

  it('should return no homoglyphs for pure ASCII text', () => {
    const result = detectHomoglyphs('paypal');
    expect(result.hasHomoglyphs).toBe(false);
    expect(result.suspiciousChars).toEqual([]);
  });

  it('should detect multiple homoglyph characters', () => {
    // \u0430 = Cyrillic a, \u0435 = Cyrillic e
    const result = detectHomoglyphs('\u0430ppl\u0435');
    expect(result.hasHomoglyphs).toBe(true);
    expect(result.suspiciousChars).toHaveLength(2);
  });

  it('should include unicode code point in result', () => {
    const result = detectHomoglyphs('\u0430');
    expect(result.suspiciousChars[0].unicode).toBe('U+0430');
  });
});

describe('checkDomainSpoofing', () => {
  it('should return not spoofed for identical domains', () => {
    const result = checkDomainSpoofing('google.com', 'google.com');
    expect(result.isSpoofed).toBe(false);
    expect(result.technique).toBe('none');
    expect(result.confidence).toBe(0);
  });

  it('should detect homoglyph-based domain spoofing', () => {
    // Use Cyrillic 'a' (\u0430) to spoof "google.com"
    const result = checkDomainSpoofing('goo\u0430le.com', 'google.com');
    expect(result.isSpoofed).toBe(true);
    expect(result.technique).toBe('homoglyph');
    expect(result.confidence).toBe(0.95);
  });

  it('should detect subdomain-based spoofing', () => {
    const result = checkDomainSpoofing('google.com.evil.com', 'google.com');
    expect(result.isSpoofed).toBe(true);
    expect(result.technique).toBe('subdomain');
    expect(result.confidence).toBe(0.9);
  });

  it('should detect TLD swap spoofing', () => {
    const result = checkDomainSpoofing('google.net', 'google.com');
    expect(result.isSpoofed).toBe(true);
    expect(result.technique).toBe('tld_swap');
    expect(result.confidence).toBe(0.85);
  });

  it('should return not spoofed for completely different domains', () => {
    const result = checkDomainSpoofing('example.com', 'google.com');
    expect(result.isSpoofed).toBe(false);
    expect(result.technique).toBe('none');
  });
});
