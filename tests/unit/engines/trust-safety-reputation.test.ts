import {
  checkPhoneReputation,
  checkEmailReputation,
  analyzeEmailHeaders,
} from '@/engines/trust-safety/reputation-service';

describe('checkPhoneReputation', () => {
  it('should return low spam score for valid US number', async () => {
    const result = await checkPhoneReputation('+12125551234');
    expect(result.channel).toBe('PHONE');
    expect(result.identifier).toBe('+12125551234');
    // Heuristic: baseline 20, low-risk +1 tier (-10), but sequential digits at end (+15) = 25
    expect(result.spamScore).toBeLessThanOrEqual(30);
    expect(result.stirShakenCompliant).toBe(true);
  });

  it('should return high spam score for fictional +1555 number', async () => {
    const result = await checkPhoneReputation('+15551234567');
    expect(result.spamScore).toBe(85);
    expect(result.stirShakenCompliant).toBe(true); // still US number
  });

  it('should return very high spam score for invalid format (no + prefix)', async () => {
    const result = await checkPhoneReputation('12125551234');
    expect(result.spamScore).toBe(90);
    expect(result.stirShakenCompliant).toBe(false);
  });

  it('should return very high spam score for too-short number', async () => {
    const result = await checkPhoneReputation('+123');
    expect(result.spamScore).toBe(90);
  });

  it('should return high spam score for premium rate number (+1900)', async () => {
    const result = await checkPhoneReputation('+19001234567');
    expect(result.spamScore).toBe(80);
  });

  it('should return elevated spam score for high-risk country code (+234)', async () => {
    const result = await checkPhoneReputation('+2341234567890');
    expect(result.spamScore).toBe(60);
  });

  it('should return very high spam score for invalid country code (+0)', async () => {
    const result = await checkPhoneReputation('+01234567890');
    expect(result.spamScore).toBe(95);
  });

  it('should set STIR/SHAKEN true for US/CA numbers and false for others', async () => {
    const us = await checkPhoneReputation('+12025551234');
    expect(us.stirShakenCompliant).toBe(true);

    const uk = await checkPhoneReputation('+442071234567');
    expect(uk.stirShakenCompliant).toBe(false);
  });

  it('should return deterministic scores (same input = same output)', async () => {
    const result1 = await checkPhoneReputation('+442071234567');
    const result2 = await checkPhoneReputation('+442071234567');
    expect(result1.spamScore).toBe(result2.spamScore);
    expect(result1.warmingProgress).toBe(result2.warmingProgress);
    expect(result1.stirShakenCompliant).toBe(result2.stirShakenCompliant);
  });

  it('should assign warming progress based on country risk tier', async () => {
    const low = await checkPhoneReputation('+12025551234');
    expect(low.warmingProgress).toBeGreaterThanOrEqual(80);

    const high = await checkPhoneReputation('+8612345678901');
    // +86 is high risk prefix match (score 55), warming should be low
    expect(high.warmingProgress).toBeLessThanOrEqual(40);
  });
});

