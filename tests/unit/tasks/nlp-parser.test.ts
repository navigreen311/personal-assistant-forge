import { extractEntities, parseTaskFromText, parseMultipleTasks } from '@/modules/tasks/services/nlp-parser';
import { startOfTomorrow } from 'date-fns';

// Mock AI client — make generateJSON reject so we fall back to regex parsing
const mockGenerateJSON = jest.fn();
jest.mock('@/lib/ai', () => ({
  generateJSON: (...args: unknown[]) => mockGenerateJSON(...args),
}));

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

describe('NLPParser', () => {
  describe('parseTaskFromText', () => {
    it('should parse "Review Q4 financials by Friday P0" correctly', async () => {
      const result = await parseTaskFromText('Review Q4 financials by Friday P0');
      expect(result.priority).toBe('P0');
      expect(result.dueDate).toBeDefined();
      expect(result.rawInput).toBe('Review Q4 financials by Friday P0');
      expect(result.title).toBeTruthy();
    });

    it('should parse "Call Dr. Martinez tomorrow about HIPAA audit" correctly', async () => {
      const result = await parseTaskFromText('Call Dr. Martinez tomorrow about HIPAA audit');
      expect(result.dueDate).toBeDefined();
      if (result.dueDate) {
        const tomorrow = startOfTomorrow();
        expect(result.dueDate.toDateString()).toBe(tomorrow.toDateString());
      }
      expect(result.assigneeName).toBeUndefined();
      expect(result.title).toBeTruthy();
    });

    it('should parse "Schedule team meeting next Monday at 2pm" correctly', async () => {
      const result = await parseTaskFromText('Schedule team meeting next Monday at 2pm');
      expect(result.dueDate).toBeDefined();
      if (result.dueDate) {
        expect(result.dueDate.getDay()).toBe(1); // Monday
      }
      expect(result.title).toBeTruthy();
    });

    it('should parse "Submit proposal for Downtown Development by March 15" correctly', async () => {
      const result = await parseTaskFromText('Submit proposal for Downtown Development by March 15');
      expect(result.dueDate).toBeDefined();
      expect(result.title).toBeTruthy();
    });

    it('should parse "#urgent Follow up with Bobby about property" correctly', async () => {
      const result = await parseTaskFromText('#urgent Follow up with Bobby about property');
      expect(result.tags).toBeDefined();
      expect(result.tags).toContain('urgent');
      expect(result.title).toBeTruthy();
    });

    it('should handle plain text without entities as title-only', async () => {
      const result = await parseTaskFromText('Do something');
      expect(result.title).toBe('Do something');
      expect(result.priority).toBeUndefined();
      expect(result.dueDate).toBeUndefined();
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should normalize "tomorrow" to correct date', async () => {
      const result = await parseTaskFromText('Finish report tomorrow');
      expect(result.dueDate).toBeDefined();
      if (result.dueDate) {
        const tomorrow = startOfTomorrow();
        expect(result.dueDate.toDateString()).toBe(tomorrow.toDateString());
      }
    });

    it('should normalize "urgent" to P0', async () => {
      const result = await parseTaskFromText('urgent: Fix the bug');
      expect(result.priority).toBe('P0');
    });

    it('should normalize "low priority" to P2', async () => {
      const result = await parseTaskFromText('Clean desk low priority');
      expect(result.priority).toBe('P2');
    });

    it('should extract multiple tags', async () => {
      const result = await parseTaskFromText('#finance #quarterly Review the budget');
      expect(result.tags).toBeDefined();
      expect(result.tags!.length).toBeGreaterThanOrEqual(2);
      expect(result.tags).toContain('finance');
      expect(result.tags).toContain('quarterly');
    });

    it('should set confidence based on extraction count', async () => {
      const simple = await parseTaskFromText('Do something');
      const complex = await parseTaskFromText('Review Q4 financials by Friday P0 #finance');
      expect(complex.confidence).toBeGreaterThan(simple.confidence);
    });
  });

  describe('parseMultipleTasks', () => {
    it('should parse newline-separated tasks', async () => {
      const input = 'Review budget\nCall client\nUpdate report';
      const results = await parseMultipleTasks(input);
      expect(results.length).toBe(3);
      expect(results[0].title).toContain('Review budget');
      expect(results[1].title).toContain('Call client');
      expect(results[2].title).toContain('Update report');
    });

    it('should parse numbered list of tasks', async () => {
      const input = '1. Review budget\n2. Call client\n3. Update report';
      const results = await parseMultipleTasks(input);
      expect(results.length).toBe(3);
    });

    it('should handle "and" conjunction between tasks', async () => {
      const input = 'Review budget and Call client';
      const results = await parseMultipleTasks(input);
      expect(results.length).toBe(2);
    });
  });

  describe('extractEntities', () => {
    it('should extract DATE entities', () => {
      const entities = extractEntities('Finish report by tomorrow');
      const dateEntity = entities.find((e) => e.type === 'DATE');
      expect(dateEntity).toBeDefined();
      expect(dateEntity!.value).toBe('tomorrow');
    });

    it('should extract PRIORITY entities', () => {
      const entities = extractEntities('Urgent: fix the bug P0');
      const priorityEntity = entities.find((e) => e.type === 'PRIORITY');
      expect(priorityEntity).toBeDefined();
    });

    it('should extract PERSON entities', () => {
      const entities = extractEntities('assign to Sarah Johnson');
      const personEntity = entities.find((e) => e.type === 'PERSON');
      expect(personEntity).toBeDefined();
      expect(personEntity!.normalized).toBe('Sarah Johnson');
    });

    it('should extract PROJECT entities', () => {
      const entities = extractEntities('for the EHR Migration project');
      const projectEntity = entities.find((e) => e.type === 'PROJECT');
      expect(projectEntity).toBeDefined();
    });

    it('should extract TAG entities', () => {
      const entities = extractEntities('#healthcare #urgent review records');
      const tagEntities = entities.filter((e) => e.type === 'TAG');
      expect(tagEntities.length).toBeGreaterThanOrEqual(2);
    });

    it('should return start/end indices for each entity', () => {
      const entities = extractEntities('Fix bug tomorrow P0');
      for (const entity of entities) {
        expect(entity.startIndex).toBeGreaterThanOrEqual(0);
        expect(entity.endIndex).toBeGreaterThan(entity.startIndex);
      }
    });
  });
});
