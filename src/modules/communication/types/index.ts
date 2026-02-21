// ============================================================================
// Communication Module — Type Definitions
// Module-specific types for AI Communication Hub + CRM
// ============================================================================

import type { MessageChannel, Tone } from '@/shared/types';

// --- Relationship Intelligence ---

export interface RelationshipNode {
  contactId: string;
  name: string;
  score: number;
  connectionStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'DORMANT';
  lastInteraction: Date | null;
  interactionCount: number;
  edges: RelationshipEdge[];
}

export interface RelationshipEdge {
  targetContactId: string;
  relationship: string;
  strength: number;
}

export interface GhostingAnalysis {
  isGhosting: boolean;
  daysSinceLastContact: number;
  averageCadenceDays: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedAction: string;
}

export interface ReengagementStrategy {
  approach: string;
  suggestedMessage: string;
  bestChannel: MessageChannel;
  bestTime: string;
}

// --- Drafting Engine ---

export interface RecipientAnalysis {
  preferredTone: Tone;
  preferredChannel: MessageChannel;
  responseRate: number;
  averageResponseTime: string;
  topTopics: string[];
}

export interface PowerDynamicAnalysis {
  dynamic: 'AUTHORITY' | 'PEER' | 'SUBORDINATE' | 'CLIENT' | 'VENDOR';
  recommendation: string;
}

export interface DraftRequest {
  recipientId: string;
  entityId: string;
  channel: MessageChannel;
  intent: string;
  tone: Tone;
  context?: string;
  replyToMessageId?: string;
}

export interface DraftVariant {
  id: string;
  label: string;
  subject?: string;
  body: string;
  tone: Tone;
  wordCount: number;
  readingLevel: string;
  complianceFlags: string[];
}

export interface DraftResponse {
  variants: DraftVariant[];
  recipientProfile: RecipientAnalysis;
  powerDynamicNote?: string;
}

// --- Compliance ---

export interface ComplianceScanResult {
  passed: boolean;
  flags: ComplianceFlag[];
}

export interface ComplianceFlag {
  severity: 'WARNING' | 'ERROR';
  rule: string;
  excerpt: string;
  suggestion: string;
}

// --- Tone Analyzer ---

export interface ToneAnalysis {
  detectedTone: Tone;
  confidence: number;
  suggestions: string[];
  formality: number;
  assertiveness: number;
  empathy: number;
}

// --- Follow-Up Cadence ---

export type CadenceFrequency = 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface FollowUpCadence {
  contactId: string;
  frequency: CadenceFrequency;
  nextDue: Date;
  escalationAfterMisses: number;
  isOverdue: boolean;
}

// --- Broadcast ---

export interface BroadcastRequest {
  entityId: string;
  recipientIds: string[];
  template: string;
  mergeFields: Record<string, string>[];
  channel: MessageChannel;
  scheduledAt?: Date;
}

export interface BroadcastResult {
  totalSent: number;
  totalFailed: number;
  failures: { contactId: string; reason: string }[];
}