describe('checkEmailReputation', () => {
  it('should return low spam score for gmail.com with auth flags true', async () => {
    const result = await checkEmailReputation('gmail.com');
    expect(result.channel).toBe('EMAIL');
    expect(result.spamScore).toBe(5);
    expect(result.dkimValid).toBe(true);
    expect(result.spfValid).toBe(true);
    expect(result.dmarcValid).toBe(true);
  });

  it('should return high spam score for disposable domain mailinator.com', async () => {
    const result = await checkEmailReputation('mailinator.com');
    expect(result.spamScore).toBe(80);
    expect(result.dkimValid).toBe(false);
    expect(result.spfValid).toBe(false);
    expect(result.dmarcValid).toBe(false);
  });

  it('should return very high spam score for invalid domain (no dot)', async () => {
    const result = await checkEmailReputation('invaliddomain');
    expect(result.spamScore).toBe(90);
  });

  it('should return very high spam score for domain with spaces', async () => {
    const result = await checkEmailReputation('bad domain.com');
    expect(result.spamScore).toBe(90);
  });

  it('should return elevated score for suspicious TLD (.xyz)', async () => {
    const result = await checkEmailReputation('randomsite.xyz');
    expect(result.spamScore).toBeGreaterThanOrEqual(40);
  });

  it('should return elevated score for suspicious TLD (.tk)', async () => {
    const result = await checkEmailReputation('something.tk');
    expect(result.spamScore).toBeGreaterThanOrEqual(40);
  });

  it('should return low score for .edu domain', async () => {
    const result = await checkEmailReputation('harvard.edu');
    expect(result.spamScore).toBe(10);
  });

  it('should return low score for .gov domain', async () => {
    const result = await checkEmailReputation('whitehouse.gov');
    expect(result.spamScore).toBe(5);
  });

  it('should return deterministic scores (same input = same output)', async () => {
    const result1 = await checkEmailReputation('example.com');
    const result2 = await checkEmailReputation('example.com');
    expect(result1.spamScore).toBe(result2.spamScore);
    expect(result1.dkimValid).toBe(result2.dkimValid);
  });

  it('should penalize very short domain names', async () => {
    const shortResult = await checkEmailReputation('ab.com');
    const normalResult = await checkEmailReputation('company.com');
    expect(shortResult.spamScore).toBeGreaterThan(normalResult.spamScore);
  });

  it('should penalize domains with many numbers', async () => {
    const numberyResult = await checkEmailReputation('abc1234def.com');
    const normalResult = await checkEmailReputation('company.com');
    expect(numberyResult.spamScore).toBeGreaterThan(normalResult.spamScore);
  });

  it('should return all trusted domains with spamScore 5', async () => {
    const trusted = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'protonmail.com', 'icloud.com', 'aol.com'];
    for (const domain of trusted) {
      const result = await checkEmailReputation(domain);
      expect(result.spamScore).toBe(5);
    }
  });
});

describe('analyzeEmailHeaders', () => {
  it('should return PASS statuses and NONE risk for valid headers', () => {
    const headers = {
      'from': 'user@example.com',
      'dkim-signature': 'v=1; a=rsa-sha256; d=example.com',
      'received-spf': 'pass (google.com: domain of user@example.com)',
      'Authentication-Results': 'mx.google.com; dmarc=pass (p=REJECT) header.from=example.com',
    };

    const result = analyzeEmailHeaders(headers);
    expect(result.fromDomain).toBe('example.com');
    expect(result.dkimStatus).toBe('PASS');
    expect(result.spfStatus).toBe('PASS');
    expect(result.dmarcStatus).toBe('PASS');
    expect(result.isSpoofed).toBe(false);
    expect(result.riskLevel).toBe('NONE');
    expect(result.details).toContain('All email authentication checks passed.');
  });

  it('should return MISSING statuses for absent headers', () => {
    const headers = {
      'from': 'user@example.com',
    };

    const result = analyzeEmailHeaders(headers);
    expect(result.dkimStatus).toBe('MISSING');
    expect(result.spfStatus).toBe('MISSING');
    expect(result.dmarcStatus).toBe('MISSING');
    expect(result.riskLevel).toBe('HIGH');
  });

  it('should detect spoofing when From/Reply-To domains differ', () => {
    const headers = {
      'from': 'user@legitimate.com',
      'reply-to': 'attacker@evil.com',
      'dkim-signature': 'v=1; a=rsa-sha256',
      'received-spf': 'pass',
      'Authentication-Results': 'dmarc=pass',
    };

    const result = analyzeEmailHeaders(headers);
    expect(result.isSpoofed).toBe(true);
    expect(result.riskLevel).toBe('HIGH');
    expect(result.details.some(d => d.includes('spoofing'))).toBe(true);
  });

  it('should return FAIL for SPF when present but not pass', () => {
    const headers = {
      'from': 'user@example.com',
      'received-spf': 'fail (domain mismatch)',
    };

    const result = analyzeEmailHeaders(headers);
    expect(result.spfStatus).toBe('FAIL');
  });

  it('should return FAIL for DMARC when present but not pass', () => {
    const headers = {
      'from': 'user@example.com',
      'Authentication-Results': 'dmarc=fail',
    };

    const result = analyzeEmailHeaders(headers);
    expect(result.dmarcStatus).toBe('FAIL');
  });
});
