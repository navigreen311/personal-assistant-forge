// ============================================================================
// RedactionService — Unit Tests
// ============================================================================

import { RedactionService } from '@/modules/security/services/redaction-service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshService(): RedactionService {
  return new RedactionService();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RedactionService', () => {
  // -----------------------------------------------------------------------
  // redactContent — SSN
  // -----------------------------------------------------------------------
  describe('redactContent — SSN redaction', () => {
    it('should redact SSN to ***-**-****', () => {
      const svc = freshService();
      const result = svc.redactContent('My SSN is 123-45-6789');

      expect(result.redactedText).toBe('My SSN is ***-**-****');
      expect(result.matchCount).toBeGreaterThanOrEqual(1);
      expect(result.matches.some((m) => m.type === 'SSN')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — Credit Card
  // -----------------------------------------------------------------------
  describe('redactContent — Credit card redaction', () => {
    it('should redact credit card number preserving last 4 digits', () => {
      const svc = freshService();
      const result = svc.redactContent('Card: 4111-1111-1111-1234');

      expect(result.redactedText).toContain('****-****-****-1234');
      expect(result.matches.some((m) => m.type === 'CREDIT_CARD')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — Phone
  // -----------------------------------------------------------------------
  describe('redactContent — Phone redaction', () => {
    it('should redact phone number preserving last 4 digits', () => {
      const svc = freshService();
      const result = svc.redactContent('Call me at (555) 123-4567');

      expect(result.redactedText).toContain('(***) ***-4567');
      expect(result.matches.some((m) => m.type === 'PHONE')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — Email
  // -----------------------------------------------------------------------
  describe('redactContent — Email redaction', () => {
    it('should redact email preserving first char and domain', () => {
      const svc = freshService();
      const result = svc.redactContent('Contact user@example.com for info');

      expect(result.redactedText).toContain('u***@example.com');
      expect(result.matches.some((m) => m.type === 'EMAIL')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — Medical Record Number
  // -----------------------------------------------------------------------
  describe('redactContent — MRN redaction', () => {
    it('should redact MRN to MRN:******', () => {
      const svc = freshService();
      const result = svc.redactContent('Patient MRN#1234567 is admitted');

      expect(result.redactedText).toContain('MRN:******');
      expect(
        result.matches.some((m) => m.type === 'MEDICAL_RECORD_NUMBER'),
      ).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — IP Address
  // -----------------------------------------------------------------------
  describe('redactContent — IP address redaction', () => {
    it('should redact IP address to ***.***.***.***', () => {
      const svc = freshService();
      const result = svc.redactContent('Server at 192.168.1.1 is down');

      expect(result.redactedText).toContain('***.***.***.***');
      expect(result.matches.some((m) => m.type === 'IP_ADDRESS')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — Multiple sensitive items
  // -----------------------------------------------------------------------
  describe('redactContent — multiple sensitive items', () => {
    it('should redact all sensitive data in a single text', () => {
      const svc = freshService();
      const text =
        'SSN: 123-45-6789, email: alice@corp.com, phone: (555) 111-2222';
      const result = svc.redactContent(text);

      expect(result.redactedText).toContain('***-**-****');
      expect(result.redactedText).toContain('a***@corp.com');
      expect(result.redactedText).toContain('(***) ***-2222');
      expect(result.matchCount).toBeGreaterThanOrEqual(3);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — No sensitive data
  // -----------------------------------------------------------------------
  describe('redactContent — no sensitive data', () => {
    it('should return content unchanged when no sensitive data is found', () => {
      const svc = freshService();
      const text = 'This is a perfectly clean sentence with no PII.';
      const result = svc.redactContent(text);

      expect(result.redactedText).toBe(text);
      expect(result.matchCount).toBe(0);
      expect(result.matches).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — category filter
  // -----------------------------------------------------------------------
  describe('redactContent — category filter', () => {
    it('should only redact categories listed in the filter', () => {
      const svc = freshService();
      const text =
        'SSN: 123-45-6789 and card 4111-1111-1111-1234';

      // Only redact PCI (credit cards), skip PII (SSN)
      const result = svc.redactContent(text, { categories: ['PCI'] });

      // Credit card should be redacted
      expect(result.redactedText).toContain('****-****-****-1234');
      // SSN should still be present (not redacted)
      expect(result.redactedText).toContain('123-45-6789');
    });

    it('should only redact PII when PII category is specified', () => {
      const svc = freshService();
      const text = 'SSN: 123-45-6789 and card 4111-1111-1111-1234';

      const result = svc.redactContent(text, { categories: ['PII'] });

      // SSN should be redacted
      expect(result.redactedText).toContain('***-**-****');
      // Credit card should still be present
      expect(result.redactedText).toContain('4111-1111-1111-1234');
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — match positions
  // -----------------------------------------------------------------------
  describe('redactContent — match positions', () => {
    it('should report accurate startIndex and endIndex for matches', () => {
      const svc = freshService();
      const text = 'My SSN is 123-45-6789 today';
      const result = svc.redactContent(text);

      const ssnMatch = result.matches.find((m) => m.type === 'SSN');
      expect(ssnMatch).toBeDefined();
      expect(ssnMatch!.startIndex).toBe(text.indexOf('123-45-6789'));
      expect(ssnMatch!.endIndex).toBe(
        text.indexOf('123-45-6789') + '123-45-6789'.length,
      );

      // Validate that slicing the original text at the match boundaries
      // returns the matched value
      expect(text.slice(ssnMatch!.startIndex, ssnMatch!.endIndex)).toBe(
        ssnMatch!.value,
      );
    });
  });

  // -----------------------------------------------------------------------
  // redactContent — match counts by category
  // -----------------------------------------------------------------------
  describe('redactContent — match counts by category', () => {
    it('should correctly count matches and categories', () => {
      const svc = freshService();
      const text =
        'SSN: 123-45-6789, card: 4111-1111-1111-1234, email: bob@test.com';
      const result = svc.redactContent(text);

      expect(result.matchCount).toBeGreaterThanOrEqual(3);

      // Count by type
      const ssnCount = result.matches.filter((m) => m.type === 'SSN').length;
      const ccCount = result.matches.filter(
        (m) => m.type === 'CREDIT_CARD',
      ).length;
      const emailCount = result.matches.filter(
        (m) => m.type === 'EMAIL',
      ).length;

      expect(ssnCount).toBe(1);
      expect(ccCount).toBe(1);
      expect(emailCount).toBe(1);

      // Categories should include PII and PCI at minimum
      expect(result.categories).toContain('PII');
      expect(result.categories).toContain('PCI');
    });
  });

  // -----------------------------------------------------------------------
  // redactForIndexing
  // -----------------------------------------------------------------------
  describe('redactForIndexing', () => {
    it('should remove all PII/PHI/PCI from indexed content', () => {
      const svc = freshService();
      const text =
        'Patient MRN#1234567 SSN 123-45-6789 called from (555) 222-3333 about diabetes medication metformin';

      const indexed = svc.redactForIndexing(text);

      // Sensitive values must not appear
      expect(indexed).not.toContain('1234567');
      expect(indexed).not.toContain('123-45-6789');
      expect(indexed).not.toContain('(555) 222-3333');
      expect(indexed).not.toContain('555');

      // Structural non-sensitive words should still be present
      expect(indexed).toContain('Patient');
      expect(indexed).toContain('called');
      expect(indexed).toContain('from');
      expect(indexed).toContain('about');
    });

    it('should preserve non-sensitive content words', () => {
      const svc = freshService();
      const text =
        'The quick brown fox jumps with SSN 999-88-7777 over the lazy dog';
      const indexed = svc.redactForIndexing(text);

      expect(indexed).toContain('quick brown fox');
      expect(indexed).toContain('over the lazy dog');
      expect(indexed).not.toContain('999-88-7777');
    });
  });

  // -----------------------------------------------------------------------
  // detectSensitiveData
  // -----------------------------------------------------------------------
  describe('detectSensitiveData', () => {
    it('should detect sensitive data without modifying content', () => {
      const svc = freshService();
      const text = 'SSN: 111-22-3333, email: admin@corp.org';

      const matches = svc.detectSensitiveData(text);

      expect(matches.length).toBeGreaterThanOrEqual(2);

      const ssnMatch = matches.find((m) => m.type === 'SSN');
      expect(ssnMatch).toBeDefined();
      expect(ssnMatch!.value).toBe('111-22-3333');

      const emailMatch = matches.find((m) => m.type === 'EMAIL');
      expect(emailMatch).toBeDefined();
      expect(emailMatch!.value).toBe('admin@corp.org');
    });

    it('should return all matches with types and positions', () => {
      const svc = freshService();
      const text =
        'Card 4222-3333-4444-5555, MRN#9876543, IP 10.0.0.1';

      const matches = svc.detectSensitiveData(text);

      for (const match of matches) {
        // Every match must have the required fields
        expect(match.type).toBeDefined();
        expect(typeof match.type).toBe('string');
        expect(match.category).toBeDefined();
        expect(typeof match.startIndex).toBe('number');
        expect(typeof match.endIndex).toBe('number');
        expect(match.endIndex).toBeGreaterThan(match.startIndex);
        expect(typeof match.confidence).toBe('number');
        expect(match.confidence).toBeGreaterThan(0);
        expect(match.confidence).toBeLessThanOrEqual(1);

        // The value should match the slice of the original text
        expect(text.slice(match.startIndex, match.endIndex)).toBe(
          match.value,
        );
      }

      // Should find at least credit card, MRN, and IP
      const types = matches.map((m) => m.type);
      expect(types).toContain('CREDIT_CARD');
      expect(types).toContain('MEDICAL_RECORD_NUMBER');
      expect(types).toContain('IP_ADDRESS');
    });

    it('should return empty array when no sensitive data exists', () => {
      const svc = freshService();
      const matches = svc.detectSensitiveData(
        'Nothing sensitive in this plain text at all',
      );

      expect(matches).toEqual([]);
    });
  });
});
