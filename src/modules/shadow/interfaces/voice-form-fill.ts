// ============================================================================
// Shadow Voice Agent — Voice Form Fill
// Parses natural language voice input into structured form fields.
// Handles dates ("next Tuesday"), amounts ("four thousand two hundred"),
// entity inference from contact lists, and multi-field extraction.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FormFieldSchema {
  name: string;
  type: string; // 'text' | 'date' | 'number' | 'email' | 'phone' | 'select' | 'currency'
  required: boolean;
  label: string;
  options?: string[]; // For 'select' type
}

export interface FormFillContext {
  activeEntity?: string;
  contacts?: string[];
}

export interface FormFillParams {
  formSchema: FormFieldSchema[];
  voiceInput: string;
  context: FormFillContext;
}

export interface FormFillResult {
  filledFields: Record<string, unknown>;
  missingFields: string[];
  nextQuestion?: string;
  confidence: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Word-to-number mappings for natural language number parsing.
 */
const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  k: 1_000,
  m: 1_000_000,
  b: 1_000_000_000,
};

const MONTH_NAMES: Record<string, number> = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

// ---------------------------------------------------------------------------
// VoiceFormFill
// ---------------------------------------------------------------------------

export class VoiceFormFill {
  // -------------------------------------------------------------------------
  // fillForm — Main entry: extract fields from voice input
  // -------------------------------------------------------------------------

  async fillForm(params: FormFillParams): Promise<FormFillResult> {
    const { formSchema, voiceInput, context } = params;
    const input = voiceInput.trim();
    const filledFields: Record<string, unknown> = {};
    const confidence: Record<string, number> = {};
    const missingFields: string[] = [];

    for (const field of formSchema) {
      const extracted = this.extractField(field, input, context);

      if (extracted.value !== null && extracted.value !== undefined) {
        filledFields[field.name] = extracted.value;
        confidence[field.name] = extracted.confidence;
      } else if (field.required) {
        missingFields.push(field.name);
      }
    }

    // Generate next question for the first missing required field
    let nextQuestion: string | undefined;
    if (missingFields.length > 0) {
      const nextField = formSchema.find((f) => f.name === missingFields[0]);
      if (nextField) {
        nextQuestion = this.generateQuestion(nextField);
      }
    }

    return {
      filledFields,
      missingFields,
      nextQuestion,
      confidence,
    };
  }

  // -------------------------------------------------------------------------
  // parseNaturalDate — Parse human-friendly date expressions
  // -------------------------------------------------------------------------

  parseNaturalDate(input: string, timezone?: string): Date | null {
    const lower = input.toLowerCase().trim();
    const now = new Date();

    // "today"
    if (lower === 'today') {
      return this.startOfDay(now, timezone);
    }

    // "tomorrow"
    if (lower === 'tomorrow') {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      return this.startOfDay(d, timezone);
    }

    // "yesterday"
    if (lower === 'yesterday') {
      const d = new Date(now);
      d.setDate(d.getDate() - 1);
      return this.startOfDay(d, timezone);
    }

    // "next <day>" — e.g., "next Tuesday"
    const nextDayMatch = lower.match(/^next\s+(\w+)$/);
    if (nextDayMatch) {
      const dayNum = DAY_NAMES[nextDayMatch[1]];
      if (dayNum !== undefined) {
        return this.getNextDayOfWeek(dayNum, now, timezone);
      }
    }

    // "this <day>" — e.g., "this Friday"
    const thisDayMatch = lower.match(/^this\s+(\w+)$/);
    if (thisDayMatch) {
      const dayNum = DAY_NAMES[thisDayMatch[1]];
      if (dayNum !== undefined) {
        return this.getNextDayOfWeek(dayNum, now, timezone, false);
      }
    }

    // Just a day name — "Tuesday" → next occurrence
    if (DAY_NAMES[lower] !== undefined) {
      return this.getNextDayOfWeek(DAY_NAMES[lower], now, timezone);
    }

    // "in X days/weeks/months"
    const inMatch = lower.match(/^in\s+(\d+)\s+(day|days|week|weeks|month|months)$/);
    if (inMatch) {
      const num = parseInt(inMatch[1], 10);
      const unit = inMatch[2].replace(/s$/, '');
      const d = new Date(now);
      if (unit === 'day') d.setDate(d.getDate() + num);
      else if (unit === 'week') d.setDate(d.getDate() + num * 7);
      else if (unit === 'month') d.setMonth(d.getMonth() + num);
      return this.startOfDay(d, timezone);
    }

    // "<Month> <day>" — e.g., "March 15th", "March 15"
    const monthDayMatch = lower.match(
      /^(\w+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?$/,
    );
    if (monthDayMatch) {
      const month = MONTH_NAMES[monthDayMatch[1]];
      if (month !== undefined) {
        const day = parseInt(monthDayMatch[2], 10);
        const year = monthDayMatch[3] ? parseInt(monthDayMatch[3], 10) : now.getFullYear();
        const d = new Date(year, month, day);
        // If the date is in the past and no year was specified, move to next year
        if (!monthDayMatch[3] && d < now) {
          d.setFullYear(d.getFullYear() + 1);
        }
        return this.startOfDay(d, timezone);
      }
    }

    // "<day>/<month>/<year>" or "<month>/<day>/<year>" (US format)
    const slashMatch = lower.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (slashMatch) {
      let month = parseInt(slashMatch[1], 10) - 1; // US format: month first
      let day = parseInt(slashMatch[2], 10);
      let year = parseInt(slashMatch[3], 10);
      if (year < 100) year += 2000;
      // Validate
      if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
        return new Date(year, month, day);
      }
    }

    // ISO format "YYYY-MM-DD"
    const isoMatch = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const d = new Date(
        parseInt(isoMatch[1], 10),
        parseInt(isoMatch[2], 10) - 1,
        parseInt(isoMatch[3], 10),
      );
      return isNaN(d.getTime()) ? null : d;
    }

