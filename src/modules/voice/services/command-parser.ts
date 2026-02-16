// ============================================================================
// Voice Command Parser
// Parses natural language transcripts into structured commands with intents
// and extracted entities (PERSON, DATE, TIME, MONEY, PRIORITY, etc.).
// ============================================================================

import type {
  ParsedVoiceCommand,
  VoiceIntent,
  VoiceCommandDefinition,
  ExtractedEntity,
} from '@/modules/voice/types';
import { generateJSON } from '@/lib/ai';

// ---------------------------------------------------------------------------
// Entity extraction patterns
// ---------------------------------------------------------------------------

const MONEY_PATTERN = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g;
const PRIORITY_PATTERN = /\b(p0|p1|p2|high\s*priority|low\s*priority|urgent|critical)\b/gi;
const TIME_PATTERN = /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/gi;
const DURATION_PATTERN = /\b(\d+)\s*(minutes?|mins?|hours?|hrs?|days?|weeks?)\b/gi;

const DATE_KEYWORDS: Record<string, (now: Date) => string> = {
  today: (now) => formatDate(now),
  tonight: (now) => formatDate(now),
  tomorrow: (now) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  },
  yesterday: (now) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return formatDate(d);
  },
};

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getNextWeekday(dayName: string, now: Date): string {
  const targetDay = DAY_NAMES.indexOf(dayName.toLowerCase());
  if (targetDay === -1) return formatDate(now);
  const currentDay = now.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const result = new Date(now);
  result.setDate(result.getDate() + daysUntil);
  return formatDate(result);
}

// ---------------------------------------------------------------------------
// Entity extraction
// ---------------------------------------------------------------------------

