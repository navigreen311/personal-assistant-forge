// ============================================================================
// Shadow Voice Agent — Fraud Detector
// Anti-social-engineering detection layer.
// CANNOT be overridden even with a valid PIN.
// All patterns are evaluated before any action proceeds.
// ============================================================================

export type FraudSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type FraudPattern =
  | 'WIRE_TRANSFER_NEW_ACCOUNT'
  | 'VENDOR_BANK_CHANGE'
  | 'CREDENTIAL_LEAK'
  | 'URGENCY_BYPASS'
  | 'NO_LOG_REQUEST'
  | 'PROMPT_INJECTION';

export interface FraudCheckResult {
  isFraudulent: boolean;
  pattern: FraudPattern | null;
  severity: FraudSeverity;
  message: string;
}

export interface FraudDetectorParams {
  /** The raw user input or message content */
  input: string;
  /** The resolved action type, if any */
  actionType?: string;
  /** Additional context about the request */
  context?: {
    /** Whether a new/unknown recipient is involved */
    isNewRecipient?: boolean;
    /** Whether the request involves financial data */
    isFinancial?: boolean;
    /** The channel the request came from */
    channel?: string;
    /** Additional metadata */
    metadata?: Record<string, unknown>;
  };
}

// ---------------------------------------------------------------------------
// Pattern definitions — regex + keyword matching
// ---------------------------------------------------------------------------

interface PatternDefinition {
  pattern: FraudPattern;
  severity: FraudSeverity;
  message: string;
  check: (params: FraudDetectorParams) => boolean;
}

/**
 * Regex patterns for prompt injection detection.
 * These catch common social engineering attempts to override the AI.
 */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\bSYSTEM\s*:/i,
  /\bignore\s+(all\s+)?previous\s+instructions?\b/i,
  /\byou\s+are\s+now\b/i,
  /\bforget\s+(all\s+)?(your\s+)?instructions?\b/i,
  /\boverride\s+(all\s+)?(safety|security|rules|instructions?)\b/i,
  /\bdisregard\s+(all\s+)?(previous|above|prior|earlier)\b/i,
  /\bact\s+as\s+(if|though)\s+you\b/i,
  /\bpretend\s+(you\s+are|to\s+be)\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bdo\s+not\s+follow\s+(your\s+)?(original|initial)\b/i,
  /\bjailbreak\b/i,
  /\bDAN\s+mode\b/i,
  /\bdev(eloper)?\s+mode\b/i,
  /\badmin\s+override\b/i,
];

/**
 * Keywords and patterns for wire transfer / money transfer to new accounts.
 */
const WIRE_TRANSFER_PATTERNS: RegExp[] = [
  /\bwire\s+(money|funds|transfer|payment)\b/i,
  /\btransfer\s+(money|funds)\s+to\s+(a\s+)?new\b/i,
  /\bsend\s+(money|funds|payment)\s+to\s+(a\s+)?new\s+(account|recipient)\b/i,
  /\bnew\s+(bank\s+)?account\s+(number|details|info)\b/i,
  /\bchange\s+(the\s+)?wire\s+(destination|recipient)\b/i,
  /\bwire\s+to\s+this\s+(new\s+)?account\b/i,
];

/**
 * Keywords for vendor bank account changes (BEC attack pattern).
 */
const VENDOR_BANK_CHANGE_PATTERNS: RegExp[] = [
  /\bchange\s+(the\s+)?(vendor|supplier|payee)\s*(bank\s*)?(account|details|routing|info)\b/i,
  /\bupdate\s+(the\s+)?(vendor|supplier|payee)\s*(bank\s*)?(account|details|routing|info)\b/i,
  /\b(vendor|supplier|payee)\s+(has\s+)?(changed|updated)\s+(their\s+)?(bank|account|routing)\b/i,
  /\bnew\s+(bank\s+)?(details|account|routing)\s+for\s+(the\s+)?(vendor|supplier|payee)\b/i,
];

/**
 * Keywords for credential/secret leakage attempts.
 */
const CREDENTIAL_LEAK_PATTERNS: RegExp[] = [
  /\bsend\s+(me\s+)?(the\s+)?(password|credentials?|api\s*keys?|secrets?|tokens?)\b/i,
  /\bshare\s+(the\s+)?(password|credentials?|api\s*keys?|secrets?|tokens?)\b/i,
  /\b(password|credentials?|api\s*keys?|secrets?|tokens?)\s+(to|via|over|by)\s+(email|text|sms|slack|message)\b/i,
  /\b(email|text|sms|send|share)\s+(me\s+)?(my\s+)?(password|credentials?|api\s*keys?|secrets?|tokens?)\b/i,
  /\bread\s+out\s+(the\s+)?(password|credentials?|api\s*keys?|secrets?|tokens?)\b/i,
  /\btell\s+me\s+(the\s+)?(password|credentials?|api\s*keys?|secrets?|tokens?)\b/i,
];

/**
 * Keywords for urgency-based bypass attempts.
 */
