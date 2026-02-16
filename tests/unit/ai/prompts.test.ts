import {
  createPrompt,
  getTemplate,
  listTemplates,
  validateVariables,
  getSystemPrompt,
} from '@/lib/ai/prompts';

describe('Prompt Templates', () => {
  describe('createPrompt', () => {
    it('should interpolate variables into template', () => {
      const result = createPrompt('triage-email', {
        subject: 'Meeting tomorrow',
        body: 'Hi Marcus, can we meet at 3pm?',
        senderName: 'Dr. Martinez',
        senderEmail: 'martinez@example.com',
        userPreferences: 'Prefer morning meetings',
      });

      expect(result).toContain('Meeting tomorrow');
      expect(result).toContain('Hi Marcus, can we meet at 3pm?');
      expect(result).toContain('Dr. Martinez');
      expect(result).toContain('martinez@example.com');
      expect(result).toContain('Prefer morning meetings');
      expect(result).not.toContain('{{subject}}');
      expect(result).not.toContain('{{body}}');
    });

    it('should throw if template ID does not exist', () => {
      expect(() => createPrompt('nonexistent', {})).toThrow(
        'Prompt template "nonexistent" not found',
      );
    });

    it('should throw if required variable is missing', () => {
      expect(() =>
        createPrompt('triage-email', {
          subject: 'Hello',
          // missing body, senderName, senderEmail
        }),
      ).toThrow('Missing required variables');
    });

    it('should replace optional variables with empty string if not provided', () => {
      const result = createPrompt('triage-email', {
        subject: 'Test',
        body: 'Body text',
        senderName: 'Sender',
        senderEmail: 'sender@test.com',
        // userPreferences is optional, not provided
      });

      expect(result).not.toContain('{{userPreferences}}');
      expect(result).toContain('Test');
    });

    it('should handle multiple occurrences of the same variable', () => {
      // The senderName variable may appear in templates — verify replacement is global
      const result = createPrompt('draft-reply', {
        originalMessage: 'Hello there',
        senderName: 'Alice',
        tone: 'WARM',
        keyPoints: 'Confirm the meeting time',
      });

      expect(result).toContain('Alice');
      expect(result).not.toContain('{{senderName}}');
    });

    it('should not modify text that looks like a variable but is not in the template', () => {
      const result = createPrompt('triage-email', {
        subject: 'Test with {{fakeVariable}} inside',
        body: 'Body',
        senderName: 'Sender',
        senderEmail: 'sender@test.com',
      });

      // fakeVariable is not a template variable, so it should remain as-is in the subject
      expect(result).toContain('{{fakeVariable}}');
    });
  });

  describe('getTemplate', () => {
    it('should return template definition for valid ID', () => {
      const template = getTemplate('triage-email');
      expect(template).toBeDefined();
      expect(template!.id).toBe('triage-email');
      expect(template!.name).toBe('Email Triage');
      expect(template!.variables).toContain('subject');
      expect(template!.variables).toContain('body');
    });

    it('should return undefined for invalid ID', () => {
      expect(getTemplate('nonexistent')).toBeUndefined();
    });
  });

  describe('listTemplates', () => {
    it('should return all registered templates', () => {
      const templates = listTemplates();
      expect(templates.length).toBeGreaterThan(0);

      const ids = templates.map((t) => t.id);
      expect(ids).toContain('triage-email');
      expect(ids).toContain('draft-reply');
      expect(ids).toContain('summarize-document');
      expect(ids).toContain('extract-tasks');
    });

    it('should include at least 8 templates', () => {
      const templates = listTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe('validateVariables', () => {
    it('should return valid=true when all required variables provided', () => {
      const result = validateVariables('triage-email', {
        subject: 'Test',
        body: 'Test body',
        senderName: 'Sender',
        senderEmail: 'sender@test.com',
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('should return valid=false with missing variable names', () => {
      const result = validateVariables('triage-email', {
        subject: 'Test',
        // missing body, senderName, senderEmail
      });

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('body');
      expect(result.missing).toContain('senderName');
      expect(result.missing).toContain('senderEmail');
    });

    it('should not require optional variables', () => {
      const result = validateVariables('triage-email', {
        subject: 'Test',
        body: 'Body',
        senderName: 'Sender',
        senderEmail: 'sender@test.com',
        // userPreferences is optional — should not be required
      });

      expect(result.valid).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('getSystemPrompt', () => {
    it('should return system prompt for templates that have one', () => {
      const systemPrompt = getSystemPrompt('triage-email');
      expect(systemPrompt).toBeDefined();
      expect(typeof systemPrompt).toBe('string');
      expect(systemPrompt!.length).toBeGreaterThan(0);
    });

    it('should return undefined for templates without system prompt', () => {
      // All our templates have system prompts, so test with invalid ID
      const result = getSystemPrompt('nonexistent');
      expect(result).toBeUndefined();
    });
  });
});
