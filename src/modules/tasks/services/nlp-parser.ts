import {
  addDays,
  addWeeks,
  nextMonday,
  nextTuesday,
  nextWednesday,
  nextThursday,
  nextFriday,
  nextSaturday,
  nextSunday,
  endOfWeek,
  parse,
  isValid,
  startOfTomorrow,
} from 'date-fns';
import { prisma } from '@/lib/db';
import type { ParsedTaskInput, NLPEntity } from '../types';

// --- Entity Extraction Patterns ---

const PRIORITY_PATTERNS: Array<{ pattern: RegExp; normalized: 'P0' | 'P1' | 'P2' }> = [
  { pattern: /\b(?:P0|critical|urgent)\b/i, normalized: 'P0' },
  { pattern: /\bhigh\s*priority\b/i, normalized: 'P0' },
  { pattern: /\b(?:P1|important|medium\s*priority)\b/i, normalized: 'P1' },
  { pattern: /\b(?:P2|low\s*priority|minor)\b/i, normalized: 'P2' },
];

const DATE_PATTERNS: Array<{ pattern: RegExp; resolver: (match: RegExpMatchArray) => Date | null }> = [
  {
    pattern: /\btomorrow\b/i,
    resolver: () => startOfTomorrow(),
  },
  {
    pattern: /\btoday\b/i,
    resolver: () => new Date(),
  },
  {
    pattern: /\bnext\s+monday\b/i,
    resolver: () => nextMonday(new Date()),
  },
  {
    pattern: /\bnext\s+tuesday\b/i,
    resolver: () => nextTuesday(new Date()),
  },
  {
    pattern: /\bnext\s+wednesday\b/i,
    resolver: () => nextWednesday(new Date()),
  },
  {
    pattern: /\bnext\s+thursday\b/i,
    resolver: () => nextThursday(new Date()),
  },
  {
    pattern: /\bnext\s+friday\b/i,
    resolver: () => nextFriday(new Date()),
  },
  {
    pattern: /\bnext\s+saturday\b/i,
    resolver: () => nextSaturday(new Date()),
  },
  {
    pattern: /\bnext\s+sunday\b/i,
    resolver: () => nextSunday(new Date()),
  },
  {
    pattern: /\bby\s+monday\b/i,
    resolver: () => nextMonday(new Date()),
  },
  {
    pattern: /\bby\s+tuesday\b/i,
    resolver: () => nextTuesday(new Date()),
  },
  {
    pattern: /\bby\s+wednesday\b/i,
    resolver: () => nextWednesday(new Date()),
  },
  {
    pattern: /\bby\s+thursday\b/i,
    resolver: () => nextThursday(new Date()),
  },
  {
    pattern: /\bby\s+friday\b/i,
    resolver: () => nextFriday(new Date()),
  },
  {
    pattern: /\bby\s+saturday\b/i,
    resolver: () => nextSaturday(new Date()),
  },
  {
    pattern: /\bby\s+sunday\b/i,
    resolver: () => nextSunday(new Date()),
  },
  {
    pattern: /\bend\s+of\s+week\b/i,
    resolver: () => endOfWeek(new Date(), { weekStartsOn: 1 }),
  },
  {
    pattern: /\bin\s+(\d+)\s+days?\b/i,
    resolver: (match) => addDays(new Date(), parseInt(match[1], 10)),
  },
  {
    pattern: /\bin\s+(\d+)\s+weeks?\b/i,
    resolver: (match) => addWeeks(new Date(), parseInt(match[1], 10)),
  },
  {
    pattern: /\b(?:due\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/,
    resolver: (match) => {
      const month = parseInt(match[1], 10);
      const day = parseInt(match[2], 10);
      const year = match[3]
        ? parseInt(match[3], 10) < 100
          ? 2000 + parseInt(match[3], 10)
          : parseInt(match[3], 10)
        : new Date().getFullYear();
      const date = new Date(year, month - 1, day);
      return isValid(date) ? date : null;
    },
  },
  {
    pattern: /\b(?:by\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/i,
    resolver: (match) => {
      const dateStr = match[3]
        ? `${match[1]} ${match[2]}, ${match[3]}`
        : `${match[1]} ${match[2]}, ${new Date().getFullYear()}`;
      const date = parse(dateStr, 'MMMM d, yyyy', new Date());
      return isValid(date) ? date : null;
    },
  },
];

const PERSON_PATTERNS = [
  /\b(?:for|assign\s+to|assigned\s+to|with)\s+(?:Dr\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
  /\b(?:to)\s+(?:Dr\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/,
];

const PROJECT_PATTERNS = [
  /\b(?:for\s+the|in|under|for)\s+(?:the\s+)?([A-Z][A-Za-z\s]+?)(?:\s+project)?\b/,
];

const TAG_PATTERN = /#(\w+)/g;
const TAG_LABEL_PATTERN = /\btag:\s*(\w+)/gi;

const ACTION_VERBS = [
  'review', 'call', 'email', 'schedule', 'submit', 'follow up',
  'draft', 'prepare', 'send', 'update', 'create', 'fix', 'check',
  'approve', 'finalize', 'complete', 'analyze', 'investigate',
];

export function extractEntities(text: string): NLPEntity[] {
  const entities: NLPEntity[] = [];

  // Extract dates
  for (const { pattern, resolver } of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const date = resolver(match);
      if (date && isValid(date)) {
        entities.push({
          type: 'DATE',
          value: match[0],
          normalized: date.toISOString(),
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        break; // take first date match
      }
    }
  }

  // Extract priorities
  for (const { pattern, normalized } of PRIORITY_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      entities.push({
        type: 'PRIORITY',
        value: match[0],
        normalized,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
      break;
    }
  }

  // Extract people
  for (const pattern of PERSON_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && match[1]) {
      // Skip if it matches a project keyword or common word
      const name = match[1].trim();
      if (!isCommonWord(name)) {
        entities.push({
          type: 'PERSON',
          value: match[0],
          normalized: name,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        break;
      }
    }
  }

  // Extract projects
  for (const pattern of PROJECT_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined && match[1]) {
      const projectName = match[1].trim();
      if (projectName.length > 2 && !isCommonWord(projectName)) {
        entities.push({
          type: 'PROJECT',
          value: match[0],
          normalized: projectName,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
        break;
      }
    }
  }

  // Extract tags
  let tagMatch: RegExpExecArray | null;
  const tagRegex = new RegExp(TAG_PATTERN.source, 'g');
  while ((tagMatch = tagRegex.exec(text)) !== null) {
    entities.push({
      type: 'TAG',
      value: tagMatch[0],
      normalized: tagMatch[1].toLowerCase(),
      startIndex: tagMatch.index,
      endIndex: tagMatch.index + tagMatch[0].length,
    });
  }

  const labelRegex = new RegExp(TAG_LABEL_PATTERN.source, 'gi');
  while ((tagMatch = labelRegex.exec(text)) !== null) {
    entities.push({
      type: 'TAG',
      value: tagMatch[0],
      normalized: tagMatch[1].toLowerCase(),
      startIndex: tagMatch.index,
      endIndex: tagMatch.index + tagMatch[0].length,
    });
  }

  // Extract action verbs
  for (const verb of ACTION_VERBS) {
    const pattern = new RegExp(`\\b${verb}\\b`, 'i');
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      entities.push({
        type: 'ACTION_VERB',
        value: match[0],
        normalized: verb.toLowerCase(),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
      break; // take first action verb
    }
  }

  return entities;
}

export async function parseTaskFromText(input: string): Promise<ParsedTaskInput> {
  const entities = extractEntities(input);

  const dateEntity = entities.find((e) => e.type === 'DATE');
  const priorityEntity = entities.find((e) => e.type === 'PRIORITY');
  const personEntity = entities.find((e) => e.type === 'PERSON');
  const projectEntity = entities.find((e) => e.type === 'PROJECT');
  const tagEntities = entities.filter((e) => e.type === 'TAG');

  // Build title: strip out recognized entities
  let title = input;
  const sortedEntities = [...entities]
    .filter((e) => e.type !== 'ACTION_VERB')
    .sort((a, b) => b.startIndex - a.startIndex); // reverse order for safe removal

  for (const entity of sortedEntities) {
    title = title.slice(0, entity.startIndex) + title.slice(entity.endIndex);
  }

  // Clean up title
  title = title.replace(/\s{2,}/g, ' ').replace(/^\s+|\s+$/g, '').replace(/^[\s,.-]+|[\s,.-]+$/g, '');

  // If title is empty, use the original input
  if (!title) {
    title = input;
  }

  // Calculate confidence based on entities found
  const extractedCount = entities.length;
  const confidence = Math.min(1, 0.3 + extractedCount * 0.15);

  return {
    title,
    priority: priorityEntity?.normalized as 'P0' | 'P1' | 'P2' | undefined,
    dueDate: dateEntity ? new Date(dateEntity.normalized) : undefined,
    projectName: projectEntity?.normalized,
    assigneeName: personEntity?.normalized,
    tags: tagEntities.length > 0 ? tagEntities.map((e) => e.normalized) : undefined,
    confidence,
    rawInput: input,
  };
}

export async function resolveEntityReferences(
  parsed: ParsedTaskInput,
  entityId: string
): Promise<{ projectId?: string; assigneeId?: string; entityId: string }> {
  const result: { projectId?: string; assigneeId?: string; entityId: string } = { entityId };

  if (parsed.projectName) {
    const project = await prisma.project.findFirst({
      where: {
        entityId,
        name: { contains: parsed.projectName, mode: 'insensitive' },
      },
    });
    if (project) {
      result.projectId = project.id;
    }
  }

  if (parsed.assigneeName) {
    const user = await prisma.user.findFirst({
      where: {
        name: { contains: parsed.assigneeName, mode: 'insensitive' },
      },
    });
    if (user) {
      result.assigneeId = user.id;
    }
  }

  return result;
}

export async function parseMultipleTasks(input: string): Promise<ParsedTaskInput[]> {
  // Split by numbered list (1. 2. 3.)
  const numberedListPattern = /^\s*\d+[\.\)]\s+/m;
  if (numberedListPattern.test(input)) {
    const lines = input.split(/\n/).filter((l) => l.trim());
    const tasks: ParsedTaskInput[] = [];
    for (const line of lines) {
      const cleaned = line.replace(/^\s*\d+[\.\)]\s+/, '').trim();
      if (cleaned) {
        tasks.push(await parseTaskFromText(cleaned));
      }
    }
    return tasks;
  }

  // Split by newlines
  const lines = input.split(/\n/).filter((l) => l.trim());
  if (lines.length > 1) {
    const tasks: ParsedTaskInput[] = [];
    for (const line of lines) {
      const cleaned = line.trim();
      if (cleaned) {
        tasks.push(await parseTaskFromText(cleaned));
      }
    }
    return tasks;
  }

  // Split by "and" conjunction (only for simple conjunctions)
  const andParts = input.split(/\band\b/i).filter((p) => p.trim());
  if (andParts.length > 1) {
    const tasks: ParsedTaskInput[] = [];
    for (const part of andParts) {
      const cleaned = part.trim();
      if (cleaned) {
        tasks.push(await parseTaskFromText(cleaned));
      }
    }
    return tasks;
  }

  // Single task
  return [await parseTaskFromText(input)];
}

// --- Helpers ---

function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'about', 'this', 'that',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december',
    'today', 'tomorrow', 'week', 'month', 'end',
  ]);
  return commonWords.has(word.toLowerCase());
}
