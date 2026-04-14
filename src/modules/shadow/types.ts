// Shadow Voice Agent — Shared TypeScript types
// All interfaces used across agent runtime, tools, memory, and response generation.

// ─── Response Types ─────────────────────────────────────────────────────────

export interface ShadowResponse {
  text: string;
  contentType:
    | 'TEXT'
    | 'ACTION_CARD'
    | 'NAVIGATION_CARD'
    | 'LIST_CARD'
    | 'DECISION_CARD'
    | 'CONFIRMATION_CARD'
    | 'VOICE_CARD';
  citations?: Citation[];
  actionCards?: ActionCard[];
  navigationCards?: NavigationCard[];
  decisionCards?: DecisionCard[];
  telemetry?: MessageTelemetry;
  sessionId: string;
  messageId?: string;
}

export interface Citation {
  type: string;
  id: string;
  label: string;
  deepLink?: string;
}

export interface ActionCard {
  id: string;
  title: string;
  description: string;
  options: Array<{
    label: string;
    action: string;
    style: 'primary' | 'secondary' | 'danger';
  }>;
}

export interface NavigationCard {
  title: string;
  description: string;
  deepLink: string;
  recordType: string;
  recordId: string;
}

export interface DecisionCard {
  question: string;
  options: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
}

// ─── Intent Classification ──────────────────────────────────────────────────

export interface ClassifiedIntent {
  primaryIntent: string;
  confidence: number;
  entities: Record<string, string>;
  requiredTools: string[];
  confirmationLevel: 'none' | 'tap' | 'confirm_phrase' | 'voice_pin';
  blastRadius: 'self' | 'entity' | 'external' | 'public';
}

export type IntentCategory =
  | 'navigate'
  | 'read_data'
  | 'create_task'
  | 'draft_email'
  | 'send_email'
  | 'classify_email'
  | 'search_knowledge'
  | 'modify_calendar'
  | 'complete_task'
  | 'create_invoice'
  | 'send_invoice'
  | 'trigger_workflow'
  | 'place_call'
  | 'bulk_email'
  | 'declare_crisis'
  | 'make_payment'
  | 'delete_data'
  | 'activate_phone_tree'
  | 'switch_entity'
  | 'general_question';

// ─── Agent Context ──────────────────────────────────────────────────────────

export interface AgentContext {
  user: {
    id: string;
    name: string;
    email: string;
    preferences: Record<string, unknown>;
    timezone: string;
  };
  activeEntity?: {
    id: string;
    name: string;
    type: string;
    complianceProfile: string[];
  };
  currentPage?: {
    pageId: string;
    title: string;
  };
  recentMessages: Array<{ role: string; content: string }>;
  recentActions: Array<{
    type: string;
    description: string;
    timestamp: Date;
  }>;
  timeOfDay: string;
  dayOfWeek: string;
  channel: string;
  shadowConfig?: {
    safety: {
      requirePinForFinancial: boolean;
      requirePinForExternal: boolean;
      requirePinForCrisis: boolean;
      requirePinForDeletion: boolean;
      maxBlastRadiusWithoutPin: number;
      financialThreshold: number;
      blastRadiusThreshold: string;
      alwaysAnnounceAffectedCount: boolean;
      alwaysAnnounceCost: boolean;
      alwaysAnnounceIrreversibility: boolean;
    };
    proactive: {
      briefingEnabled: boolean;
      briefingTime: string;
      briefingChannel: string;
      briefingContent: string[];
      eodEnabled: boolean;
      eodTime: string;
    };
    preferences: Record<string, unknown>;
    overrides: Record<string, string>;
  };
}

// ─── Tool System ────────────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  success: boolean;
  data?: unknown;
  error?: string;
  durationMs: number;
}

export interface ToolExecutionParams {
  toolName: string;
  input: Record<string, unknown>;
  context: AgentContext;
}

// ─── Telemetry ──────────────────────────────────────────────────────────────

export interface MessageTelemetry {
  intentClassificationMs?: number;
  contextAssemblyMs?: number;
  toolCalls: Array<{
    tool: string;
    durationMs: number;
    status: string;
  }>;
  responseGenerationMs?: number;
  totalMs: number;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
}

// ─── Risk Scoring ───────────────────────────────────────────────────────────

export interface RiskFactors {
  financialAmount?: number;
  blastRadius: 'self' | 'entity' | 'external' | 'public';
  channel: 'web' | 'phone' | 'mobile';
  isBusinessHours: boolean;
  actionsInLastHour: number;
  isFirstTimeAction: boolean;
  isTrustedDevice: boolean;
}

export interface RiskAssessment {
  score: number;
  factors: Array<{ label: string; points: number }>;
  requiredConfirmation: 'none' | 'tap' | 'voice_pin' | 'voice_pin_sms';
}

// ─── Memory ─────────────────────────────────────────────────────────────────

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: string;
  intent?: string;
  toolsUsed?: string[];
  actionsTaken?: string[];
  channel: string;
  createdAt: Date;
}

// ─── Outcome Extraction ─────────────────────────────────────────────────────

export interface ExtractedOutcome {
  decisionsMade: Array<{ decision: string; context: string }>;
  commitments: Array<{ commitment: string; deadline?: string; assignee?: string }>;
  deadlinesSet: Array<{ description: string; date: string }>;
  followUps: Array<{ description: string; dueDate?: string }>;
  recordsCreated: Array<{ type: string; id: string; description: string }>;
  recordsUpdated: Array<{ type: string; id: string; changes: string }>;
  recordsLinked: Array<{ fromType: string; fromId: string; toType: string; toId: string }>;
}

// ─── Confirmation ───────────────────────────────────────────────────────────

export interface ConfirmationRequest {
  actionType: string;
  description: string;
  blastRadius: 'self' | 'entity' | 'external' | 'public';
  financialImpact?: number;
  affectedCount?: number;
  requiredLevel: 'tap' | 'confirm_phrase' | 'voice_pin';
}
