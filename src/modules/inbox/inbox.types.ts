import type {
  Message,
  MessageChannel,
  Sensitivity,
  Tone,
  Contact,
} from '@/shared/types';

// --- Triage Types ---

export interface TriageResult {
  messageId: string;
  urgencyScore: number; // 1-10
  intent: MessageIntent;
  sensitivity: Sensitivity;
  category: MessageCategory;
  suggestedPriority: 'P0' | 'P1' | 'P2';
  suggestedAction: SuggestedAction;
  reasoning: string;
  confidence: number; // 0-1
  flags: TriageFlag[];
}

export type MessageIntent =
  | 'INQUIRY'
  | 'REQUEST'
  | 'UPDATE'
  | 'URGENT'
  | 'FYI'
  | 'COMPLAINT'
  | 'FOLLOW_UP'
  | 'INTRODUCTION'
  | 'SCHEDULING'
  | 'FINANCIAL'
  | 'APPROVAL'
  | 'SOCIAL';

export type MessageCategory =
  | 'OPERATIONS'
  | 'SALES'
  | 'FINANCE'
  | 'LEGAL'
  | 'HR'
  | 'MARKETING'
  | 'SUPPORT'
  | 'PERSONAL'
  | 'COMPLIANCE'
  | 'EXECUTIVE';

export type SuggestedAction =
  | 'RESPOND_IMMEDIATELY'
  | 'RESPOND_TODAY'
  | 'RESPOND_THIS_WEEK'
  | 'DELEGATE'
  | 'ARCHIVE'
  | 'FLAG_FOR_REVIEW'
  | 'SCHEDULE_FOLLOW_UP'
  | 'NO_ACTION';

export interface TriageFlag {
  type:
    | 'VIP_SENDER'
    | 'DEADLINE_MENTIONED'
    | 'MONEY_MENTIONED'
    | 'LEGAL_LANGUAGE'
    | 'PHI_DETECTED'
    | 'PII_DETECTED'
    | 'SENTIMENT_NEGATIVE'
    | 'THREAD_ESCALATION'
    | 'COMPLIANCE_RISK';
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

// --- Draft Types ---

export interface DraftRequest {
  messageId: string;
  entityId: string;
  tone?: Tone;
  intent?: string;
  constraints?: string[];
  includeDisclaimer?: boolean;
  maxLength?: number;
}

export interface DraftResponse {
  messageId: string;
  draftBody: string;
  tone: Tone;
  confidenceScore: number; // 0-1
  complianceNotes: string[];
  suggestedSubject?: string;
  alternatives: {
    tone: Tone;
    body: string;
  }[];
}

// --- Inbox View Types ---

export interface InboxItem {
  message: Message;
  senderName: string;
  senderContact?: Contact;
  entityName: string;
  threadMessages?: Message[];
  triageResult?: TriageResult;
  draft?: DraftResponse;
  isRead: boolean;
  isStarred: boolean;
  followUp?: FollowUpReminder;
}

export interface InboxFilters {
  entityId?: string;
  channel?: MessageChannel;
  minTriageScore?: number;
  maxTriageScore?: number;
  intent?: MessageIntent;
  category?: MessageCategory;
  sensitivity?: Sensitivity;
  dateFrom?: Date;
  dateTo?: Date;
  isRead?: boolean;
  isStarred?: boolean;
  search?: string;
  threadId?: string;
}

export interface InboxListParams extends InboxFilters {
  page?: number;
  pageSize?: number;
  sortBy?: 'triageScore' | 'createdAt' | 'channel';
  sortOrder?: 'asc' | 'desc';
}

export interface InboxStats {
  total: number;
  unread: number;
  urgent: number;
  needsResponse: number;
  byChannel: Record<MessageChannel, number>;
  byCategory: Record<MessageCategory, number>;
  avgTriageScore: number;
}

// --- Follow-Up Types ---

export interface FollowUpReminder {
  id: string;
  messageId: string;
  entityId: string;
  reminderAt: Date;
  reason: string;
  status: 'PENDING' | 'COMPLETED' | 'SNOOZED' | 'CANCELLED';
  createdAt: Date;
}

export interface CreateFollowUpInput {
  messageId: string;
  entityId: string;
  reminderAt: Date;
  reason?: string;
}

// --- Batch Triage Types ---

export interface BatchTriageRequest {
  entityId: string;
  messageIds?: string[];
  maxMessages?: number;
}

export interface BatchTriageResult {
  processed: number;
  results: TriageResult[];
  summary: {
    urgent: number;
    needsResponse: number;
    canArchive: number;
    flagged: number;
  };
  processingTimeMs: number;
}

// --- Canned Response Types ---

export interface CannedResponse {
  id: string;
  name: string;
  entityId: string;
  channel: MessageChannel;
  category: string;
  subject?: string;
  body: string;
  variables: string[];
  tone: Tone;
  usageCount: number;
  lastUsed?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCannedResponseInput {
  name: string;
  entityId: string;
  channel: MessageChannel;
  category: string;
  subject?: string;
  body: string;
  variables?: string[];
  tone: Tone;
}
