import { analyzeTone, shiftTone, analyzeToneWithAI, shiftToneWithAI } from '@/modules/communication/services/tone-analyzer';

jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn(),
  generateText: jest.fn(),
}));

import { generateJSON, generateText } from '@/lib/ai';

describe('tone-analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

    it('should return 0 confidence for empty text', () => {
      const result = analyzeTone('');
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

  describe('analyzeToneWithAI', () => {
    it('should call generateJSON with text content', async () => {
      (generateJSON as jest.Mock).mockResolvedValue({
        detectedTone: 'WARM',
        confidence: 0.9,
        formality: 4,
        assertiveness: 3,
        empathy: 8,
        suggestions: ['Consider adding a call to action'],
      });

      const result = await analyzeToneWithAI('Thank you so much for your help!');

      expect(generateJSON).toHaveBeenCalledTimes(1);
      expect(generateJSON).toHaveBeenCalledWith(
        expect.stringContaining('Thank you so much'),
        expect.any(Object)
      );
      expect(result.detectedTone).toBe('WARM');
    });

    it('should return AI-detected tone with metrics', async () => {
      (generateJSON as jest.Mock).mockResolvedValue({
        detectedTone: 'FORMAL',
        confidence: 0.85,
        formality: 9,
        assertiveness: 6,
        empathy: 3,
        suggestions: ['Good formality level'],
      });

      const result = await analyzeToneWithAI('Dear Sir, I am writing to formally request...');

      expect(result.detectedTone).toBe('FORMAL');
      expect(result.confidence).toBe(0.85);
      expect(result.formality).toBe(9);
      expect(result.assertiveness).toBe(6);
      expect(result.empathy).toBe(3);
      expect(result.suggestions).toEqual(['Good formality level']);
    });

    it('should fallback to keyword-based on AI failure', async () => {
      (generateJSON as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await analyzeToneWithAI('I must require this immediately. The deadline is non-negotiable.');

      expect(result.detectedTone).toBe('FIRM');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should use keyword-based for empty text', async () => {
      const result = await analyzeToneWithAI('');

      expect(generateJSON).not.toHaveBeenCalled();
      expect(result.detectedTone).toBe('DIRECT');
      expect(result.confidence).toBe(0);
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

    it('should add FIRM prefix and suffix', () => {
      const result = shiftTone('Please complete this task.', 'FIRM');
      expect(result).toContain('I want to be clear');
      expect(result).toContain('addressed promptly');
    });

    it('should strip existing greetings before shifting', () => {
      const result = shiftTone('Hey, we need to discuss the project.', 'FORMAL');
      expect(result).not.toMatch(/^Hey,/);
      expect(result).toContain('Dear colleague');
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

  describe('shiftToneWithAI', () => {
    it('should call generateText to rewrite with target tone', async () => {
      (generateText as jest.Mock).mockResolvedValue('Dear colleague, I kindly request that you complete this task at your earliest convenience.');

      const result = await shiftToneWithAI('Do this task now.', 'FORMAL');

      expect(generateText).toHaveBeenCalledTimes(1);
      expect(generateText).toHaveBeenCalledWith(
        expect.stringContaining('FORMAL'),
        expect.any(Object)
      );
      expect(result).toContain('Dear colleague');
    });

    it('should preserve original meaning', async () => {
      (generateText as jest.Mock).mockResolvedValue('Hey! Could you check on the project status when you get a chance?');

      const result = await shiftToneWithAI('Please check on the project status.', 'CASUAL');

      expect(result).toContain('project status');
    });

    it('should fallback to rule-based on AI failure', async () => {
      (generateText as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await shiftToneWithAI('Please complete this.', 'WARM');

      expect(result).toContain('hope this finds you well');
      expect(result).toContain('Thank you');
    });

    it('should return empty text unchanged', async () => {
      const result = await shiftToneWithAI('', 'FORMAL');

      expect(generateText).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should fallback when generateText returns empty string', async () => {
      (generateText as jest.Mock).mockResolvedValue('');

      const result = await shiftToneWithAI('Complete this task.', 'FIRM');

      // Falls back to rule-based shiftTone
      expect(result).toContain('I want to be clear');
    });
  });
});
