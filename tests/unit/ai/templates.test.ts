import {
  getSystemTemplate,
  listSystemTemplates,
  buildSystemPrompt,
} from '@/lib/ai/templates';

describe('System Templates', () => {
  describe('getSystemTemplate', () => {
    it('should return template for inbox-assistant', () => {
      const template = getSystemTemplate('inbox-assistant');
      expect(template).toBeDefined();
      expect(template!.id).toBe('inbox-assistant');
      expect(template!.moduleName).toBe('Inbox Assistant');
      expect(template!.persona.length).toBeGreaterThan(0);
      expect(template!.constraints.length).toBeGreaterThan(0);
    });

    it('should return template for calendar-planner', () => {
      const template = getSystemTemplate('calendar-planner');
      expect(template).toBeDefined();
      expect(template!.id).toBe('calendar-planner');
      expect(template!.moduleName).toBe('Calendar Planner');
    });

    it('should return template for finance-advisor', () => {
      const template = getSystemTemplate('finance-advisor');
      expect(template).toBeDefined();
      expect(template!.id).toBe('finance-advisor');
      expect(template!.moduleName).toBe('Finance Advisor');
      // Finance advisor should mention compliance
      expect(template!.persona).toMatch(/compliance|SOX|SEC/i);
    });

    it('should return undefined for invalid module ID', () => {
      expect(getSystemTemplate('nonexistent')).toBeUndefined();
    });
  });

  describe('listSystemTemplates', () => {
    it('should return at least 14 templates', () => {
      const templates = listSystemTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(14);
    });

    it('should have unique IDs', () => {
      const templates = listSystemTemplates();
      const ids = templates.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('buildSystemPrompt', () => {
    it('should return the persona text for a valid module', () => {
      const prompt = buildSystemPrompt('inbox-assistant');
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);

      // Should include persona content
      expect(prompt).toMatch(/inbox|triage|email/i);

      // Should include constraints
      expect(prompt).toContain('Constraints:');

      // Should include output format
      expect(prompt).toContain('Default output format:');
    });

    it('should apply overrides to the base template', () => {
      const customPersona = 'You are a custom persona for testing.';
      const prompt = buildSystemPrompt('inbox-assistant', {
        persona: customPersona,
      });

      expect(prompt).toContain(customPersona);
    });

    it('should throw for invalid module ID', () => {
      expect(() => buildSystemPrompt('nonexistent')).toThrow(
        'System template "nonexistent" not found',
      );
    });
  });
});
