// ============================================================================
// Capture Module — Type Definitions
// Items, routing, batch sessions, offline queue, and latency metrics
// ============================================================================

export type CaptureSource =
  | 'VOICE'
  | 'SCREENSHOT'
  | 'CLIPBOARD'
  | 'SHARE_SHEET'
  | 'BROWSER_EXTENSION'
  | 'EMAIL_FORWARD'
  | 'SMS_BRIDGE'
  | 'DESKTOP_TRAY'
  | 'CAMERA_SCAN'
  | 'MANUAL';

export type CaptureContentType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'URL'
  | 'DOCUMENT'
  | 'BUSINESS_CARD'
  | 'RECEIPT'
  | 'WHITEBOARD'
  | 'SCREENSHOT';

export interface CaptureItem {
  id: string;
  userId: string;
  entityId?: string;
  source: CaptureSource;
  contentType: CaptureContentType;
  rawContent: string; // original text, base64 image, audio URL, etc.
  processedContent?: string; // extracted/transcribed text
  metadata: CaptureMetadata;
  routingResult?: RoutingResult;
  status: 'PENDING' | 'PROCESSING' | 'ROUTED' | 'FAILED' | 'ARCHIVED';
  offlineCreatedAt?: Date; // when captured offline
  syncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CaptureMetadata {
  sourceApp?: string;
  sourceUrl?: string;
  deviceInfo?: string;
  geolocation?: { lat: number; lng: number };
  ocrConfidence?: number;
  transcriptionConfidence?: number;
  processingTimeMs?: number;
}

export interface RoutingResult {
  targetType: 'TASK' | 'CONTACT' | 'NOTE' | 'EVENT' | 'MESSAGE' | 'EXPENSE';
  targetId?: string; // ID of created entity
  entityId: string;
  projectId?: string;
  priority?: 'P0' | 'P1' | 'P2';
  confidence: number;
  appliedRules: string[]; // rule IDs that matched
}

export interface RoutingRule {
  id: string;
  /**
   * P-13: the user who owns this rule. `undefined` marks a built-in default
   * that every tenant sees. Rules used to live in one process-global array with
   * no owner at all, so a rule added by one tenant was evaluated against every
   * other tenant's captures -- and a rule's `actions.entityId` decides which
   * entity the resulting Task/Contact/Note is written into.
   */
  userId?: string;
  name: string;
  conditions: RoutingCondition[];
  actions: RoutingAction;
  priority: number; // higher = evaluated first
  isActive: boolean;
}

export interface RoutingCondition {
  field: 'source' | 'contentType' | 'content' | 'sender' | 'keyword';
  operator: 'equals' | 'contains' | 'matches' | 'startsWith';
  value: string;
}

export interface RoutingAction {
  targetType: RoutingResult['targetType'];
  entityId?: string;
  projectId?: string;
  priority?: 'P0' | 'P1' | 'P2';
  tags?: string[];
}

export interface BatchCaptureSession {
  id: string;
  userId: string;
  /** P-13: the proven entity every item in this batch is filed against. */
  entityId?: string;
  items: CaptureItem[];
  status: 'ACTIVE' | 'COMPLETED';
  startedAt: Date;
  completedAt?: Date;
}

export interface OfflineSyncQueue {
  items: CaptureItem[];
  lastSyncAttempt?: Date;
  retryCount: number;
}

export interface CaptureLatencyMetrics {
  /** P-13: whose capture produced this sample. `/api/capture/metrics` used to
   *  take a `?userId=` off the query string AND ignore it, returning every
   *  tenant's latency samples to anyone signed in. */
  userId: string;
  captureToProcessedMs: number;
  processedToRoutedMs: number;
  totalMs: number;
  source: CaptureSource;
  contentType: CaptureContentType;
  timestamp: Date;
}

export interface SuggestedAction {
  type: 'CREATE_TASK' | 'CREATE_CONTACT' | 'ADD_NOTE' | 'CREATE_EVENT';
  data: Record<string, string>;
  confidence: number;
}