const URGENCY_BYPASS_PATTERNS: RegExp[] = [
  /\bskip\s+(the\s+)?(approval|verification|review|confirmation)\b.*\b(urgent|emergency|asap|immediately|right\s+now)\b/i,
  /\b(urgent|emergency|asap|immediately|right\s+now)\b.*\bskip\s+(the\s+)?(approval|verification|review|confirmation)\b/i,
  /\bbypass\s+(the\s+)?(approval|verification|review|confirmation)\s+(because|since|as)\s+(it'?s?\s+)?(urgent|an?\s+emergency)\b/i,
  /\b(urgent|emergency)\b.*\bbypass\b/i,
  /\bno\s+time\s+(for|to)\s+(approval|verification|review|confirmation)\b/i,
  /\bdon'?t\s+(need|require|wait\s+for)\s+(approval|verification|review)\b.*\b(urgent|hurry|rush|asap)\b/i,
  /\b(ceo|boss|owner|manager)\s+(said|told|wants|needs)\s+(to\s+)?skip\b/i,
];

/**
 * Keywords for requests to not log or hide activity.
 */
const NO_LOG_PATTERNS: RegExp[] = [
  /\bdon'?t\s+(log|record|track|save|store)\s+(this|that|it|the)\b/i,
  /\bno\s+(log|record|audit|trail)\b/i,
  /\boff\s+(the\s+)?record\b/i,
  /\bhide\s+(this|the)\s+(action|activity|transaction)\b/i,
  /\bdelete\s+(the\s+)?(log|record|audit|history)\b/i,
  /\bturn\s+off\s+(logging|recording|auditing|tracking)\b/i,
  /\bdisable\s+(logging|recording|auditing|tracking)\b/i,
  /\bkeep\s+(this|it)\s+(quiet|secret|private|hidden)\b/i,
  /\b(without|skip)\s+(logging|recording|auditing|tracking)\b/i,
];

// ---------------------------------------------------------------------------
// Pattern matching functions
// ---------------------------------------------------------------------------

function matchesAnyPattern(input: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(input));
}

// ---------------------------------------------------------------------------
// Combined pattern definitions
// ---------------------------------------------------------------------------

const FRAUD_PATTERNS: PatternDefinition[] = [
  {
    pattern: 'WIRE_TRANSFER_NEW_ACCOUNT',
    severity: 'CRITICAL',
    message:
      'Wire transfer to a new account detected. This requires in-app verification with a 24-hour hold period. Voice commands cannot authorize new wire destinations.',
    check: (params) => {
      const inputMatch = matchesAnyPattern(params.input, WIRE_TRANSFER_PATTERNS);
      const contextMatch =
        params.context?.isNewRecipient === true && params.context?.isFinancial === true;
      return inputMatch || contextMatch;
    },
  },
  {
    pattern: 'VENDOR_BANK_CHANGE',
    severity: 'CRITICAL',
    message:
      'Vendor bank account change detected. This is a common business email compromise (BEC) pattern. Changes require documented evidence submitted through the in-app verification flow.',
    check: (params) => {
      return matchesAnyPattern(params.input, VENDOR_BANK_CHANGE_PATTERNS);
    },
  },
  {
    pattern: 'CREDENTIAL_LEAK',
    severity: 'CRITICAL',
    message:
      'Request to send credentials, passwords, or API keys detected. Secrets are never shared over any communication channel. Access credentials through the secure vault only.',
    check: (params) => {
      return matchesAnyPattern(params.input, CREDENTIAL_LEAK_PATTERNS);
    },
  },
  {
    pattern: 'URGENCY_BYPASS',
    severity: 'HIGH',
    message:
      'Urgency-based approval bypass attempt detected. Approval workflows cannot be skipped due to urgency. If this is a genuine emergency, use the phone tree to escalate.',
    check: (params) => {
      return matchesAnyPattern(params.input, URGENCY_BYPASS_PATTERNS);
    },
  },
  {
    pattern: 'NO_LOG_REQUEST',
    severity: 'HIGH',
    message:
      'Request to disable logging detected. All actions are always logged for security and compliance. Logging cannot be disabled, paused, or bypassed.',
    check: (params) => {
      return matchesAnyPattern(params.input, NO_LOG_PATTERNS);
    },
  },
  {
    pattern: 'PROMPT_INJECTION',
    severity: 'CRITICAL',
    message:
      'Prompt injection attempt detected. Attempts to override system instructions are blocked and logged. This incident has been recorded.',
    check: (params) => {
      return matchesAnyPattern(params.input, PROMPT_INJECTION_PATTERNS);
    },
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect fraud or social engineering patterns in user input.
 *
 * This function CANNOT be overridden even with a valid PIN.
 * It evaluates all known fraud patterns against the input and context.
 *
 * Returns the first matching pattern found (ordered by severity).
 */
export function detectFraud(params: FraudDetectorParams): FraudCheckResult {
  for (const definition of FRAUD_PATTERNS) {
    if (definition.check(params)) {
      return {
        isFraudulent: true,
        pattern: definition.pattern,
        severity: definition.severity,
        message: definition.message,
      };
    }
  }

  return {
    isFraudulent: false,
    pattern: null,
    severity: 'LOW',
    message: 'No fraud patterns detected',
  };
}

/**
 * Run all fraud checks and return ALL matching patterns (not just the first).
 * Useful for comprehensive security auditing.
 */
export function detectAllFraudPatterns(params: FraudDetectorParams): FraudCheckResult[] {
  const results: FraudCheckResult[] = [];

  for (const definition of FRAUD_PATTERNS) {
    if (definition.check(params)) {
      results.push({
        isFraudulent: true,
        pattern: definition.pattern,
        severity: definition.severity,
        message: definition.message,
      });
    }
  }

  if (results.length === 0) {
    return [
      {
        isFraudulent: false,
        pattern: null,
        severity: 'LOW',
        message: 'No fraud patterns detected',
      },
    ];
  }

  return results;
}

/**
 * Quick check: does the input contain any prompt injection markers?
 * Lighter-weight than the full fraud check, for use in pre-processing.
 */
export function containsPromptInjection(input: string): boolean {
  return matchesAnyPattern(input, PROMPT_INJECTION_PATTERNS);
}
