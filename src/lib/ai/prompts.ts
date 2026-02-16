// ============================================================================
// Prompt Template System
// Type-safe prompt templates with variable interpolation for AI API calls.
// ============================================================================

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  variables: string[];
  optionalVariables?: string[];
  systemPrompt?: string;
}

// ---------------------------------------------------------------------------
// Template Registry
// ---------------------------------------------------------------------------

const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  'triage-email': {
    id: 'triage-email',
    name: 'Email Triage',
    description: 'Classify email priority, extract intent, and suggest action.',
    variables: ['subject', 'body', 'senderName', 'senderEmail'],
    optionalVariables: ['userPreferences'],
    systemPrompt:
      'You are an AI executive assistant specializing in email triage. Be concise, accurate, and bias toward protecting the user\'s time.',
    template: `You are an AI executive assistant triaging incoming email.

Analyze the following email and provide a structured assessment:

Subject: {{subject}}
From: {{senderName}} <{{senderEmail}}>

Body:
{{body}}

User preferences: {{userPreferences}}

Respond with JSON:
{
  "priority": "P0" | "P1" | "P2",
  "intent": "INQUIRY" | "REQUEST" | "UPDATE" | "URGENT" | "FYI" | "SPAM",
  "summary": "one-line summary",
  "suggestedAction": "reply" | "archive" | "delegate" | "schedule" | "flag",
  "suggestedReplyPoints": ["point1", "point2"],
  "requiresHumanReview": true/false,
  "reasoning": "brief explanation of triage decision"
}`,
  },

  'draft-reply': {
    id: 'draft-reply',
    name: 'Draft Reply',
    description: 'Draft a reply to a message in the specified tone.',
    variables: ['originalMessage', 'senderName', 'tone', 'keyPoints'],
    optionalVariables: ['constraints'],
    systemPrompt:
      'You are a professional communication assistant. Write clear, contextually appropriate replies that match the requested tone.',
    template: `Draft a reply to the following message.

Original message from {{senderName}}:
{{originalMessage}}

Tone: {{tone}}
Key points to address:
{{keyPoints}}

Constraints: {{constraints}}

Write a complete, ready-to-send reply. Be natural and match the specified tone. Do not include subject line or email headers — just the body text.`,
  },

  'summarize-document': {
    id: 'summarize-document',
    name: 'Summarize Document',
    description: 'Summarize a document with focus on specific areas.',
    variables: ['documentText', 'documentType'],
    optionalVariables: ['maxLength', 'focusAreas'],
    systemPrompt:
      'You are a document analysis specialist. Produce clear, actionable summaries that preserve key information.',
    template: `Summarize the following {{documentType}} document.

Document:
{{documentText}}

Maximum length: {{maxLength}}
Focus areas: {{focusAreas}}

Provide a structured summary with:
1. Executive Summary (2-3 sentences)
2. Key Points (bullet list)
3. Action Items (if any)
4. Notable Details (dates, numbers, commitments)

Keep the summary concise and focused on the specified areas.`,
  },

  'extract-tasks': {
    id: 'extract-tasks',
    name: 'Extract Tasks',
    description: 'Extract actionable tasks from text such as meeting notes or emails.',
    variables: ['sourceText', 'sourceType'],
    optionalVariables: ['existingTasks'],
    systemPrompt:
      'You are a task extraction specialist. Identify concrete, actionable items with clear ownership and deadlines where mentioned.',
    template: `Extract actionable tasks from the following {{sourceType}}.

Source text:
{{sourceText}}

Existing tasks (avoid duplicates):
{{existingTasks}}

Respond with JSON array:
[
  {
    "title": "concise task title",
    "description": "additional context if needed",
    "assignee": "person responsible (if mentioned)",
    "dueDate": "deadline (if mentioned, ISO format)",
    "priority": "P0" | "P1" | "P2",
    "source": "brief reference to where in the text this was found"
  }
]

Only extract concrete, actionable items. Ignore vague statements or general discussion.`,
  },

  'schedule-suggestion': {
    id: 'schedule-suggestion',
    name: 'Schedule Suggestion',
    description: 'Suggest optimal meeting times based on availability.',
    variables: ['eventDescription', 'participants', 'duration', 'availability'],
    optionalVariables: ['preferences'],
    systemPrompt:
      'You are a scheduling optimization assistant. Balance participant preferences, time zones, and productivity patterns.',
    template: `Suggest optimal meeting times for the following event.

Event: {{eventDescription}}
Participants: {{participants}}
Duration: {{duration}}
Available slots:
{{availability}}

Scheduling preferences: {{preferences}}

Respond with JSON:
{
  "suggestions": [
    {
      "startTime": "ISO datetime",
      "endTime": "ISO datetime",
      "score": 0-100,
      "reasoning": "why this slot is optimal",
      "conflicts": ["any minor conflicts or considerations"]
    }
  ],
  "recommendation": "which suggestion is best and why"
}

Provide 2-3 suggestions ranked by suitability.`,
  },

  'decision-brief': {
    id: 'decision-brief',
    name: 'Decision Brief',
    description: 'Generate a structured decision brief with pros/cons analysis.',
    variables: ['question', 'context', 'options'],
    optionalVariables: ['criteria', 'stakeholders'],
    systemPrompt:
      'You are a decision analysis expert. Provide balanced, evidence-based analysis without bias toward any particular option.',
    template: `Generate a structured decision brief.

Decision question: {{question}}

Context:
{{context}}

Options under consideration:
{{options}}

Evaluation criteria: {{criteria}}
Key stakeholders: {{stakeholders}}

Respond with a structured brief:
1. Decision Statement — What exactly needs to be decided
2. Background — Key context and constraints
3. Options Analysis — For each option:
   - Description
   - Pros (bullet list)
   - Cons (bullet list)
   - Risks
   - Estimated effort/cost
4. Recommendation — Your suggested option with reasoning
5. Next Steps — Concrete actions to move forward`,
  },

  'research-report': {
    id: 'research-report',
    name: 'Research Report',
    description: 'Generate a research report outline or full report.',
    variables: ['topic', 'scope'],
    optionalVariables: ['existingKnowledge', 'requiredSections'],
    systemPrompt:
      'You are a research analyst. Produce well-structured, factual reports with clear citations and balanced perspectives.',
    template: `Generate a research report on the following topic.

Topic: {{topic}}
Scope: {{scope}}

Existing knowledge to build upon:
{{existingKnowledge}}

Required sections: {{requiredSections}}

Structure the report with:
1. Executive Summary
2. Introduction & Background
3. Key Findings (with supporting evidence)
4. Analysis & Implications
5. Recommendations
6. Sources & References

Be thorough but concise. Flag any areas where information may be incomplete or requires verification.`,
  },

  'tone-adjustment': {
    id: 'tone-adjustment',
    name: 'Tone Adjustment',
    description: 'Rewrite text to match a different communication tone.',
    variables: ['originalText', 'currentTone', 'targetTone'],
    optionalVariables: ['context'],
    systemPrompt:
      'You are a communication tone specialist. Preserve the core message while adjusting tone naturally.',
    template: `Rewrite the following text to match a different communication tone.

Original text:
{{originalText}}

Current tone: {{currentTone}}
Target tone: {{targetTone}}

Context: {{context}}

Requirements:
- Preserve the core message and all factual content
- Adjust language, formality, and phrasing to match the target tone
- Keep the same approximate length
- Ensure the rewrite sounds natural, not forced

Provide the rewritten text only, without commentary.`,
  },
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an interpolated prompt from a template.
 * @throws Error if templateId does not exist or required variables are missing.
 */
