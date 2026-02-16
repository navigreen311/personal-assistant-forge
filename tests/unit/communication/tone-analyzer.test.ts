import { analyzeTone, shiftTone } from '@/modules/communication/services/tone-analyzer';

describe('tone-analyzer', () => {
  describe('analyzeTone', () => {
    it('should detect FIRM tone from demanding language', () => {
      const result = analyzeTone('I must insist you require this immediately. The deadline is non-negotiable.');
      expect(result.detectedTone).toBe('FIRM');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.assertiveness).toBeGreaterThanOrEqual(7);
    });

    it('should detect WARM tone from appreciative language', () => {
      const result = analyzeTone('I am so happy and grateful for this wonderful opportunity. Thank you!');
      expect(result.detectedTone).toBe('WARM');
      expect(result.empathy).toBeGreaterThanOrEqual(7);
    });

    it('should detect DIPLOMATIC tone from balanced language', () => {
      const result = analyzeTone('Perhaps we can consider a mutual compromise. I understand your perspective and suggest we collaborate.');
      expect(result.detectedTone).toBe('DIPLOMATIC');
      expect(result.formality).toBeGreaterThanOrEqual(5);
    });

    it('should detect CASUAL tone from informal language', () => {
      const result = analyzeTone('Hey, that sounds cool! Yeah, no worries, gonna check it out. Awesome btw.');
      expect(result.detectedTone).toBe('CASUAL');
      expect(result.formality).toBeLessThanOrEqual(3);
    });

    it('should detect FORMAL tone from professional language', () => {
      const result = analyzeTone('Hereby we formally notify you. Furthermore, pursuant to our agreement, we cordially invite you.');
      expect(result.detectedTone).toBe('FORMAL');
      expect(result.formality).toBeGreaterThanOrEqual(8);
    });

    it('should return default for empty text', () => {
      const result = analyzeTone('');
      expect(result.detectedTone).toBe('DIRECT');
      expect(result.confidence).toBe(0);
    });

    it('should include suggestions array', () => {
      const result = analyzeTone('This is a test message.');
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should return metrics in valid ranges', () => {
      const result = analyzeTone('Thank you for your help, I really appreciate it.');
      expect(result.formality).toBeGreaterThanOrEqual(0);
      expect(result.formality).toBeLessThanOrEqual(10);
      expect(result.assertiveness).toBeGreaterThanOrEqual(0);
      expect(result.assertiveness).toBeLessThanOrEqual(10);
      expect(result.empathy).toBeGreaterThanOrEqual(0);
      expect(result.empathy).toBeLessThanOrEqual(10);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('shiftTone', () => {
    it('should shift to FORMAL by expanding contractions', () => {
      const result = shiftTone("I can't do this and I won't try.", 'FORMAL');
      expect(result).toContain('cannot');
      expect(result).toContain('will not');
    });

    it('should shift to CASUAL by contracting words', () => {
      const result = shiftTone('I do not want to and I cannot agree.', 'CASUAL');
      expect(result).toContain("don't");
      expect(result).toContain("can't");
    });

    it('should add WARM prefix and suffix', () => {
      const result = shiftTone('We need to discuss the project.', 'WARM');
      expect(result).toContain('hope this finds you well');
      expect(result).toContain('Thank you');
    });

    it('should add EMPATHETIC wrapping', () => {
      const result = shiftTone('The deadline has passed.', 'EMPATHETIC');
      expect(result).toContain('understand');
      expect(result).toContain('support');
    });

    it('should return empty string for empty input', () => {
      const result = shiftTone('', 'FIRM');
      expect(result).toBe('');
    });

    it('should produce a different output than input for non-DIRECT tones', () => {
      const input = 'Please complete the task.';
      const result = shiftTone(input, 'DIPLOMATIC');
      expect(result).not.toBe(input);
    });
  });
});
