import type { PromptInjectionResult, ThreatLevel } from './types';

interface InjectionPattern {
  name: string;
  pattern: RegExp;
  severity: ThreatLevel;
}

const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    name: 'role_override',
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: 'HIGH',
  },
  {
    name: 'role_override_alt',
    pattern: /you\s+are\s+now\s+(a|an|the)\s+/i,
    severity: 'HIGH',
  },
  {
    name: 'instruction_override',
    pattern: /disregard\s+(all\s+)?(above|prior|previous)/i,
    severity: 'HIGH',
  },
  {
    name: 'instruction_override_alt',
    pattern: /override\s+(system|safety|security)\s+(prompt|instructions|rules)/i,
    severity: 'CRITICAL',
  },
  {
    name: 'base64_payload',
    pattern: /[A-Za-z0-9+/]{40,}={0,2}/,
    severity: 'MEDIUM',
  },
  {
    name: 'unicode_escape',
    pattern: /\\u[0-9a-fA-F]{4}(\\u[0-9a-fA-F]{4}){3,}/,
    severity: 'MEDIUM',
  },
  {
    name: 'system_prompt_leak',
    pattern: /(show|reveal|print|output|repeat)\s+(your|the|system)\s+(system\s+)?(prompt|instructions|rules)/i,
    severity: 'HIGH',
  },
  {
    name: 'system_prompt_leak_alt',
    pattern: /what\s+(are|is)\s+your\s+(system\s+)?(prompt|instructions|rules)/i,
    severity: 'MEDIUM',
  },
  {
    name: 'jailbreak_template',
    pattern: /(DAN|do\s+anything\s+now|developer\s+mode|god\s+mode|sudo\s+mode)/i,
    severity: 'CRITICAL',
  },
  {
    name: 'jailbreak_roleplay',
    pattern: /pretend\s+(you('re|\s+are)\s+)?(an?\s+)?(unrestricted|unfiltered|uncensored)/i,
    severity: 'HIGH',
  },
  {
    name: 'delimiter_injection',
    pattern: /```\s*(system|assistant|user)\s*\n/i,
    severity: 'HIGH',
  },
  {
    name: 'delimiter_injection_dashes',
    pattern: /---\s*(BEGIN|END)\s+(SYSTEM|INSTRUCTIONS)/i,
    severity: 'HIGH',
  },
];

const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

const SEVERITY_RANK: Record<ThreatLevel, number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

function maxThreatLevel(levels: ThreatLevel[]): ThreatLevel {
  if (levels.length === 0) return 'NONE';
  return levels.reduce((max, level) =>
    SEVERITY_RANK[level] > SEVERITY_RANK[max] ? level : max
  );
}

export function scanForInjection(input: string): PromptInjectionResult {
  const detectedPatterns: string[] = [];
  const severities: ThreatLevel[] = [];

  for (const { name, pattern, severity } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      detectedPatterns.push(name);
      severities.push(severity);
    }
  }

  const threatLevel = maxThreatLevel(severities);
  const isSafe = threatLevel === 'NONE';

  return {
    isSafe,
    threatLevel,
    detectedPatterns,
    sanitizedInput: isSafe ? undefined : sanitizeInput(input),
    explanation: isSafe
      ? 'No injection patterns detected.'
      : `Detected ${detectedPatterns.length} injection pattern(s): ${detectedPatterns.join(', ')}. Threat level: ${threatLevel}.`,
  };
}

export function sanitizeInput(input: string): string {
  let sanitized = input;

  // Strip control characters
  sanitized = sanitized.replace(CONTROL_CHAR_REGEX, '');

  // Normalize unicode escapes to their literal representation
  sanitized = sanitized.replace(/\\u[0-9a-fA-F]{4}/g, '');

  // Escape triple backtick delimiters
  sanitized = sanitized.replace(/```/g, '\\`\\`\\`');

  // Escape instruction-style dashes
  sanitized = sanitized.replace(/---\s*(BEGIN|END)\s+(SYSTEM|INSTRUCTIONS)/gi, '[REDACTED_DELIMITER]');

  // Remove known jailbreak keywords
  sanitized = sanitized.replace(/(DAN|do\s+anything\s+now|developer\s+mode|god\s+mode|sudo\s+mode)/gi, '[REDACTED]');

  // Remove instruction overrides
  sanitized = sanitized.replace(/ignore\s+(all\s+)?previous\s+instructions/gi, '[REDACTED]');
  sanitized = sanitized.replace(/disregard\s+(all\s+)?(above|prior|previous)/gi, '[REDACTED]');

  return sanitized.trim();
}

export function isAllowedAction(action: string, allowList: string[]): boolean {
  return allowList.includes(action);
}