    // "end of month" / "end of week"
    if (lower === 'end of month' || lower === 'eom') {
      const d = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return this.startOfDay(d, timezone);
    }
    if (lower === 'end of week' || lower === 'eow') {
      // End of week = next Sunday
      return this.getNextDayOfWeek(0, now, timezone);
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // parseAmount — Parse natural language amounts
  // -------------------------------------------------------------------------

  parseAmount(input: string): number | null {
    const lower = input.toLowerCase().trim();

    // Remove currency symbols and commas
    const cleaned = lower
      .replace(/[$\u20AC\u00A3\u00A5]/g, '') // $, EUR, GBP, JPY
      .replace(/,/g, '')
      .trim();

    // Direct numeric: "4200", "4200.50"
    const directMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
    if (directMatch) {
      return parseFloat(directMatch[1]);
    }

    // Shorthand: "4.2k", "1.5m", "2b"
    const shorthandMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(k|m|b)$/);
    if (shorthandMatch) {
      const base = parseFloat(shorthandMatch[1]);
      const mult = MULTIPLIERS[shorthandMatch[2]];
      return mult ? base * mult : null;
    }

    // Word-based numbers: "four thousand two hundred"
    const wordResult = this.parseWordNumber(cleaned);
    if (wordResult !== null) {
      return wordResult;
    }

    // Mixed: "4 thousand 200", "4 thousand two hundred"
    const mixedResult = this.parseMixedNumber(cleaned);
    if (mixedResult !== null) {
      return mixedResult;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // inferEntity — Match voice input to known contact names
  // -------------------------------------------------------------------------

  inferEntity(input: string, contactNames: string[]): string | null {
    if (!contactNames || contactNames.length === 0) return null;

    const lower = input.toLowerCase().trim();

    // Exact match
    const exact = contactNames.find((c) => c.toLowerCase() === lower);
    if (exact) return exact;

    // Substring match — input mentions the contact name
    for (const name of contactNames) {
      if (lower.includes(name.toLowerCase())) {
        return name;
      }
    }

    // Partial/fuzzy match — check first name or last name individually
    for (const name of contactNames) {
      const parts = name.toLowerCase().split(/\s+/);
      for (const part of parts) {
        if (part.length >= 3 && lower.includes(part)) {
          return name;
        }
      }
    }

    // Levenshtein distance for close misspellings
    const words = lower.split(/\s+/);
    for (const name of contactNames) {
      const nameLower = name.toLowerCase();
      for (const word of words) {
        if (word.length >= 3 && this.levenshteinDistance(word, nameLower) <= 2) {
          return name;
        }
        // Also check against individual name parts (allow transpositions)
        const nameParts = nameLower.split(/\s+/);
        for (const part of nameParts) {
          if (part.length >= 3) {
            const dist = this.levenshteinDistance(word, part);
            // Allow distance up to 2 when lengths are similar (handles transpositions)
            const lengthDiff = Math.abs(word.length - part.length);
            const maxDist = lengthDiff <= 1 ? 2 : 1;
            if (dist <= maxDist) {
              return name;
            }
          }
        }
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Private: Field Extraction
  // -------------------------------------------------------------------------

  private extractField(
    field: FormFieldSchema,
    input: string,
    context: FormFillContext,
  ): { value: unknown; confidence: number } {
    switch (field.type) {
      case 'date':
        return this.extractDate(input);
      case 'number':
      case 'currency':
        return this.extractAmount(input);
      case 'email':
        return this.extractEmail(input);
      case 'phone':
        return this.extractPhone(input);
      case 'select':
        return this.extractSelect(input, field.options ?? []);
      case 'text':
      default:
        return this.extractText(field, input, context);
    }
  }

  private extractDate(input: string): { value: unknown; confidence: number } {
    // Try to find date-like phrases in the input
    const datePatterns = [
      /(?:on|by|before|after|due|date[:\s]+)\s*(.+?)(?:\s*[,.;]|$)/i,
      /(today|tomorrow|yesterday)/i,
      /(next\s+\w+)/i,
      /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,?\s*\d{4})?)/i,
      /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/,
      /(\d{4}-\d{2}-\d{2})/,
    ];

    for (const pattern of datePatterns) {
      const match = input.match(pattern);
      if (match) {
        const dateStr = match[1].trim();
        const parsed = this.parseNaturalDate(dateStr);
        if (parsed) {
          return { value: parsed.toISOString(), confidence: 0.85 };
        }
      }
    }

    // Try the whole input as a date
    const fullParse = this.parseNaturalDate(input);
    if (fullParse) {
      return { value: fullParse.toISOString(), confidence: 0.7 };
    }

    return { value: null, confidence: 0 };
  }

  private extractAmount(input: string): { value: unknown; confidence: number } {
    // Find amount patterns in the input
    const amountPatterns = [
      /(?:for|amount|total|price|cost|pay|charge|worth|valued?\s+at)\s+\$?([\d,]+(?:\.\d+)?(?:\s*[kmb])?)/i,
      /\$\s*([\d,]+(?:\.\d+)?(?:\s*[kmb])?)/i,
      /([\d,]+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)/i,
    ];

    for (const pattern of amountPatterns) {
      const match = input.match(pattern);
      if (match) {
        const parsed = this.parseAmount(match[1]);
        if (parsed !== null) {
          return { value: parsed, confidence: 0.9 };
        }
      }
    }

    // Try word-based numbers from the full input
    const parsed = this.parseAmount(input);
    if (parsed !== null) {
      return { value: parsed, confidence: 0.6 };
    }

    return { value: null, confidence: 0 };
  }

  private extractEmail(input: string): { value: unknown; confidence: number } {
    const emailPattern = /[\w.+-]+@[\w-]+\.[\w.-]+/;
    const match = input.match(emailPattern);
    if (match) {
      return { value: match[0], confidence: 0.95 };
    }
    return { value: null, confidence: 0 };
  }

  private extractPhone(input: string): { value: unknown; confidence: number } {
    const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/;
    const match = input.match(phonePattern);
    if (match) {
      return { value: match[0].replace(/[^\d+]/g, ''), confidence: 0.85 };
    }
    return { value: null, confidence: 0 };
  }

  private extractSelect(
    input: string,
    options: string[],
  ): { value: unknown; confidence: number } {
    const lower = input.toLowerCase();
    for (const option of options) {
      if (lower.includes(option.toLowerCase())) {
        return { value: option, confidence: 0.85 };
      }
    }
    return { value: null, confidence: 0 };
  }

  private extractText(
    field: FormFieldSchema,
    input: string,
    context: FormFillContext,
  ): { value: unknown; confidence: number } {
    // For entity/contact-related fields, try to infer from contacts
    const fieldNameLower = field.name.toLowerCase();
    const isEntityField =
      fieldNameLower.includes('contact') ||
      fieldNameLower.includes('client') ||
      fieldNameLower.includes('recipient') ||
      fieldNameLower.includes('name') ||
      fieldNameLower.includes('person') ||
      fieldNameLower.includes('assignee');

    if (isEntityField && context.contacts && context.contacts.length > 0) {
      const entity = this.inferEntity(input, context.contacts);
      if (entity) {
        return { value: entity, confidence: 0.8 };
      }
    }

    // For generic text fields, return the full trimmed input
    // (In a production system, NER would extract specific substrings)
    if (input.trim().length > 0) {
      return { value: input.trim(), confidence: 0.5 };
    }

    return { value: null, confidence: 0 };
  }

  // -------------------------------------------------------------------------
  // Private: Natural Language Number Parsing
  // -------------------------------------------------------------------------

  /**
   * Parse a fully word-based number like "four thousand two hundred".
   */
  private parseWordNumber(input: string): number | null {
    const words = input
      .replace(/-/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (words.length === 0) return null;

    // Check all words are valid number words or multipliers
    const allValid = words.every(
      (w) => WORD_NUMBERS[w] !== undefined || MULTIPLIERS[w] !== undefined || w === 'and',
    );

    if (!allValid) return null;

    let total = 0;
    let current = 0;

    for (const word of words) {
      if (word === 'and') continue;

      const wordVal = WORD_NUMBERS[word];
      const multVal = MULTIPLIERS[word];

      if (wordVal !== undefined) {
        current += wordVal;
      } else if (multVal !== undefined) {
        if (current === 0) current = 1;
        if (multVal >= 1000) {
          total += current * multVal;
          current = 0;
        } else {
          current *= multVal;
        }
      }
    }

    total += current;
    return total > 0 || input.includes('zero') ? total : null;
  }

  /**
   * Parse mixed digit/word numbers like "4 thousand 200".
   */
  private parseMixedNumber(input: string): number | null {
    const words = input.split(/\s+/);
    if (words.length < 2) return null;

    let total = 0;
    let current = 0;
    let hasMultiplier = false;

    for (const word of words) {
      if (word === 'and') continue;

      // Try as a number
      const asNum = parseFloat(word);
      if (!isNaN(asNum)) {
        current += asNum;
        continue;
      }

      // Try as a word number
      const wordVal = WORD_NUMBERS[word];
      if (wordVal !== undefined) {
        current += wordVal;
        continue;
      }

      // Try as a multiplier
      const multVal = MULTIPLIERS[word];
      if (multVal !== undefined) {
        hasMultiplier = true;
        if (current === 0) current = 1;
        if (multVal >= 1000) {
          total += current * multVal;
          current = 0;
        } else {
          current *= multVal;
        }
        continue;
      }
    }

    total += current;
    return hasMultiplier && total > 0 ? total : null;
  }

  // -------------------------------------------------------------------------
  // Private: Date Helpers
  // -------------------------------------------------------------------------

  /**
   * Get the next occurrence of a day of the week.
   * @param dayOfWeek  0=Sunday, 6=Saturday
   * @param from       Reference date
   * @param timezone   Optional timezone (unused in basic impl)
   * @param forceNext  If true, skip to next week if today is that day
   */
  private getNextDayOfWeek(
    dayOfWeek: number,
    from: Date,
    _timezone?: string,
    forceNext: boolean = true,
  ): Date {
    const result = new Date(from);
    const currentDay = result.getDay();
    let daysUntil = dayOfWeek - currentDay;

    if (daysUntil < 0 || (daysUntil === 0 && forceNext)) {
      daysUntil += 7;
    }

    result.setDate(result.getDate() + daysUntil);
    return this.startOfDay(result);
  }

  /**
   * Set a date to the start of the day (midnight).
   */
  private startOfDay(date: Date, _timezone?: string): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // -------------------------------------------------------------------------
  // Private: String Distance
  // -------------------------------------------------------------------------

  /**
   * Compute Levenshtein distance between two strings.
   */
  private levenshteinDistance(a: string, b: string): number {
    const m = a.length;
    const n = b.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array.from({ length: m + 1 }, () =>
      Array.from({ length: n + 1 }, () => 0),
    );

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }

    return dp[m][n];
  }

  // -------------------------------------------------------------------------
  // Private: Question Generation
  // -------------------------------------------------------------------------

  /**
   * Generate a natural-sounding question for a missing form field.
   */
  private generateQuestion(field: FormFieldSchema): string {
    const label = field.label || field.name;

    switch (field.type) {
      case 'date':
        return `When would you like to set the ${label.toLowerCase()}?`;
      case 'number':
      case 'currency':
        return `What's the ${label.toLowerCase()}?`;
      case 'email':
        return `What email address should I use for ${label.toLowerCase()}?`;
      case 'phone':
        return `What phone number should I use?`;
      case 'select':
        if (field.options && field.options.length > 0) {
          return `Which ${label.toLowerCase()} would you like? Options are: ${field.options.join(', ')}.`;
        }
        return `Which ${label.toLowerCase()} would you like?`;
      default:
        return `What should I put for ${label.toLowerCase()}?`;
    }
  }
}
