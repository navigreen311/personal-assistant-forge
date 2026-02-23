// ============================================================================
// Shadow Voice Agent — Session & Chat Interface Types
// Types for voice session lifecycle, WebSocket-style chat, and API contracts.
// ============================================================================

// --- Session Types ---

export type SessionStatus = 'active' | 'paused' | 'ended';
export type SessionChannel = 'web' | 'phone' | 'mobile';

export interface ChannelHistoryEntry {
  channel: SessionChannel;
  enteredAt: string; // ISO datetime
  exitedAt?: string; // ISO datetime
}

export interface VoiceSession {
  id: string;
  userId: string;
  status: SessionStatus;
  currentChannel: SessionChannel;
  channelHistory: ChannelHistoryEntry[];
  activeEntityId?: string | null;
  currentPage?: string | null;
  currentWorkflowId?: string | null;
  currentWorkflowStep?: number | null;
  recordingUrls: string[];
  fullTranscript?: string | null;
  aiSummary?: string | null;
  approvals: unknown[];
  startedAt: Date;
  lastActivityAt: Date;
  endedAt?: Date | null;
  totalDurationSeconds: number;
  messageCount: number;
}

export interface SessionOutcome {
  id: string;
  sessionId: string;
  decisionsMade: unknown[];
  commitments: unknown[];
  deadlinesSet: unknown[];
  followUps: unknown[];
  recordsCreated: unknown[];
  recordsUpdated: unknown[];
  recordsLinked: unknown[];
  extractionConfidence?: number | null;
  userVerified: boolean;
  createdAt: Date;
}

// --- Chat Types ---

export type WebChatMessageType =
  | 'text'
  | 'action_response'
  | 'ping'
  | 'end_session';

export interface WebChatIncoming {
  type: WebChatMessageType;
  content?: string;
  sessionId?: string;
  actionId?: string;
  actionResponse?: string;
}

export interface ActionCard {
  id: string;
  type: string;
  title: string;
  description: string;
  requiresConfirmation: boolean;
  metadata?: Record<string, unknown>;
}

export interface WebChatResponsePayload {
  text: string;
  contentType: 'text' | 'markdown' | 'action_card' | 'mixed';
  citations?: string[];
  actionCards?: ActionCard[];
}

export interface WebChatResponse {
  sessionId: string;
  messageId?: string;
  response: WebChatResponsePayload;
  timestamp: string;
}

// --- Session Message (persisted in ShadowMessage) ---

export interface SessionMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: string;
  intent?: string | null;
  toolsUsed: string[];
  actionsTaken: unknown[];
  audioUrl?: string | null;
  channel: string;
  confidence?: number | null;
  latencyMs?: number | null;
  telemetry?: Record<string, unknown> | null;
  createdAt: Date;
}

// --- Session List Params ---

export interface ListSessionsParams {
  limit?: number;
  offset?: number;
  status?: string;
}

export interface ListSessionsResult {
  sessions: VoiceSession[];
  total: number;
}

// --- Start Session Params ---

export interface StartSessionParams {
  userId: string;
  channel: SessionChannel;
  entityId?: string;
  currentPage?: string;
}

// --- Cleanup Result ---

export interface CleanupResult {
  paused: number;
  ended: number;
}

// --- Agent Response (from ShadowAgent) ---

export interface AgentResponse {
  text: string;
  contentType: 'text' | 'markdown' | 'action_card' | 'mixed';
  citations?: string[];
  actionCards?: ActionCard[];
  intent?: string;
  toolsUsed?: string[];
  actionsTaken?: unknown[];
  confidence?: number;
}

// --- Conversation Detail ---

export interface ConversationDetail extends VoiceSession {
  messages: SessionMessage[];
  outcome?: SessionOutcome | null;
}