export function createPrompt(
  templateId: string,
  variables: Record<string, string>,
): string {
  const tmpl = PROMPT_TEMPLATES[templateId];
  if (!tmpl) {
    throw new Error(`Prompt template "${templateId}" not found.`);
  }

  const missing = tmpl.variables.filter((v) => !(v in variables));
  if (missing.length > 0) {
    throw new Error(
      `Missing required variables for template "${templateId}": ${missing.join(', ')}`,
    );
  }

  let result = tmpl.template;

  // Replace required variables
  for (const varName of tmpl.variables) {
    const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
    result = result.replace(pattern, variables[varName]);
  }

  // Replace optional variables (empty string if not provided)
  if (tmpl.optionalVariables) {
    for (const varName of tmpl.optionalVariables) {
      const pattern = new RegExp(`\\{\\{${varName}\\}\\}`, 'g');
      result = result.replace(pattern, variables[varName] ?? '');
    }
  }

  return result;
}

/**
 * Get a template definition by ID for introspection.
 */
export function getTemplate(templateId: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES[templateId];
}

/**
 * List all available prompt templates.
 */
export function listTemplates(): PromptTemplate[] {
  return Object.values(PROMPT_TEMPLATES);
}

/**
 * Validate that all required variables are provided for a template.
 */
export function validateVariables(
  templateId: string,
  variables: Record<string, string>,
): { valid: boolean; missing: string[] } {
  const tmpl = PROMPT_TEMPLATES[templateId];
  if (!tmpl) {
    return { valid: false, missing: [] };
  }

  const missing = tmpl.variables.filter((v) => !(v in variables));
  return { valid: missing.length === 0, missing };
}

/**
 * Get the system prompt for a template (if any).
 */
export function getSystemPrompt(templateId: string): string | undefined {
  return PROMPT_TEMPLATES[templateId]?.systemPrompt;
}
