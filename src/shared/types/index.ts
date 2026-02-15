// ============================================================================
// PersonalAssistantForge — Shared Type Definitions
// All 28 modules + 6 cross-cutting engines share these types.
// DO NOT MODIFY during parallel development — treat as immutable contract.
// ============================================================================

// --- Enums ---

export type Priority = 'P0' | 'P1' | 'P2';
export type Sensitivity = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'RESTRICTED' | 'REGULATED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED';
export type ProjectHealth = 'GREEN' | 'YELLOW' | 'RED';
export type MessageChannel = 'EMAIL' | 'SMS' | 'SLACK' | 'TEAMS' | 'DISCORD' | 'WHATSAPP' | 'TELEGRAM' | 'VOICE' | 'MANUAL';
export type CallDirection = 'INBOUND' | 'OUTBOUND';
export type CallOutcome = 'CONNECTED' | 'VOICEMAIL' | 'NO_ANSWER' | 'BUSY' | 'CALLBACK_REQUESTED' | 'INTERESTED' | 'NOT_INTERESTED';
export type ActionActor = 'AI' | 'HUMAN' | 'SYSTEM';
export type FinancialRecordType = 'INVOICE' | 'EXPENSE' | 'BILL' | 'PAYMENT' | 'TRANSFER';
export type DocumentType = 'BRIEF' | 'MEMO' | 'SOP' | 'MINUTES' | 'INVOICE' | 'SOW' | 'PROPOSAL' | 'CONTRACT' | 'DECK' | 'REPORT';
export type WorkflowTrigger = 'TIME' | 'EVENT' | 'CONDITION' | 'MANUAL' | 'VOICE';
export type ConsentStatus = 'GRANTED' | 'REVOKED' | 'EXPIRED' | 'PENDING';
export type AutonomyLevel = 'SUGGEST' | 'DRAFT' | 'EXECUTE_WITH_APPROVAL' | 'EXECUTE_AUTONOMOUS';
export type Tone = 'FIRM' | 'DIPLOMATIC' | 'WARM' | 'DIRECT' | 'CASUAL' | 'FORMAL' | 'EMPATHETIC' | 'AUTHORITATIVE';
export type ComplianceProfile = 'HIPAA' | 'GDPR' | 'CCPA' | 'SOX' | 'SEC' | 'REAL_ESTATE' | 'GENERAL';
export type BlastRadius = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type MemoryType = 'SHORT_TERM' | 'WORKING' | 'LONG_TERM' | 'EPISODIC';

// --- Core Entities ---

export interface User {
  id: string;
  name: string;
  email: string;
  preferences: UserPreferences;
  timezone: string;
  chronotype?: 'EARLY_BIRD' | 'NIGHT_OWL' | 'FLEXIBLE';
  entityIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  defaultTone: Tone;
  attentionBudget: number; // max interruptions per day
  focusHours: { start: string; end: string }[];
  vipContacts: string[];
  meetingFreedays: number[]; // 0=Sun, 1=Mon, etc.
  autonomyLevel: AutonomyLevel;
}

