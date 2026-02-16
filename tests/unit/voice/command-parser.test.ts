// Mock AI client — must be before imports
jest.mock('@/lib/ai', () => ({
  generateJSON: jest.fn().mockRejectedValue(new Error('AI unavailable in test')),
}));

import { CommandParser } from '@/modules/voice/services/command-parser';
import type { VoiceCommandDefinition } from '@/modules/voice/types';

describe('CommandParser', () => {
  let parser: CommandParser;

  beforeEach(() => {
    parser = new CommandParser();
  });

  describe('parseCommand', () => {
    it('should parse "Add task review Q4 financials" as ADD_TASK intent', async () => {
      const result = await parser.parseCommand('Add task review Q4 financials');
      expect(result.intent).toBe('ADD_TASK');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.rawTranscript).toBe('Add task review Q4 financials');
    });

    it('should parse "Schedule meeting with Dr. Martinez tomorrow at 3pm" as SCHEDULE_MEETING', async () => {
      const result = await parser.parseCommand(
        'Schedule meeting with Dr. Martinez tomorrow at 3pm',
      );
      expect(result.intent).toBe('SCHEDULE_MEETING');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should parse "Draft email to Bobby about the downtown project" as DRAFT_EMAIL', async () => {
      const result = await parser.parseCommand(
        'Draft email to Bobby about the downtown project',
      );
      expect(result.intent).toBe('DRAFT_EMAIL');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should parse "What\'s next?" as WHATS_NEXT intent', async () => {
      const result = await parser.parseCommand("What's next?");
      expect(result.intent).toBe('WHATS_NEXT');
    });

    it('should parse "Call the nursing facility" as CALL_CONTACT', async () => {
      const result = await parser.parseCommand('Call the nursing facility');
      expect(result.intent).toBe('CALL_CONTACT');
    });

    it('should parse "Set reminder to follow up Friday" as SET_REMINDER', async () => {
      const result = await parser.parseCommand(
        'Set reminder to follow up Friday',
      );
      expect(result.intent).toBe('SET_REMINDER');
    });

    it('should parse "Log expense $45.50 for office supplies" as LOG_EXPENSE', async () => {
      const result = await parser.parseCommand(
        'Log expense $45.50 for office supplies',
      );
      expect(result.intent).toBe('LOG_EXPENSE');
    });

    it('should parse "Search for HIPAA compliance docs" as SEARCH', async () => {
      const result = await parser.parseCommand(
        'Search for HIPAA compliance docs',
      );
      expect(result.intent).toBe('SEARCH');
    });

    it('should parse "Add note check the drainage" as ADD_NOTE', async () => {
      const result = await parser.parseCommand('Add note check the drainage');
      expect(result.intent).toBe('ADD_NOTE');
    });

    it('should parse "Create contact John Smith" as CREATE_CONTACT', async () => {
      const result = await parser.parseCommand('Create contact John Smith');
      expect(result.intent).toBe('CREATE_CONTACT');
    });

    it('should parse "Dictate a memo" as DICTATE', async () => {
      const result = await parser.parseCommand('Dictate a memo to the team');
      expect(result.intent).toBe('DICTATE');
    });

    it('should return UNKNOWN for unrecognizable input', async () => {
      const result = await parser.parseCommand('xyzzy flibbertigibbet');
      expect(result.intent).toBe('UNKNOWN');
      expect(result.confidence).toBeLessThan(0.5);
    });

    it('should extract PERSON entities from transcript', async () => {
      const result = await parser.parseCommand(
        'Schedule meeting with Dr. Martinez tomorrow',
      );
      const people = result.entities.filter((e) => e.type === 'PERSON');
      expect(people.length).toBeGreaterThan(0);
      const martinez = people.find((p) => p.value.includes('Martinez'));
      expect(martinez).toBeDefined();
    });

    it('should extract DATE entities like "tomorrow", "next Monday"', async () => {
      const result = await parser.parseCommand(
        'Set reminder to follow up tomorrow',
      );
      const dates = result.entities.filter((e) => e.type === 'DATE');
      expect(dates.length).toBeGreaterThan(0);
      expect(dates[0].value).toBe('tomorrow');
      expect(dates[0].normalized).toBeDefined();
    });

    it('should extract MONEY entities like "$45.50"', async () => {
      const result = await parser.parseCommand(
        'Log expense $45.50 for office supplies',
      );
      const money = result.entities.filter((e) => e.type === 'MONEY');
      expect(money.length).toBe(1);
      expect(money[0].value).toBe('$45.50');
      expect(money[0].normalized).toBe('45.50');
    });

    it('should extract PRIORITY entities like "high priority", "P0"', async () => {
      const result = await parser.parseCommand(
        'Add task review Q4 financials high priority',
      );
      const priorities = result.entities.filter((e) => e.type === 'PRIORITY');
      expect(priorities.length).toBe(1);
      expect(priorities[0].normalized).toBe('P0');
    });
  });

  describe('registerCommand', () => {
    it('should add a custom command definition', () => {
      const custom: VoiceCommandDefinition = {
        intent: 'ADD_TASK',
        patterns: ['^generate\\s+report\\b'],
        examples: ['Generate report for Q4'],
        handler: 'handleGenerateReport',
        requiresConfirmation: true,
      };

      const beforeCount = parser.getAvailableCommands().length;
      parser.registerCommand(custom);
      expect(parser.getAvailableCommands().length).toBe(beforeCount + 1);
    });

    it('should recognize custom command patterns after registration', async () => {
      const custom: VoiceCommandDefinition = {
        intent: 'SEARCH',
        patterns: ['^lookup\\s+inventory\\b'],
        examples: ['Lookup inventory for warehouse'],
        handler: 'handleLookupInventory',
        requiresConfirmation: false,
      };

      parser.registerCommand(custom);
      const result = await parser.parseCommand('Lookup inventory for warehouse A');
      expect(result.intent).toBe('SEARCH');
    });
  });

  describe('getAvailableCommands', () => {
    it('should return all 11 built-in commands', () => {
      const commands = parser.getAvailableCommands();
      const intents = new Set(commands.map((c) => c.intent));
      expect(intents.size).toBe(11);
      expect(intents).toContain('ADD_TASK');
      expect(intents).toContain('SCHEDULE_MEETING');
      expect(intents).toContain('DRAFT_EMAIL');
      expect(intents).toContain('WHATS_NEXT');
      expect(intents).toContain('ADD_NOTE');
      expect(intents).toContain('CALL_CONTACT');
      expect(intents).toContain('SET_REMINDER');
      expect(intents).toContain('SEARCH');
      expect(intents).toContain('CREATE_CONTACT');
      expect(intents).toContain('LOG_EXPENSE');
      expect(intents).toContain('DICTATE');
    });

    it('should include custom commands after registration', () => {
      const custom: VoiceCommandDefinition = {
        intent: 'ADD_TASK',
        patterns: ['^custom\\b'],
        examples: ['Custom command'],
        handler: 'handleCustom',
        requiresConfirmation: false,
      };

      const beforeCount = parser.getAvailableCommands().length;
      parser.registerCommand(custom);
      expect(parser.getAvailableCommands().length).toBe(beforeCount + 1);
    });
  });

  describe('AI-powered intent parsing', () => {
    const { generateJSON } = jest.requireMock('@/lib/ai') as { generateJSON: jest.Mock };

    beforeEach(() => {
      parser = new CommandParser();
      generateJSON.mockReset();
      generateJSON.mockRejectedValue(new Error('AI unavailable'));
    });

    it('should call generateJSON for intent parsing', async () => {
      generateJSON.mockResolvedValueOnce({
        intent: 'CALL_CONTACT',
        entities: [{ type: 'PERSON', value: 'John', confidence: 0.9 }],
        confidence: 0.9,
        action: 'call John at 3pm',
      });

      const result = await parser.parseCommand('Call John at 3pm');

      expect(generateJSON).toHaveBeenCalled();
      expect(result.intent).toBe('CALL_CONTACT');
    });

    it('should extract entities from AI response', async () => {
      generateJSON.mockResolvedValueOnce({
        intent: 'ADD_TASK',
        entities: [
          { type: 'DATE', value: 'tomorrow', confidence: 0.9 },
          { type: 'PERSON', value: 'Sarah', confidence: 0.85 },
        ],
        confidence: 0.85,
      });

      const result = await parser.parseCommand('Create a task for Sarah by tomorrow');

      const dates = result.entities.filter((e) => e.type === 'DATE');
      expect(dates.length).toBeGreaterThan(0);
    });

    it('should fall back to regex parsing when AI fails', async () => {
      generateJSON.mockRejectedValueOnce(new Error('Network error'));

      const result = await parser.parseCommand('Add task review financials');

      expect(result.intent).toBe('ADD_TASK');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should fall back to regex parsing when AI confidence is low', async () => {
      generateJSON.mockResolvedValueOnce({
        intent: 'UNKNOWN',
        entities: [],
        confidence: 0.3,
      });

      const result = await parser.parseCommand('Add task review financials');

      // Should fall through to regex which matches ADD_TASK
      expect(result.intent).toBe('ADD_TASK');
      expect(result.confidence).toBe(0.85);
    });

    it('should handle "Call John at 3pm" correctly via AI', async () => {
      generateJSON.mockResolvedValueOnce({
        intent: 'CALL_CONTACT',
        entities: [
          { type: 'PERSON', value: 'John', confidence: 0.9 },
          { type: 'TIME', value: '3pm', confidence: 0.9 },
        ],
        confidence: 0.92,
      });

      const result = await parser.parseCommand('Call John at 3pm');

      expect(result.intent).toBe('CALL_CONTACT');
      expect(result.entities.some((e) => e.type === 'PERSON')).toBe(true);
    });

    it('should handle "Create a task for tomorrow" correctly via AI', async () => {
      generateJSON.mockResolvedValueOnce({
        intent: 'ADD_TASK',
        entities: [{ type: 'DATE', value: 'tomorrow', confidence: 0.9 }],
        confidence: 0.88,
      });

      const result = await parser.parseCommand('Create a task for tomorrow');

      expect(result.intent).toBe('ADD_TASK');
      expect(result.entities.some((e) => e.type === 'DATE')).toBe(true);
    });
  });
});
