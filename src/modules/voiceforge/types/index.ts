// ============================================================================
// VoiceForge AI Engine — Module-Specific Types
// ============================================================================

import type { CallOutcome, ConsentStatus } from '@/shared/types';

// --- Voice Provider Types ---

export interface VoiceProvider {
  name: string;
  provisionNumber(areaCode: string): Promise<ProvisionedNumber>;
  releaseNumber(phoneNumber: string): Promise<void>;
  initiateCall(config: OutboundCallConfig): Promise<CallSession>;
  getCallStatus(callSid: string): Promise<CallStatus>;
}

export interface ProvisionedNumber {
  phoneNumber: string;
  sid: string;
  region: string;
  capabilities: ('VOICE' | 'SMS' | 'MMS')[];
  monthlyRate: number;
  provisionedAt: Date;
}

export interface OutboundCallConfig {
  from: string;
  to: string;
  personaId: string;
  scriptId?: string;
  maxDuration: number;
  recordCall: boolean;
  consentRequired: boolean;
}

export interface CallSession {
  callSid: string;
  status: CallStatus;
  startedAt: Date;
}

export type CallStatus =
  | 'QUEUED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CANCELLED';

// --- Consent Types ---

export interface ConsentCheck {
  allowed: boolean;
  reason: string;
  consentType: 'ONE_PARTY' | 'TWO_PARTY' | 'UNKNOWN';
  jurisdiction: string;
  recordingAllowed: boolean;
}

// --- Outbound Agent Types ---

export interface OutboundCallRequest {
  entityId: string;
  contactId: string;
  personaId: string;
  scriptId?: string;
  purpose: string;
  maxDuration?: number;
  recordCall?: boolean;
  guardrails: CallGuardrails;
  /**
   * Owning user id. Optional so older callers continue to compile, but
   * required for any per-user integration (e.g. sentiment monitoring,
   * voiceprint verification) to look up the user's VAF config.
   */
  userId?: string;
  /**
   * Optional ShadowMessage id so VAF sentiment frames can be persisted
   * onto the message row. Forwarded directly to monitorCallSentiment.
   */
  messageId?: string;
}

export interface CallGuardrails {
  maxCommitments: number;
  forbiddenTopics: string[];
  escalationTriggers: string[];
  complianceProfile: string[];
  maxSilenceSeconds: number;
}

export interface OutboundCallResult {
  callId: string;
  outcome: CallOutcome;
  duration: number;
  voicemailDropped: boolean;
  commitmentsMade: string[];
  actionItems: string[];
  nextSteps: string[];
  sentiment: number;
  escalated: boolean;
  escalationReason?: string;
}

export interface GuardrailCheckResult {
  passed: boolean;
  violations: { rule: string; excerpt: string; severity: 'WARNING' | 'BLOCK' }[];
  shouldEscalate: boolean;
  escalationReason?: string;
}

// --- Inbound Agent Types ---

export interface InboundConfig {
  entityId: string;
  phoneNumber: string;
  greeting: string;
  personaId: string;
  routingRules: RoutingRule[];
  afterHoursConfig: AfterHoursConfig;
  spamFilterEnabled: boolean;
  vipContactIds: string[];
}

export interface RoutingRule {
  id: string;
  condition: string;
  destination: string;
  priority: number;
}

export interface AfterHoursConfig {
  enabled: boolean;
  message: string;
  businessHours: { day: number; start: string; end: string }[];
  voicemailEnabled: boolean;
  urgentEscalationNumber?: string;
}

export interface InboundCallResult {
  callId: string;
  callerNumber: string;
  callerContactId?: string;
  isSpam: boolean;
  isVIP: boolean;
  routedTo: string;
  intakeData?: Record<string, string>;
  afterHours: boolean;
  duration: number;
}

// --- Script Engine Types ---

