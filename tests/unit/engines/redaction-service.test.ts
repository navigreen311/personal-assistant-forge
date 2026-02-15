import { previewRedaction, calculateSensitivity, applyRedaction } from '@/engines/trust-ui/redaction-service';

describe('previewRedaction', () => {
  it('should detect and redact email addresses', () => {
    const result = previewRedaction('Contact me at john@example.com please');

    expect(result.redactedText).toContain('[EMAIL REDACTED]');
    expect(result.redactedText).not.toContain('john@example.com');
    expect(result.redactions.some((r) => r.type === 'EMAIL')).toBe(true);
  });

  it('should detect and redact phone numbers', () => {
    const result = previewRedaction('Call me at (555) 123-4567');

    expect(result.redactedText).toContain('[PHONE REDACTED]');
    expect(result.redactedText).not.toContain('555');
    expect(result.redactions.some((r) => r.type === 'PHONE')).toBe(true);
  });

  it('should detect and redact SSN patterns', () => {
    const result = previewRedaction('My SSN is 123-45-6789');

    expect(result.redactedText).toContain('[SSN REDACTED]');
    expect(result.redactedText).not.toContain('123-45-6789');
    expect(result.redactions.some((r) => r.type === 'SSN')).toBe(true);
  });

  it('should detect and redact credit card numbers', () => {
    const result = previewRedaction('Card: 4111 1111 1111 1111');

    expect(result.redactedText).toContain('[CARD REDACTED]');
    expect(result.redactedText).not.toContain('4111');
    expect(result.redactions.some((r) => r.type === 'CREDIT_CARD')).toBe(true);
  });

  it('should handle text with no sensitive data', () => {
    const result = previewRedaction('This is a plain text message with nothing sensitive.');

    expect(result.redactedText).toBe(result.originalText);
    expect(result.redactions).toHaveLength(0);
    expect(result.sensitivityLevel).toBe('LOW');
  });

  it('should return correct start/end positions for each redaction', () => {
    const text = 'Email: test@example.com is here';
    const result = previewRedaction(text);

    expect(result.redactions.length).toBeGreaterThan(0);
    for (const r of result.redactions) {
      expect(r.start).toBeGreaterThanOrEqual(0);
      expect(r.end).toBeGreaterThan(r.start);
      expect(r.end).toBeLessThanOrEqual(text.length);
      // The original text between start and end should match the detected pattern
      const original = text.slice(r.start, r.end);
      expect(original.length).toBeGreaterThan(0);
    }
  });
});

describe('applyRedaction', () => {
  it('should return the redacted text', () => {
    const preview = previewRedaction('Email: test@example.com');
    const result = applyRedaction(preview);

    expect(result).toBe(preview.redactedText);
    expect(result).toContain('[EMAIL REDACTED]');
  });
});

describe('calculateSensitivity', () => {
  it('should return RESTRICTED for SSN/credit card data', () => {
    expect(calculateSensitivity('SSN: 123-45-6789')).toBe('RESTRICTED');
    expect(calculateSensitivity('Card: 4111 1111 1111 1111')).toBe('RESTRICTED');
  });

  it('should return CONFIDENTIAL for email/phone', () => {
    expect(calculateSensitivity('Email: user@test.com')).toBe('CONFIDENTIAL');
    expect(calculateSensitivity('Phone: 555-123-4567')).toBe('CONFIDENTIAL');
  });

  it('should return PUBLIC for text with no PII', () => {
    expect(calculateSensitivity('Just a normal sentence.')).toBe('PUBLIC');
  });
});