function extractEntities(transcript: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const lower = transcript.toLowerCase();
  const now = new Date();

  // Money entities
  let moneyMatch: RegExpExecArray | null;
  const moneyRe = new RegExp(MONEY_PATTERN.source, MONEY_PATTERN.flags);
  while ((moneyMatch = moneyRe.exec(transcript)) !== null) {
    entities.push({
      type: 'MONEY',
      value: moneyMatch[0],
      normalized: moneyMatch[1].replace(/,/g, ''),
      confidence: 0.95,
    });
  }

  // Priority entities
  let priorityMatch: RegExpExecArray | null;
  const priorityRe = new RegExp(PRIORITY_PATTERN.source, PRIORITY_PATTERN.flags);
  while ((priorityMatch = priorityRe.exec(transcript)) !== null) {
    const raw = priorityMatch[1].toLowerCase();
    let normalized = 'P1';
    if (raw === 'p0' || raw === 'urgent' || raw === 'critical' || raw === 'high priority') {
      normalized = 'P0';
    } else if (raw === 'p2' || raw === 'low priority') {
      normalized = 'P2';
    } else if (raw === 'p1') {
      normalized = 'P1';
    }
    entities.push({
      type: 'PRIORITY',
      value: priorityMatch[0],
      normalized,
      confidence: 0.9,
    });
  }

  // Date entities — keyword-based
  for (const [keyword, resolver] of Object.entries(DATE_KEYWORDS)) {
    if (lower.includes(keyword)) {
      entities.push({
        type: 'DATE',
        value: keyword,
        normalized: resolver(now),
        confidence: 0.9,
      });
    }
  }

  // Date entities — "next [day]"
  const nextDayMatch = lower.match(/next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (nextDayMatch) {
    entities.push({
      type: 'DATE',
      value: `next ${nextDayMatch[1]}`,
      normalized: getNextWeekday(nextDayMatch[1], now),
      confidence: 0.85,
    });
  }

  // Day names without "next"
  for (const day of DAY_NAMES) {
    const dayPattern = new RegExp(`\\b${day}\\b`, 'i');
    if (dayPattern.test(lower) && !lower.includes(`next ${day}`)) {
      const alreadyHasDay = entities.some(
        (e) => e.type === 'DATE' && e.value.includes(day),
      );
      if (!alreadyHasDay) {
        entities.push({
          type: 'DATE',
          value: day,
          normalized: getNextWeekday(day, now),
          confidence: 0.75,
        });
      }
    }
  }

  // Time entities
  let timeMatch: RegExpExecArray | null;
  const timeRe = new RegExp(TIME_PATTERN.source, TIME_PATTERN.flags);
  while ((timeMatch = timeRe.exec(transcript)) !== null) {
    entities.push({
      type: 'TIME',
      value: timeMatch[0],
      confidence: 0.85,
    });
  }

  // Duration entities
  let durationMatch: RegExpExecArray | null;
  const durationRe = new RegExp(DURATION_PATTERN.source, DURATION_PATTERN.flags);
  while ((durationMatch = durationRe.exec(transcript)) !== null) {
    entities.push({
      type: 'DURATION',
      value: durationMatch[0],
      confidence: 0.85,
    });
  }

  // Person entities — "with [Name]", "to [Name]", "call [Name]"
  // First: match "Dr. Name" patterns (must come first to avoid partial matches)
  const drPattern = /(?:with|to|from|call|contact|email|message)\s+(?:Dr\.?\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const drRe = new RegExp(drPattern.source, drPattern.flags);
  let drMatch: RegExpExecArray | null;
  const drMatchedRanges: Array<[number, number]> = [];
  while ((drMatch = drRe.exec(transcript)) !== null) {
    const name = `Dr. ${drMatch[1]}`;
    drMatchedRanges.push([drMatch.index, drMatch.index + drMatch[0].length]);
    entities.push({
      type: 'PERSON',
      value: name,
      confidence: 0.75,
    });
  }

  // Then: match plain "Name" patterns, skipping ranges already matched
  const plainPattern = /(?:with|to|from|call|contact|email|message)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g;
  const plainRe = new RegExp(plainPattern.source, plainPattern.flags);
  let personMatch: RegExpExecArray | null;
  while ((personMatch = plainRe.exec(transcript)) !== null) {
    const matchStart = personMatch.index;
    const matchEnd = matchStart + personMatch[0].length;
    // Skip if this overlaps with a Dr. match
    const overlaps = drMatchedRanges.some(
      ([s, e]) => matchStart >= s && matchStart < e,
    );
    if (overlaps) continue;

    const name = personMatch[1];
    const skipWords = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    if (!skipWords.has(name)) {
      entities.push({
        type: 'PERSON',
        value: name,
        confidence: 0.7,
      });
    }
  }

  return entities;
}

// --- AI-Powered Intent Parsing ---

async function parseIntentWithAI(
  transcript: string
): Promise<{
  intent: VoiceIntent;
  entities: ExtractedEntity[];
  confidence: number;
  action?: string;
}> {
  return generateJSON<{
    intent: VoiceIntent;
    entities: ExtractedEntity[];
    confidence: number;
    action?: string;
  }>(`Parse this voice command transcript into a structured command.

Transcript: "${transcript}"

Return JSON with:
- intent: the user's intent (one of: ADD_TASK, SCHEDULE_MEETING, DRAFT_EMAIL, WHATS_NEXT, ADD_NOTE, CALL_CONTACT, SET_REMINDER, SEARCH, CREATE_CONTACT, LOG_EXPENSE, DICTATE, UNKNOWN)
- entities: array of extracted entities, each with {type, value, confidence} where type is one of: PERSON, DATE, TIME, DURATION, MONEY, PRIORITY, PROJECT, LOCATION, PHONE_NUMBER, EMAIL, STATUS
- confidence: 0.0-1.0
- action: specific action string if identifiable (e.g., "call John at 3pm")`, {
    maxTokens: 512,
    temperature: 0.2,
    system: 'You are a voice command interpreter. Parse spoken language into structured commands. Be precise with entity extraction.',
  });
}

// ---------------------------------------------------------------------------
// Command Parser
// ---------------------------------------------------------------------------

class CommandParser {
  private commands: VoiceCommandDefinition[] = [];

  constructor() {
    this.registerBuiltInCommands();
  }

  private registerBuiltInCommands(): void {
    const builtIns: VoiceCommandDefinition[] = [
      {
        intent: 'ADD_TASK',
        patterns: [
          '^add\\s+task\\b',
          '^create\\s+task\\b',
          '^new\\s+task\\b',
          '^todo\\b',
          '^remind\\s+me\\s+to\\b',
          '^i\\s+need\\s+to\\b',
        ],
        examples: [
          'Add task review Q4 financials',
          'Create task send proposal to client by Friday',
          'Todo update the website homepage',
          'I need to follow up with Dr. Martinez',
        ],
        handler: 'handleAddTask',
        requiresConfirmation: false,
      },
      {
        intent: 'SCHEDULE_MEETING',
        patterns: [
          '^schedule\\s+(a\\s+)?meeting\\b',
          '^set\\s+up\\s+(a\\s+)?meeting\\b',
          '^book\\s+(a\\s+)?meeting\\b',
          '^arrange\\s+(a\\s+)?meeting\\b',
        ],
        examples: [
          'Schedule meeting with Dr. Martinez tomorrow at 3pm',
          'Set up a meeting with Bobby on Friday at 10am',
          'Book a meeting with the team next Monday',
        ],
        handler: 'handleScheduleMeeting',
        requiresConfirmation: true,
      },
      {
        intent: 'DRAFT_EMAIL',
        patterns: [
          '^draft\\s+(an?\\s+)?email\\b',
          '^write\\s+(an?\\s+)?email\\b',
          '^compose\\s+(an?\\s+)?email\\b',
          '^send\\s+(an?\\s+)?email\\b',
          '^email\\b',
        ],
        examples: [
          'Draft email to Bobby about the downtown project',
          'Write an email to the team about the quarterly review',
          'Email Dr. Martinez regarding the test results',
        ],
        handler: 'handleDraftEmail',
        requiresConfirmation: true,
      },
      {
        intent: 'WHATS_NEXT',
        patterns: [
          "^what'?s\\s+next",
          '^what\\s+should\\s+i\\s+work\\s+on',
          '^what\\s+do\\s+i\\s+have',
          '^show\\s+(my\\s+)?agenda',
          "^what'?s\\s+on\\s+(my\\s+)?schedule",
          '^my\\s+tasks',
        ],
        examples: [
          "What's next?",
          'What should I work on?',
          'Show my agenda',
          "What's on my schedule today?",
        ],
        handler: 'handleWhatsNext',
        requiresConfirmation: false,
      },
      {
        intent: 'ADD_NOTE',
        patterns: [
          '^add\\s+(a\\s+)?note\\b',
          '^note\\s+to\\s+self\\b',
          '^take\\s+(a\\s+)?note\\b',
          '^make\\s+(a\\s+)?note\\b',
          '^jot\\s+down\\b',
        ],
        examples: [
          'Add note review the compliance checklist before the audit',
          'Note to self check the parking lot drainage issue',
          'Take a note about the new vendor pricing',
        ],
        handler: 'handleAddNote',
        requiresConfirmation: false,
      },
      {
        intent: 'CALL_CONTACT',
        patterns: [
          '^call\\b',
          '^dial\\b',
          '^phone\\b',
          '^ring\\b',
        ],
        examples: [
          'Call the nursing facility',
          'Call Dr. Martinez',
          'Phone Bobby about the downtown project',
        ],
        handler: 'handleCallContact',
        requiresConfirmation: true,
      },
      {
        intent: 'SET_REMINDER',
        patterns: [
          '^set\\s+(a\\s+)?reminder\\b',
          '^remind\\s+me\\b',
          '^alert\\s+me\\b',
        ],
        examples: [
          'Set reminder to follow up Friday',
          'Remind me to call the plumber tomorrow at 9am',
          'Set a reminder about the board meeting next Monday',
        ],
        handler: 'handleSetReminder',
        requiresConfirmation: false,
      },
      {
        intent: 'SEARCH',
        patterns: [
          '^search\\s+for\\b',
          '^search\\b',
          '^find\\b',
          '^look\\s+up\\b',
          '^look\\s+for\\b',
        ],
        examples: [
          'Search for HIPAA compliance docs',
          'Find the latest invoice from Acme Corp',
          'Look up Bobby\'s contact info',
        ],
        handler: 'handleSearch',
        requiresConfirmation: false,
      },
      {
        intent: 'CREATE_CONTACT',
        patterns: [
          '^create\\s+(a\\s+)?contact\\b',
          '^add\\s+(a\\s+)?contact\\b',
          '^new\\s+contact\\b',
          '^save\\s+contact\\b',
        ],
        examples: [
          'Create contact John Smith',
          'Add a contact for the new vendor',
          'New contact Dr. Sarah Johnson',
        ],
        handler: 'handleCreateContact',
        requiresConfirmation: true,
      },
      {
        intent: 'LOG_EXPENSE',
        patterns: [
          '^log\\s+(an?\\s+)?expense\\b',
          '^add\\s+(an?\\s+)?expense\\b',
          '^record\\s+(an?\\s+)?expense\\b',
          '^expense\\b',
        ],
        examples: [
          'Log expense $45.50 for office supplies',
          'Add expense $120 for client lunch',
          'Record expense $89.99 for software subscription',
        ],
        handler: 'handleLogExpense',
        requiresConfirmation: false,
      },
      {
        intent: 'DICTATE',
        patterns: [
          '^dictate\\b',
          '^start\\s+dictation\\b',
          '^transcribe\\b',
        ],
        examples: [
          'Dictate a memo to the team',
          'Start dictation for the meeting notes',
          'Transcribe my thoughts on the project',
        ],
        handler: 'handleDictate',
        requiresConfirmation: false,
      },
    ];

    for (const cmd of builtIns) {
      this.commands.push(cmd);
    }
  }

  async parseCommand(transcript: string): Promise<ParsedVoiceCommand> {
    const normalizedText = transcript.trim().replace(/\s+/g, ' ');
    const lower = normalizedText.toLowerCase();

    // Try AI parsing first
    try {
      const aiResult = await parseIntentWithAI(normalizedText);
      if (aiResult && aiResult.confidence >= 0.5) {
        // Merge AI entities with regex entities, preferring AI on conflict
        const regexEntities = extractEntities(transcript);
        const mergedEntities = this.mergeEntities(aiResult.entities ?? [], regexEntities);

        return {
          intent: aiResult.intent,
          confidence: aiResult.confidence,
          entities: mergedEntities,
          rawTranscript: transcript,
          normalizedText,
        };
      }
    } catch {
      // AI parsing failed — fall through to regex-based parsing
    }

    // Regex-based fallback: Try each registered command's patterns
    for (const command of this.commands) {
      for (const pattern of command.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(lower)) {
          const entities = extractEntities(transcript);
          return {
            intent: command.intent,
            confidence: 0.85,
            entities,
            rawTranscript: transcript,
            normalizedText,
          };
        }
      }
    }

    // Fallback: keyword-based matching
    const keywordResult = this.keywordFallback(lower, transcript);
    if (keywordResult) {
      return keywordResult;
    }

    // Unknown intent
    return {
      intent: 'UNKNOWN',
      confidence: 0.1,
      entities: extractEntities(transcript),
      rawTranscript: transcript,
      normalizedText,
    };
  }

  private keywordFallback(
    lower: string,
    original: string,
  ): ParsedVoiceCommand | null {
    const keywordMap: Array<{ keywords: string[]; intent: VoiceIntent }> = [
      { keywords: ['task', 'todo', 'to-do'], intent: 'ADD_TASK' },
      { keywords: ['meeting', 'schedule', 'calendar', 'appointment'], intent: 'SCHEDULE_MEETING' },
      { keywords: ['email', 'mail', 'message'], intent: 'DRAFT_EMAIL' },
      { keywords: ['note', 'jot'], intent: 'ADD_NOTE' },
      { keywords: ['call', 'phone', 'dial'], intent: 'CALL_CONTACT' },
      { keywords: ['reminder', 'remind'], intent: 'SET_REMINDER' },
      { keywords: ['expense', 'cost', 'receipt'], intent: 'LOG_EXPENSE' },
      { keywords: ['search', 'find', 'look up'], intent: 'SEARCH' },
      { keywords: ['contact', 'person'], intent: 'CREATE_CONTACT' },
    ];

    for (const { keywords, intent } of keywordMap) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return {
          intent,
          confidence: 0.5,
          entities: extractEntities(original),
          rawTranscript: original,
          normalizedText: original.trim().replace(/\s+/g, ' '),
        };
      }
    }

    return null;
  }

  private mergeEntities(
    aiEntities: ExtractedEntity[],
    regexEntities: ExtractedEntity[],
  ): ExtractedEntity[] {
    const merged = new Map<string, ExtractedEntity>();

    // Add regex entities first
    for (const entity of regexEntities) {
      const key = `${entity.type}:${entity.value}`;
      merged.set(key, entity);
    }

    // Override with AI entities (AI takes precedence), drop low-confidence ones
    for (const entity of aiEntities) {
      if (entity.confidence < 0.3) continue; // Drop low-confidence AI entities
      const key = `${entity.type}:${entity.value}`;
      merged.set(key, entity);
    }

    return Array.from(merged.values());
  }

  registerCommand(definition: VoiceCommandDefinition): void {
    this.commands.push(definition);
  }

  getAvailableCommands(): VoiceCommandDefinition[] {
    return [...this.commands];
  }
}

export const commandParser = new CommandParser();
export { CommandParser, extractEntities };