export interface CallScript {
  id: string;
  entityId: string;
  name: string;
  description: string;
  nodes: ScriptNode[];
  startNodeId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptNode {
  id: string;
  type: 'SPEAK' | 'LISTEN' | 'BRANCH' | 'TRANSFER' | 'END' | 'COLLECT_INFO';
  content: string;
  branches: ScriptBranch[];
  escalationTrigger?: boolean;
  collectField?: string;
  nextNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface ScriptBranch {
  condition: string;
  targetNodeId: string;
  label: string;
}

export interface ScriptExecution {
  scriptId: string;
  callId: string;
  currentNodeId: string;
  visitedNodes: string[];
  collectedData: Record<string, string>;
  startedAt: Date;
}

// --- Persona Types ---

export interface VoicePersona {
  id: string;
  entityId: string;
  name: string;
  description: string;
  voiceConfig: VoiceConfig;
  personality: PersonalityConfig;
  status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  consentChain: ConsentChainEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export interface VoiceConfig {
  provider: string;
  voiceId: string;
  speed: number;
  pitch: number;
  language: string;
  accent?: string;
}

export interface PersonalityConfig {
  defaultTone: string;
  formality: number;
  empathy: number;
  assertiveness: number;
  humor: number;
  vocabulary: 'SIMPLE' | 'MODERATE' | 'ADVANCED';
}

export interface ConsentChainEntry {
  id: string;
  grantedBy: string;
  grantedAt: Date;
  scope: string;
  status: ConsentStatus;
  revokedAt?: Date;
  watermarkId?: string;
}

// --- Conversational Intelligence Types ---

export interface TranscriptSegment {
  speaker: 'AGENT' | 'CALLER';
  text: string;
  startTime: number;
  endTime: number;
  sentiment: number;
  confidence: number;
}

export interface CallAnalysis {
  callId: string;
  transcript: TranscriptSegment[];
  overallSentiment: number;
  sentimentTimeline: { time: number; sentiment: number }[];
  keyInfoExtracted: ExtractedInfo[];
  complianceIssues: ComplianceIssue[];
  summary: CallSummary;
  talkRatio: { agent: number; caller: number };
}

export interface ExtractedInfo {
  type: 'NAME' | 'EMAIL' | 'PHONE' | 'ADDRESS' | 'DATE' | 'AMOUNT' | 'DECISION' | 'ACTION_ITEM';
  value: string;
  confidence: number;
  segmentIndex: number;
}

export interface ComplianceIssue {
  type: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'VIOLATION';
  segmentIndex: number;
  excerpt: string;
}

export interface CallSummary {
  oneLineSummary: string;
  keyPoints: string[];
  actionItems: string[];
  followUpNeeded: boolean;
  followUpReason?: string;
  nextSteps: string[];
}

// --- Campaign Types ---

export interface Campaign {
  id: string;
  entityId: string;
  name: string;
  description: string;
  personaId: string;
  scriptId: string;
  targetContactIds: string[];
  schedule: CampaignSchedule;
  stopConditions: StopCondition[];
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'STOPPED';
  stats: CampaignStats;
  createdAt: Date;
  updatedAt: Date;
}

export interface CampaignSchedule {
  startDate: Date;
  endDate?: Date;
  callWindowStart: string;
  callWindowEnd: string;
  timezone: string;
  maxCallsPerDay: number;
  retryAttempts: number;
  retryDelayHours: number;
}

export interface StopCondition {
  type: 'MAX_CALLS' | 'MAX_CONNECTS' | 'DATE' | 'CONVERSION_TARGET' | 'NEGATIVE_SENTIMENT';
  threshold: number | string;
}

export interface CampaignStats {
  totalTargeted: number;
  totalCalled: number;
  totalConnected: number;
  totalVoicemail: number;
  totalNoAnswer: number;
  totalInterested: number;
  totalNotInterested: number;
  averageSentiment: number;
  averageDuration: number;
  conversionRate: number;
}

// --- Number Management Types ---

export interface ManagedNumber {
  id: string;
  entityId: string;
  phoneNumber: string;
  label: string;
  provider: string;
  capabilities: ('VOICE' | 'SMS' | 'MMS')[];
  status: 'ACTIVE' | 'SUSPENDED' | 'RELEASED';
  monthlyRate: number;
  assignedPersonaId?: string;
  inboundConfigId?: string;
  provisionedAt: Date;
}