export interface Entity {
  id: string;
  userId: string;
  name: string;
  type: string; // e.g., 'LLC', 'Corporation', 'Personal'
  complianceProfile: ComplianceProfile[];
  brandKit?: BrandKit;
  voicePersonaId?: string;
  phoneNumbers: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandKit {
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string;
  fontFamily?: string;
  toneGuide?: string;
}

export interface Contact {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  channels: { type: MessageChannel; handle: string }[];
  relationshipScore: number; // 0-100
  lastTouch: Date | null;
  commitments: Commitment[];
  preferences: ContactPreferences;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ContactPreferences {
  preferredChannel: MessageChannel;
  preferredTone: Tone;
  timezone?: string;
  doNotContact?: boolean;
}

export interface Commitment {
  id: string;
  description: string;
  direction: 'TO' | 'FROM'; // made to or by this contact
  status: 'OPEN' | 'FULFILLED' | 'BROKEN';
  dueDate?: Date;
  createdAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  entityId: string;
  projectId?: string;
  priority: Priority;
  status: TaskStatus;
  dueDate?: Date;
  dependencies: string[]; // task IDs
  assigneeId?: string; // user or contact ID
  createdFrom?: { type: 'MESSAGE' | 'CALL' | 'VOICE' | 'MANUAL'; sourceId: string };
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  name: string;
  entityId: string;
  description?: string;
  milestones: Milestone[];
  status: TaskStatus;
  health: ProjectHealth;
  createdAt: Date;
  updatedAt: Date;
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: Date;
  status: TaskStatus;
}

export interface CalendarEvent {
  id: string;
  title: string;
  entityId: string;
  participantIds: string[];
  startTime: Date;
  endTime: Date;
  bufferBefore?: number; // minutes
  bufferAfter?: number;
  prepPacket?: PrepPacket;
  meetingNotes?: string;
  recurrence?: string; // RRULE
  createdAt: Date;
  updatedAt: Date;
}

export interface PrepPacket {
  attendeeProfiles: string[];
  lastInteractions: string[];
  openItems: string[];
  agenda: string[];
  talkingPoints: string[];
  documents: string[];
}

export interface Message {
  id: string;
  channel: MessageChannel;
  senderId: string;
  recipientId: string;
  entityId: string;
  threadId?: string;
  subject?: string;
  body: string;
  triageScore: number; // 1-10
  intent?: string;
  sensitivity: Sensitivity;
  draftStatus?: 'DRAFT' | 'APPROVED' | 'SENT';
  attachments: Attachment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
  size: number;
}

export interface Document {
  id: string;
  title: string;
  entityId: string;
  type: DocumentType;
  version: number;
  templateId?: string;
  citations: Citation[];
  content?: string;
  status: 'DRAFT' | 'REVIEW' | 'APPROVED' | 'SIGNED' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

export interface Citation {
  id: string;
  sourceType: 'DOCUMENT' | 'MESSAGE' | 'KNOWLEDGE' | 'WEB';
  sourceId: string;
  excerpt: string;
}

export interface KnowledgeEntry {
  id: string;
  content: string;
  tags: string[];
  entityId: string;
  source: string;
  linkedEntities: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Workflow {
  id: string;
  name: string;
  entityId: string;
  triggers: { type: WorkflowTrigger; config: Record<string, unknown> }[];
  steps: WorkflowStep[];
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT' | 'ARCHIVED';
  lastRun?: Date;
  successRate: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkflowStep {
  id: string;
  type: 'ACTION' | 'CONDITION' | 'AI_DECISION' | 'HUMAN_APPROVAL' | 'DELAY';
  config: Record<string, unknown>;
  nextStepId?: string;
  errorStepId?: string;
}

export interface Call {
  id: string;
  entityId: string;
  contactId?: string;
  direction: CallDirection;
  personaId?: string;
  scriptId?: string;
  outcome?: CallOutcome;
  transcript?: string;
  recordingUrl?: string;
  sentiment?: number; // -1 to 1
  duration?: number; // seconds
  actionItems: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Rule {
  id: string;
  name: string;
  scope: 'GLOBAL' | 'ENTITY' | 'PROJECT' | 'CONTACT' | 'CHANNEL';
  entityId?: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  precedence: number;
  createdBy: ActionActor;
  version: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActionLog {
  id: string;
  actor: ActionActor;
  actorId?: string;
  actionType: string;
  target: string;
  reason: string;
  blastRadius: BlastRadius;
  reversible: boolean;
  rollbackPath?: string;
  status: 'PENDING' | 'EXECUTED' | 'ROLLED_BACK' | 'FAILED';
  cost?: number;
  timestamp: Date;
}

export interface FinancialRecord {
  id: string;
  entityId: string;
  type: FinancialRecordType;
  amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  dueDate?: Date;
  category: string;
  vendor?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConsentReceipt {
  id: string;
  actionId: string;
  description: string;
  reason: string;
  impacted: string[];
  reversible: boolean;
  rollbackLink?: string;
  confidence: number; // 0-1
  timestamp: Date;
}

export interface MemoryEntry {
  id: string;
  userId: string;
  type: MemoryType;
  content: string;
  context: string;
  strength: number; // 0-1, decays over time
  lastAccessed: Date;
  createdAt: Date;
}

// --- API Response Types ---

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  timestamp: string;
}

// --- Module Registry ---

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'ACTIVE' | 'DISABLED' | 'BETA';
  dependencies: string[];
}
